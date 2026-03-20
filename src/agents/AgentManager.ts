import { randomUUID } from 'crypto';
import { AgentWalletManager } from '../wallet/WalletManager.js';
import { CreditScorer } from '../credit/CreditScorer.js';
import { NegotiationEngine } from '../negotiation/NegotiationEngine.js';
import { LoanManager } from '../loans/LoanManager.js';
import type {
  AgentProfile,
  AgentReputation,
  CreditReport,
  LoanRequest,
  WalletMetrics,
  LendNetEvent,
} from '../config/types.js';

const DEFAULT_REPUTATION: AgentReputation = {
  totalLoansIssued: 0,
  totalLoansBorrowed: 0,
  successfulRepayments: 0,
  defaults: 0,
  totalVolumeLent: 0,
  totalVolumeBorrowed: 0,
  avgRepaymentTime: 0,
};

/**
 * Manages the lifecycle of AI lending agents.
 * Each agent has a WDK wallet, credit profile, and autonomous decision-making via Claude.
 */
export class AgentManager {
  private agents: Map<string, AgentProfile> = new Map();
  private wallets: Map<string, AgentWalletManager> = new Map();
  private creditScorer: CreditScorer;
  private negotiationEngine: NegotiationEngine;
  private loanManager: LoanManager;
  private eventListeners: Array<(event: LendNetEvent) => void> = [];

  constructor(loanManager: LoanManager) {
    this.creditScorer = new CreditScorer();
    this.negotiationEngine = new NegotiationEngine();
    this.loanManager = loanManager;
  }

  onEvent(listener: (event: LendNetEvent) => void): void {
    this.eventListeners.push(listener);
  }

  private emit(event: LendNetEvent): void {
    for (const listener of this.eventListeners) {
      listener(event);
    }
  }

  /**
   * Create a new agent with a fresh WDK wallet.
   */
  async createAgent(
    name: string,
    role: 'lender' | 'borrower' | 'both',
    existingSeed?: string
  ): Promise<AgentProfile> {
    const seed = existingSeed || AgentWalletManager.generateSeed();
    const wallet = new AgentWalletManager(seed);
    const address = await wallet.initialize();

    const agent: AgentProfile = {
      id: `AGENT-${randomUUID().slice(0, 6).toUpperCase()}`,
      name,
      role,
      walletAddress: address,
      seedPhrase: seed,
      creditScore: 575, // starting score for new agents
      reputation: { ...DEFAULT_REPUTATION },
    };

    this.agents.set(agent.id, agent);
    this.wallets.set(agent.id, wallet);

    this.emit({ type: 'agent_created', agent });
    console.log(`[Agent] Created ${name} (${role}) — wallet: ${address}`);

    return agent;
  }

  /**
   * Get credit report for an agent
   */
  async getCreditReport(agentId: string): Promise<CreditReport> {
    const agent = this.getAgent(agentId);
    const wallet = this.getWallet(agentId);
    const balances = await wallet.getBalances();

    const walletMetrics: WalletMetrics = {
      address: agent.walletAddress,
      balanceUsdt: balances.balanceUsdt,
      transactionCount:
        agent.reputation.totalLoansIssued +
        agent.reputation.totalLoansBorrowed +
        agent.reputation.successfulRepayments,
      walletAgeDays: Math.max(
        1,
        Math.floor((Date.now() - 1000 * 60 * 60 * 24 * 30) / (1000 * 60 * 60 * 24))
      ), // simulate 30 days for demo
      repaymentHistory: {
        onTime: agent.reputation.successfulRepayments,
        late: 0,
        defaulted: agent.reputation.defaults,
      },
    };

    const report = this.creditScorer.score(agent, walletMetrics);

    // Update agent's stored credit score
    agent.creditScore = report.score;
    this.emit({ type: 'credit_updated', agentId, newScore: report.score });

    return report;
  }

