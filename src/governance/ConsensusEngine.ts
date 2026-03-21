import { randomUUID } from 'crypto';
import AnthropicBedrock from '@anthropic-ai/bedrock-sdk';
import { CONFIG } from '../config/index.js';
import type {
  AgentProfile,
  ConsensusType,
  ConsensusVote,
  ConsensusMessage,
  ConsensusSession,
  NetworkPolicy,
  LendNetEvent,
} from '../config/types.js';

const consensusTool = {
  name: 'consensus_response',
  description: 'Submit your position and vote on the governance proposal',
  input_schema: {
    type: 'object' as const,
    properties: {
      position: {
        type: 'string',
        description: 'Your argument/stance on the proposal (2-3 sentences)',
      },
      vote: {
        type: 'string',
        enum: ['APPROVE', 'DENY', 'ABSTAIN'],
        description: 'Your vote on the proposal',
      },
      suggested_value: {
        type: 'number',
        description: 'If applicable, your suggested numeric value (e.g. interest rate, collateral %)',
      },
      reasoning: {
        type: 'string',
        description: 'Detailed reasoning for your vote',
      },
    },
    required: ['position', 'vote', 'reasoning'],
    additionalProperties: false,
  },
};

interface AgentResponse {
  position: string;
  vote: ConsensusVote;
  suggested_value?: number;
  reasoning: string;
}

/**
 * Multi-agent consensus engine for decentralized AI governance.
 *
 * All agents participate in a 3-phase process:
 *   1. DELIBERATION — Each agent independently evaluates the proposal
 *   2. DISCUSSION — Agents see others' positions and can revise
 *   3. VOTE — Final vote, simple majority wins
 *
 * Requires 3+ agents to activate.
 */
export class ConsensusEngine {
  private client: AnthropicBedrock;
  private sessions: Map<string, ConsensusSession> = new Map();
  private currentPolicy: NetworkPolicy;
  private eventListeners: Array<(event: LendNetEvent) => void> = [];

  constructor() {
    this.client = new AnthropicBedrock({ awsRegion: CONFIG.awsRegion });
    this.currentPolicy = {
      baseInterestRate: 10,
      minCollateralPercent: 30,
      maxLoanAmount: 500,
      lastUpdated: Date.now(),
      reasoning: 'Default network policy — no consensus sessions held yet.',
    };
  }

  onEvent(listener: (event: LendNetEvent) => void): void {
    this.eventListeners.push(listener);
  }

  private emit(event: LendNetEvent): void {
    for (const listener of this.eventListeners) {
      listener(event);
    }
  }

  getPolicy(): NetworkPolicy {
    return { ...this.currentPolicy };
  }

  getAllSessions(): ConsensusSession[] {
    return Array.from(this.sessions.values());
  }

  getSession(id: string): ConsensusSession | undefined {
    return this.sessions.get(id);
  }

  /**
   * Run a full consensus session with all agents.
   * Phases: DELIBERATION → DISCUSSION → VOTE
   */
  async runConsensus(
    type: ConsensusType,
    topic: string,
    context: Record<string, unknown>,
    agents: AgentProfile[],
  ): Promise<ConsensusSession> {
    if (agents.length < 3) {
      throw new Error('Consensus requires at least 3 agents');
    }

    const session: ConsensusSession = {
      id: `GOV-${randomUUID().slice(0, 8).toUpperCase()}`,
      type,
      topic,
      context,
      participants: agents.map((a) => a.id),
      messages: [],
      outcome: null,
      startedAt: Date.now(),
    };

    this.sessions.set(session.id, session);
    this.emit({ type: 'governance_started', session });
    console.log(`\n[Governance] ${type}: "${topic}" — ${agents.length} agents participating`);

    // Phase 1: DELIBERATION — each agent evaluates independently
    console.log('[Governance] Phase 1: DELIBERATION');
    const deliberations: AgentResponse[] = [];
    for (const agent of agents) {
      const prompt = this.buildDeliberationPrompt(type, topic, context, agent);
      const response = await this.callAgent(prompt);
      deliberations.push(response);

      const msg: ConsensusMessage = {
        round: 1,
        phase: 'DELIBERATION',
        agentId: agent.id,
        agentName: agent.name,
        agentRole: agent.role,
        position: response.position,
        reasoning: response.reasoning,
        timestamp: Date.now(),
      };
      session.messages.push(msg);
      this.emit({ type: 'governance_message', sessionId: session.id, message: msg });
      console.log(`  [${agent.name}] ${response.position}`);
    }

    // Phase 2: DISCUSSION + VOTE (merged to save API calls)
    // Agents see others' positions, discuss, and cast final vote in one call
    console.log('[Governance] Phase 2: DISCUSSION & VOTE');
    const discussions: AgentResponse[] = [];
    const votes: Record<string, ConsensusVote> = {};
    const deliberationSummary = deliberations
      .map((d, i) => `${agents[i].name} (${agents[i].role}): "${d.position}" — Vote: ${d.vote}`)
      .join('\n');

    for (const agent of agents) {
      const prompt = this.buildDiscussionAndVotePrompt(type, topic, agent, deliberationSummary);
      const response = await this.callAgent(prompt);
      discussions.push(response);
      votes[agent.id] = response.vote;

      const msg: ConsensusMessage = {
        round: 2,
        phase: 'VOTE',
        agentId: agent.id,
        agentName: agent.name,
        agentRole: agent.role,
        position: response.position,
        vote: response.vote,
        reasoning: response.reasoning,
        timestamp: Date.now(),
      };
      session.messages.push(msg);
      this.emit({ type: 'governance_message', sessionId: session.id, message: msg });
      console.log(`  [${agent.name}] VOTE: ${response.vote} — ${response.position}`);
    }

    // Tally votes — simple majority
    const approvals = Object.values(votes).filter((v) => v === 'APPROVE').length;
    const denials = Object.values(votes).filter((v) => v === 'DENY').length;
    const passed = approvals > denials;

    // Build outcome reasoning from majority positions
    const majorityVote = passed ? 'APPROVE' : 'DENY';
    const majorityAgents = agents.filter((a) => votes[a.id] === majorityVote);
    const outcomeReasoning = discussions
      .filter((_, i) => votes[agents[i].id] === majorityVote)
      .map((d) => d.reasoning)
      .join(' | ');

    session.outcome = {
      decision: passed ? 'PASSED' : 'REJECTED',
      votes,
      passed,
      reasoning: `${approvals} APPROVE, ${denials} DENY. ${outcomeReasoning}`,
    };
    session.completedAt = Date.now();

    console.log(`[Governance] Result: ${session.outcome.decision} (${approvals}/${agents.length} approved)`);

    // Apply policy changes if passed and it's a rate committee session
    if (passed && type === 'rate_committee') {
      this.applyRateCommitteeResult(discussions, agents);
    }

    this.emit({ type: 'governance_completed', session });
    return session;
  }

