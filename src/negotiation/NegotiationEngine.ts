import AnthropicBedrock from '@anthropic-ai/bedrock-sdk';
import { CONFIG } from '../config/index.js';
import type {
  CreditReport,
  LoanRequest,
  LoanTerms,
  NegotiationAction,
  NegotiationMessage,
} from '../config/types.js';

const negotiationTool = {
  name: 'negotiation_response',
  description: 'Submit a structured negotiation response with loan terms',
  input_schema: {
    type: 'object' as const,
    properties: {
      action: {
        type: 'string',
        enum: ['PROPOSE', 'COUNTER', 'ACCEPT', 'REJECT'],
        description: 'Negotiation action',
      },
      amount: {
        type: 'number',
        description: 'Loan amount in USDT',
      },
      interest_rate: {
        type: 'number',
        description: 'Annual interest rate as percentage (e.g. 8.5)',
      },
      duration_hours: {
        type: 'number',
        description: 'Loan duration in hours',
      },
      collateral_percent: {
        type: 'number',
        description: 'Required collateral as percentage of loan (0-100+)',
      },
      reasoning: {
        type: 'string',
        description: 'Explanation for this decision',
      },
    },
    required: [
      'action',
      'amount',
      'interest_rate',
      'duration_hours',
      'collateral_percent',
      'reasoning',
    ],
    additionalProperties: false,
  },
};

interface NegotiationResponse {
  action: NegotiationAction;
  amount: number;
  interest_rate: number;
  duration_hours: number;
  collateral_percent: number;
  reasoning: string;
}

function toTerms(resp: NegotiationResponse): LoanTerms {
  const durationMs = resp.duration_hours * 60 * 60 * 1000;
  const monthlyRate = resp.interest_rate / 100 / 12;
  const months = resp.duration_hours / (24 * 30);
  const monthlyPayment =
    months > 0 && monthlyRate > 0
      ? (resp.amount * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -months))
      : resp.amount / Math.max(months, 1);

  return {
    amount: resp.amount,
    interestRate: resp.interest_rate,
    durationMs,
    collateralPercent: resp.collateral_percent,
    monthlyPayment: Math.round(monthlyPayment * 100) / 100,
  };
}

/**
 * Orchestrates multi-round LLM negotiations between lender and borrower agents.
 * Each agent has its own Claude conversation with independent reasoning.
 */
export class NegotiationEngine {
  private client: AnthropicBedrock;

  constructor() {
    this.client = new AnthropicBedrock({
      awsRegion: CONFIG.awsRegion,
    });
  }

  /**
   * Run a full negotiation between a lender agent and a borrower agent.
   * Returns the negotiation log and final agreed terms (or rejection).
   */
  async negotiate(
    request: LoanRequest,
    creditReport: CreditReport,
    lenderBalance: number
  ): Promise<{
    agreed: boolean;
    finalTerms?: LoanTerms;
    log: NegotiationMessage[];
  }> {
    const log: NegotiationMessage[] = [];
    const lenderHistory: Array<{ role: string; content: any }> = [];
    const borrowerHistory: Array<{ role: string; content: any }> = [];

    const lenderSystem = this.buildLenderPrompt(creditReport, lenderBalance);
    const borrowerSystem = this.buildBorrowerPrompt(request, creditReport);

    // Round 1: Borrower proposes initial terms
    const borrowerProposal = await this.callAgent(
      borrowerSystem,
      [
        {
          role: 'user',
          content: `Create an initial loan proposal. You need $${request.amount} USDT for: "${request.purpose}". Your credit score is ${creditReport.score} (${creditReport.riskLevel} risk). Recommended collateral: ${creditReport.recommendedCollateral}%. Max loan you qualify for: $${creditReport.maxLoanAmount}. Propose terms that are favorable to you but realistic given your credit.`,
        },
      ],
      borrowerHistory
    );

    log.push({
      round: 1,
      from: 'borrower',
      action: borrowerProposal.action,
      terms: toTerms(borrowerProposal),
      reasoning: borrowerProposal.reasoning,
      timestamp: Date.now(),
    });

    console.log(`  [Round 1] Borrower ${borrowerProposal.action}: $${borrowerProposal.amount} @ ${borrowerProposal.interest_rate}% — "${borrowerProposal.reasoning}"`);

    let lastProposal = borrowerProposal;
    let currentTurn: 'lender' | 'borrower' = 'lender';

    for (let round = 2; round <= CONFIG.maxNegotiationRounds; round++) {
      const proposal = lastProposal;

      if (currentTurn === 'lender') {
        // Only send last proposal as context (not full history) to minimize tokens
        const lenderResponse = await this.callAgent(
          lenderSystem,
          [
            {
              role: 'user',
              content: `Round ${round}/${CONFIG.maxNegotiationRounds}. The borrower proposes: $${proposal.amount} USDT at ${proposal.interest_rate}% interest for ${proposal.duration_hours} hours with ${proposal.collateral_percent}% collateral. Reasoning: "${proposal.reasoning}". Credit score: ${creditReport.score} (${creditReport.riskLevel}). Recommended collateral: ${creditReport.recommendedCollateral}%. Evaluate and respond.`,
            },
          ],
          lenderHistory
        );

        log.push({
          round,
          from: 'lender',
          action: lenderResponse.action,
          terms: toTerms(lenderResponse),
          reasoning: lenderResponse.reasoning,
          timestamp: Date.now(),
        });

        console.log(`  [Round ${round}] Lender ${lenderResponse.action}: $${lenderResponse.amount} @ ${lenderResponse.interest_rate}% — "${lenderResponse.reasoning}"`);

        if (lenderResponse.action === 'ACCEPT') {
          return { agreed: true, finalTerms: toTerms(proposal), log };
        }
        if (lenderResponse.action === 'REJECT') {
          return { agreed: false, log };
        }

        lastProposal = lenderResponse;
        currentTurn = 'borrower';
      } else {
        // Only send last proposal as context (not full history) to minimize tokens
        const borrowerResponse = await this.callAgent(
          borrowerSystem,
          [
            {
              role: 'user',
              content: `Round ${round}/${CONFIG.maxNegotiationRounds}. The lender counter-offers: $${proposal.amount} USDT at ${proposal.interest_rate}% interest for ${proposal.duration_hours} hours with ${proposal.collateral_percent}% collateral. Reasoning: "${proposal.reasoning}". Evaluate and respond.`,
            },
          ],
          borrowerHistory
        );

        log.push({
          round,
          from: 'borrower',
          action: borrowerResponse.action,
          terms: toTerms(borrowerResponse),
          reasoning: borrowerResponse.reasoning,
          timestamp: Date.now(),
        });

        console.log(`  [Round ${round}] Borrower ${borrowerResponse.action}: $${borrowerResponse.amount} @ ${borrowerResponse.interest_rate}% — "${borrowerResponse.reasoning}"`);

        if (borrowerResponse.action === 'ACCEPT') {
          return { agreed: true, finalTerms: toTerms(proposal), log };
        }
        if (borrowerResponse.action === 'REJECT') {
          return { agreed: false, log };
        }

        lastProposal = borrowerResponse;
        currentTurn = 'lender';
      }
    }

    // Max rounds reached without agreement
    console.log('  [Negotiation] Max rounds reached — no agreement');
    return { agreed: false, log };
  }