  /**
   * Full loan flow: request -> negotiate -> fund -> track
   */
  async requestLoan(request: LoanRequest): Promise<{
    loanId: string;
    agreed: boolean;
    txHash?: string;
  }> {
    const borrower = this.getAgent(request.borrowerId);
    console.log(`\n[Loan] ${borrower.name} requests $${request.amount} — "${request.purpose}"`);

    // 1. Create loan record
    const loan = this.loanManager.createLoan(request);

    // 2. Find best available lender
    const lender = this.findBestLender(request);
    if (!lender) {
      console.log('[Loan] No available lender found');
      return { loanId: loan.id, agreed: false };
    }
    console.log(`[Loan] Matched with lender: ${lender.name}`);

    // 3. Credit check
    const creditReport = await this.getCreditReport(request.borrowerId);
    console.log(`[Credit] Score: ${creditReport.score} (${creditReport.riskLevel})`);

    // 4. Negotiate terms via LLM
    const lenderBalance = await this.getWallet(lender.id).getUsdtBalance();
    console.log(`[Negotiation] Starting negotiation...`);
    const negotiation = await this.negotiationEngine.negotiate(
      request,
      creditReport,
      lenderBalance
    );

    // 5. Record negotiation result
    this.loanManager.setNegotiationResult(
      loan.id,
      lender.id,
      negotiation.agreed,
      negotiation.finalTerms,
      negotiation.log
    );

    if (!negotiation.agreed || !negotiation.finalTerms) {
      console.log('[Loan] Negotiation failed — no agreement reached');
      return { loanId: loan.id, agreed: false };
    }

    console.log(
      `[Loan] Terms agreed: $${negotiation.finalTerms.amount} @ ${negotiation.finalTerms.interestRate}% with ${negotiation.finalTerms.collateralPercent}% collateral`
    );

    // 6. Execute funding via WDK
    const lenderWallet = this.getWallet(lender.id);
    const borrowerWallet = this.getWallet(borrower.id);

    try {
      const transferResult = await lenderWallet.transferUsdt(
        borrower.walletAddress,
        negotiation.finalTerms.amount
      );

      this.loanManager.recordFunding(loan.id, transferResult.hash);

      // Update reputations
      lender.reputation.totalLoansIssued++;
      lender.reputation.totalVolumeLent += negotiation.finalTerms.amount;
      borrower.reputation.totalLoansBorrowed++;
      borrower.reputation.totalVolumeBorrowed += negotiation.finalTerms.amount;

      console.log(`[Funded] TX: ${transferResult.hash}`);

      return { loanId: loan.id, agreed: true, txHash: transferResult.hash };
    } catch (error: any) {
      console.error(`[Loan] Funding failed: ${error.message}`);
      return { loanId: loan.id, agreed: false };
    }
  }

  /**
   * Process a loan repayment from borrower to lender
   */
  async repayLoan(
    loanId: string,
    amount?: number
  ): Promise<{ txHash: string; remaining: number }> {
    const loan = this.loanManager.getLoan(loanId);
    const totalOwed = this.loanManager.getTotalOwed(loan);
    const remaining = totalOwed - loan.totalRepaid;
    const repayAmount = amount || remaining; // full repayment by default

    const borrowerWallet = this.getWallet(loan.borrowerId);
    const lender = this.getAgent(loan.lenderId);

    console.log(`[Repayment] ${loan.borrowerId} repaying $${repayAmount} on ${loanId}`);

    const result = await borrowerWallet.transferUsdt(
      lender.walletAddress,
      repayAmount
    );

    const updatedLoan = this.loanManager.recordRepayment(
      loanId,
      repayAmount,
      result.hash
    );

    // Update reputation on completion
    if (updatedLoan.status === 'completed') {
      const borrower = this.getAgent(loan.borrowerId);
      borrower.reputation.successfulRepayments++;
      console.log(`[Loan] ${loanId} COMPLETED — borrower reputation updated`);
    }

    const newRemaining = totalOwed - updatedLoan.totalRepaid;
    console.log(`[Repayment] TX: ${result.hash} — remaining: $${newRemaining.toFixed(2)}`);

    return { txHash: result.hash, remaining: newRemaining };
  }

  /**
   * Find the best available lender for a loan request
   */
  private findBestLender(request: LoanRequest): AgentProfile | null {
    const candidates = Array.from(this.agents.values()).filter(
      (a) =>
        (a.role === 'lender' || a.role === 'both') &&
        a.id !== request.borrowerId
    );

    if (candidates.length === 0) return null;

    // Sort by credit score (higher = more trustworthy lender)
    candidates.sort((a, b) => b.creditScore - a.creditScore);
    return candidates[0];
  }

  getAgent(id: string): AgentProfile {
    const agent = this.agents.get(id);
    if (!agent) throw new Error(`Agent ${id} not found`);
    return agent;
  }

  getWallet(agentId: string): AgentWalletManager {
    const wallet = this.wallets.get(agentId);
    if (!wallet) throw new Error(`Wallet for agent ${agentId} not found`);
    return wallet;
  }

  getAllAgents(): AgentProfile[] {
    return Array.from(this.agents.values());
  }

  async getAgentStatus(agentId: string) {
    const agent = this.getAgent(agentId);
    const wallet = this.getWallet(agentId);
    const balances = await wallet.getBalances();
    const loans = this.loanManager.getLoansByAgent(agentId);

    return {
      ...agent,
      balances,
      activeLoans: loans.filter(
        (l) => !['completed', 'defaulted', 'pending'].includes(l.status)
      ),
      loanHistory: loans,
    };
  }

  dispose(): void {
    for (const wallet of this.wallets.values()) {
      wallet.dispose();
    }
  }
}