  /**
   * Rate Committee: compute new policy from agent suggestions
   */
  private applyRateCommitteeResult(responses: AgentResponse[], agents: AgentProfile[]): void {
    const suggestions = responses
      .filter((r) => r.suggested_value != null)
      .map((r) => r.suggested_value!);

    if (suggestions.length > 0) {
      // Use median of suggestions for stability
      suggestions.sort((a, b) => a - b);
      const median = suggestions[Math.floor(suggestions.length / 2)];

      this.currentPolicy = {
        ...this.currentPolicy,
        baseInterestRate: Math.round(median * 10) / 10,
        lastUpdated: Date.now(),
        reasoning: `Set by consensus of ${agents.length} agents. Median suggested rate: ${median}%.`,
      };
      console.log(`[Governance] New base rate: ${this.currentPolicy.baseInterestRate}%`);
    }
  }

  private async callAgent(systemPrompt: string): Promise<AgentResponse> {
    const response = await this.client.messages.create({
      model: CONFIG.claudeHaiku,
      max_tokens: 300,
      system: systemPrompt,
      tools: [consensusTool],
      tool_choice: { type: 'tool' as const, name: 'consensus_response' },
      messages: [{ role: 'user', content: 'Evaluate the proposal and submit your response.' }],
    });

    const toolBlock = response.content.find((b: any) => b.type === 'tool_use');
    if (!toolBlock || toolBlock.type !== 'tool_use') {
      throw new Error('Agent did not return a consensus response');
    }
    return toolBlock.input as AgentResponse;
  }

  // ─── Prompt Builders ──────────────────────────────────

  private buildDeliberationPrompt(
    type: ConsensusType,
    topic: string,
    context: Record<string, unknown>,
    agent: AgentProfile,
  ): string {
    const base = `You are ${agent.name}, a ${agent.role.toUpperCase()} agent in the LendNet P2P lending network.
You are participating in a GOVERNANCE CONSENSUS session.
Your credit score is ${agent.creditScore}/850.

YOUR ROLE INTERESTS:
${agent.role === 'lender' || agent.role === 'both' ? '- As a lender, you prefer HIGHER interest rates and MORE collateral to protect capital.' : ''}
${agent.role === 'borrower' || agent.role === 'both' ? '- As a borrower, you prefer LOWER interest rates and LESS collateral for easier access to loans.' : ''}

PROPOSAL: "${topic}"
TYPE: ${type}

NETWORK DATA:
${JSON.stringify(context, null, 2)}

CURRENT POLICY:
- Base Interest Rate: ${this.currentPolicy.baseInterestRate}%
- Min Collateral: ${this.currentPolicy.minCollateralPercent}%
- Max Loan Amount: $${this.currentPolicy.maxLoanAmount}

This is Phase 1 (DELIBERATION). Form your INDEPENDENT opinion. Argue from your role's perspective.
Keep your position to 1-2 sentences and reasoning to 2-3 sentences.
${type === 'rate_committee' ? 'Include a suggested_value for the new base interest rate.' : ''}
${type === 'loan_approval' ? 'Vote APPROVE to fund this loan, DENY to reject it, or ABSTAIN.' : ''}
${type === 'dispute_resolution' ? 'Vote APPROVE to grant leniency (extend/restructure), DENY to enforce default.' : ''}`;

    return base;
  }

  private buildDiscussionAndVotePrompt(
    type: ConsensusType,
    topic: string,
    agent: AgentProfile,
    otherPositions: string,
  ): string {
    return `You are ${agent.name}, a ${agent.role.toUpperCase()} agent in LendNet.

PROPOSAL: "${topic}"

OTHER AGENTS' POSITIONS:
${otherPositions}

You've seen what others think. Consider their arguments, then cast your FINAL VOTE:
- APPROVE: You support the proposal
- DENY: You reject the proposal
- ABSTAIN: You choose not to vote

Keep position to 1-2 sentences. Be decisive. Simple majority wins.
${type === 'rate_committee' ? 'Include a suggested_value for the new base interest rate.' : ''}`;
  }
}