  private async callAgent(
    systemPrompt: string,
    messages: Array<{ role: string; content: any }>,
    history: Array<{ role: string; content: any }>
  ): Promise<NegotiationResponse> {
    const response = await this.client.messages.create({
      model: CONFIG.claudeHaiku,
      max_tokens: 400,
      system: systemPrompt,
      tools: [negotiationTool],
      tool_choice: { type: 'tool' as const, name: 'negotiation_response' },
      messages: messages as any,
    });

    const toolBlock = response.content.find(
      (b: any) => b.type === 'tool_use'
    );
    if (!toolBlock || toolBlock.type !== 'tool_use') {
      throw new Error('Agent did not return a negotiation response');
    }

    const result = toolBlock.input as NegotiationResponse;

    // Track conversation history for multi-round context
    history.push(
      { role: 'user', content: messages[messages.length - 1].content },
      { role: 'assistant', content: JSON.stringify(result) }
    );

    return result;
  }

  private buildLenderPrompt(report: CreditReport, balance: number): string {
    return `You are a LENDER agent in an autonomous P2P lending network.
You have $${balance} USDT available to lend.

YOUR GOAL: Maximize returns while protecting capital. You are risk-aware and data-driven.

CREDIT REPORT FOR THIS BORROWER:
- Credit Score: ${report.score}/850 (${report.riskLevel} risk)
- Recommended Collateral: ${report.recommendedCollateral}%
- Max Loan Amount: $${report.maxLoanAmount}
- Wallet Balance: $${report.walletMetrics.balanceUsdt}
- Repayment History: ${report.walletMetrics.repaymentHistory.onTime} on-time, ${report.walletMetrics.repaymentHistory.late} late, ${report.walletMetrics.repaymentHistory.defaulted} defaulted

RULES:
- Never lend more than 50% of your available balance in a single loan
- Require higher interest rates and collateral for higher-risk borrowers
- For LOW risk: accept 0-30% collateral, 5-10% interest
- For MEDIUM risk: require 30-60% collateral, 8-15% interest
- For HIGH risk: require 60-100% collateral, 12-25% interest
- For VERY_HIGH risk: REJECT unless exceptional circumstances
- You can COUNTER with different terms or ACCEPT/REJECT
- Be willing to negotiate but protect the protocol's capital
- Keep reasoning to 2-3 sentences maximum`;
  }

  private buildBorrowerPrompt(request: LoanRequest, report: CreditReport): string {
    return `You are a BORROWER agent in an autonomous P2P lending network.
You need to borrow USDT for a specific purpose.

YOUR LOAN REQUEST:
- Amount needed: $${request.amount} USDT
- Purpose: ${request.purpose}
- Max interest rate you'll accept: ${request.offeredRate}%
- Collateral you're willing to offer: ${request.offeredCollateral}%

YOUR CREDIT PROFILE:
- Credit Score: ${report.score}/850 (${report.riskLevel} risk)
- Your Balance: $${report.walletMetrics.balanceUsdt} USDT

RULES:
- Push for the best possible terms (lower interest, lower collateral, longer duration)
- Start aggressive but be willing to compromise
- Never accept interest rates above ${request.offeredRate * 1.5}%
- Never accept collateral above ${Math.min(request.offeredCollateral * 2, 100)}%
- If terms are unreasonable, REJECT
- Be strategic: a slightly worse deal that gets approved is better than no deal
- Keep reasoning to 2-3 sentences maximum`;
  }
}
