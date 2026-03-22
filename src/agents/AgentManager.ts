import { randomUUID } from 'crypto';
import { AgentWalletManager } from '../wallet/WalletManager.js';
import { CreditScorer } from '../credit/CreditScorer.js';
import { NegotiationEngine } from '../negotiation/NegotiationEngine.js';
import { ConsensusEngine } from '../governance/ConsensusEngine.js';
import { LoanManager } from '../loans/LoanManager.js';
import { LendNetToken } from '../contracts/LendNetToken.js';
import type {
  AgentProfile,
  AgentReputation,
  CreditReport,
  LoanRequest,
  WalletMetrics,
  LendNetEvent,
  ConsensusSession,
  NetworkPolicy,
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

// Starting balance minted to each new agent
const AGENT_STARTING_BALANCE = 1000;

/**
 * Manages the lifecycle of AI lending agents.
 * Each agent has a WDK wallet with real on-chain LNUSD tokens.
 * All balances are real — minted via LendNetToken on Sepolia.
 */
export class AgentManager {
  private agents: Map<string, AgentProfile> = new Map();
  private wallets: Map<string, AgentWalletManager> = new Map();
  private creditScorer: CreditScorer;
  private negotiationEngine: NegotiationEngine;
  private consensusEngine: ConsensusEngine;
  private loanManager: LoanManager;
  private token: LendNetToken;
  private eventListeners: Array<(event: LendNetEvent) => void> = [];
  private loansSinceLastRateReview: number = 0;
  private rateReviewInterval: number = 5;

  constructor(loanManager: LoanManager, token: LendNetToken) {
    this.creditScorer = new CreditScorer();
    this.negotiationEngine = new NegotiationEngine();
    this.consensusEngine = new ConsensusEngine();
    this.loanManager = loanManager;
    this.token = token;
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
   * Mints LNUSD tokens and sends ETH for gas — all on-chain.
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
      creditScore: 650, // new agents start with decent credit
      reputation: { ...DEFAULT_REPUTATION },
    };

    this.agents.set(agent.id, agent);
    this.wallets.set(agent.id, wallet);

    // Fund agent on-chain: ETH for gas + LNUSD tokens
    let mintTxHash: string | undefined;
    try {
      await this.token.fundGas(address);
      mintTxHash = await this.token.mint(address, AGENT_STARTING_BALANCE);
      console.log(`[Agent] Created ${name} (${role}) — wallet: ${address} — funded: ${AGENT_STARTING_BALANCE} LNUSD + gas`);
    } catch (err: any) {
      console.log(`[Agent] Created ${name} (${role}) — wallet: ${address} — on-chain funding failed: ${err.message}`);
    }

    this.emit({ type: 'agent_created', agent, txHash: mintTxHash, amount: mintTxHash ? AGENT_STARTING_BALANCE : undefined });
    return agent;
  }

  /**
   * Get the real on-chain LNUSD balance for an agent.
   */
  async getBalance(agentId: string): Promise<number> {
    try {
      const agent = this.getAgent(agentId);
      return await this.token.balanceOf(agent.walletAddress);
    } catch {
      return 0;
    }
  }

  async getCreditReport(agentId: string): Promise<CreditReport> {
    const agent = this.getAgent(agentId);
    const balance = await this.getBalance(agentId);

    const walletMetrics: WalletMetrics = {
      address: agent.walletAddress,
      balanceUsdt: balance,
      transactionCount:
        agent.reputation.totalLoansIssued +
        agent.reputation.totalLoansBorrowed +
        agent.reputation.successfulRepayments,
      walletAgeDays: Math.max(
        1,
        Math.floor((Date.now() - 1000 * 60 * 60 * 24 * 30) / (1000 * 60 * 60 * 24))
      ),
      repaymentHistory: {
        onTime: agent.reputation.successfulRepayments,
        late: 0,
        defaulted: agent.reputation.defaults,
      },
    };

    const report = this.creditScorer.score(agent, walletMetrics);
    agent.creditScore = report.score;
    this.emit({ type: 'credit_updated', agentId, newScore: report.score });
    return report;
  }

  /**
   * Full loan flow: request -> committee -> negotiate -> fund (all on-chain)
   */
  async requestLoan(request: LoanRequest): Promise<{
    loanId: string;
    agreed: boolean;
    txHash?: string;
  }> {
    const borrower = this.getAgent(request.borrowerId);
    console.log(`\n[Loan] ${borrower.name} requests $${request.amount} — "${request.purpose}"`);

    const loan = this.loanManager.createLoan(request);

    const lender = this.findBestLender(request);
    if (!lender) {
      console.log('[Loan] No available lender found');
      this.loanManager.rejectLoan(loan.id);
      return { loanId: loan.id, agreed: false };
    }
    console.log(`[Loan] Matched with lender: ${lender.name}`);

    const creditReport = await this.getCreditReport(request.borrowerId);
    console.log(`[Credit] Score: ${creditReport.score} (${creditReport.riskLevel})`);

    // Committee approval for risky/large loans
    if (this.needsCommitteeApproval(request, creditReport.score)) {
      console.log(`[Governance] Loan triggers committee review`);
      const approval = await this.conveenLoanApproval(borrower, creditReport, request, loan.id);
      if (!approval.outcome?.passed) {
        console.log('[Governance] Committee DENIED the loan');
        this.loanManager.rejectLoan(loan.id);
        return { loanId: loan.id, agreed: false };
      }
      console.log('[Governance] Committee APPROVED — proceeding to negotiation');
    }

    // Negotiate terms via LLM
    const lenderBalance = await this.getBalance(lender.id);
    console.log(`[Negotiation] Starting... (lender balance: $${lenderBalance})`);
    const negotiation = await this.negotiationEngine.negotiate(
      request,
      creditReport,
      lenderBalance
    );

    this.loanManager.setNegotiationResult(
      loan.id,
      lender.id,
      negotiation.agreed,
      negotiation.finalTerms,
      negotiation.log
    );

    if (!negotiation.agreed || !negotiation.finalTerms) {
      console.log('[Loan] Negotiation failed — no agreement');
      // setNegotiationResult already sets status to 'rejected' when agreed=false
      return { loanId: loan.id, agreed: false };
    }

    const amount = negotiation.finalTerms.amount;
    console.log(`[Loan] Terms agreed: $${amount} @ ${negotiation.finalTerms.interestRate}% with ${negotiation.finalTerms.collateralPercent}% collateral`);

    // Execute real on-chain funding: lender → borrower P2P transfer
    const lenderWallet = this.getWallet(lender.id);
    let txHash = '';

    try {
      const onChainBal = await lenderWallet.getUsdtBalance();
      if (onChainBal < amount) {
        console.log(`[Loan] Lender has insufficient on-chain balance ($${onChainBal} < $${amount})`);
        this.loanManager.rejectLoan(loan.id);
        return { loanId: loan.id, agreed: false };
      }

      const result = await lenderWallet.transferUsdt(borrower.walletAddress, amount);
      txHash = result.hash;
      console.log(`[Funded] On-chain P2P TX: ${txHash}`);
    } catch (err: any) {
      console.log(`[Funded] On-chain transfer failed: ${err.message}`);
      this.loanManager.rejectLoan(loan.id);
      return { loanId: loan.id, agreed: false };
    }

    this.loanManager.recordFunding(loan.id, txHash);

    // Update reputations
    lender.reputation.totalLoansIssued++;
    lender.reputation.totalVolumeLent += amount;
    borrower.reputation.totalLoansBorrowed++;
    borrower.reputation.totalVolumeBorrowed += amount;

    // Auto-trigger rate committee review every N loans
    this.loansSinceLastRateReview++;
    if (this.loansSinceLastRateReview >= this.rateReviewInterval && this.getAllAgents().length >= 3) {
      this.loansSinceLastRateReview = 0;
      this.conveneRateCommittee().catch((err) =>
        console.log(`[Governance] Auto rate review failed: ${err.message}`)
      );
    }

    return { loanId: loan.id, agreed: true, txHash };
  }

  /**
   * Process a loan repayment — real on-chain borrower → lender transfer
   */
  async repayLoan(
    loanId: string,
    amount?: number
  ): Promise<{ txHash: string; remaining: number }> {
    const loan = this.loanManager.getLoan(loanId);
    const totalOwed = this.loanManager.getTotalOwed(loan);
    const remaining = totalOwed - loan.totalRepaid;
    const repayAmount = amount || remaining;

    const lender = this.getAgent(loan.lenderId);
    const borrowerWallet = this.getWallet(loan.borrowerId);

    // Check real on-chain balance
    const borrowerBal = await borrowerWallet.getUsdtBalance();
    if (borrowerBal < repayAmount) {
      throw new Error(`Insufficient on-chain balance. Have $${borrowerBal.toFixed(2)}, need $${repayAmount.toFixed(2)}`);
    }

    console.log(`[Repayment] ${loan.borrowerId} repaying $${repayAmount} on ${loanId}`);

    // Real on-chain P2P transfer: borrower → lender
    const result = await borrowerWallet.transferUsdt(lender.walletAddress, repayAmount);
    const txHash = result.hash;
    console.log(`[Repayment] On-chain P2P TX: ${txHash}`);

    const updatedLoan = this.loanManager.recordRepayment(loanId, repayAmount, txHash);

    if (updatedLoan.status === 'completed') {
      const borrower = this.getAgent(loan.borrowerId);
      borrower.reputation.successfulRepayments++;
      console.log(`[Loan] ${loanId} COMPLETED`);
    }

    const newRemaining = totalOwed - updatedLoan.totalRepaid;
    console.log(`[Repayment] Remaining: $${newRemaining.toFixed(2)}`);
    return { txHash, remaining: newRemaining };
  }

  private findBestLender(request: LoanRequest): AgentProfile | null {
    const candidates = Array.from(this.agents.values()).filter(
      (a) =>
        (a.role === 'lender' || a.role === 'both') &&
        a.id !== request.borrowerId
    );
    if (candidates.length === 0) return null;
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
    let onChainBalances = { address: agent.walletAddress, balanceUsdt: 0, balanceEth: 0 };
    let aavePosition = null;

    try {
      onChainBalances = await wallet.getBalances();
    } catch {
      // on-chain query may fail
    }

    try {
      aavePosition = await wallet.getAavePosition();
    } catch {
      // Aave query may fail
    }

    const loans = this.loanManager.getLoansByAgent(agentId);

    return {
      ...agent,
      balances: {
        ...onChainBalances,
        balanceUsdt: onChainBalances.balanceUsdt,
        onChainUsdt: onChainBalances.balanceUsdt,
      },
      aavePosition: aavePosition ? {
        totalCollateral: aavePosition.totalCollateralBase.toString(),
        totalDebt: aavePosition.totalDebtBase.toString(),
        availableBorrows: aavePosition.availableBorrowsBase.toString(),
        healthFactor: aavePosition.healthFactor.toString(),
        ltv: aavePosition.ltv.toString(),
      } : null,
      activeLoans: loans.filter(
        (l) => !['completed', 'defaulted', 'pending', 'rejected'].includes(l.status)
      ),
      loanHistory: loans,
    };
  }

  // ─── Governance ────────────────────────────────────────

  getConsensusEngine(): ConsensusEngine {
    return this.consensusEngine;
  }

  getNetworkPolicy(): NetworkPolicy {
    return this.consensusEngine.getPolicy();
  }

  async conveneRateCommittee(): Promise<ConsensusSession> {
    const agents = this.getAllAgents();
    if (agents.length < 3) {
      throw new Error('Rate committee requires at least 3 agents');
    }
    const stats = this.loanManager.getStats();
    const policy = this.consensusEngine.getPolicy();
    return this.consensusEngine.runConsensus(
      'rate_committee',
      `Should the network base interest rate change from ${policy.baseInterestRate}%?`,
      {
        currentBaseRate: policy.baseInterestRate,
        totalLoans: stats.total,
        completedLoans: stats.completed,
        defaultedLoans: stats.defaulted,
        defaultRate: stats.total > 0 ? ((stats.defaulted / stats.total) * 100).toFixed(1) + '%' : '0%',
        totalVolume: stats.totalVolume,
        totalRepaid: stats.totalRepaid,
        activeLoanCount: stats.funded + stats.repaying,
        agentCount: agents.length,
      },
      agents,
    );
  }

  async conveenLoanApproval(
    borrower: AgentProfile,
    creditReport: CreditReport,
    request: LoanRequest,
    loanId?: string,
  ): Promise<ConsensusSession> {
    const agents = this.getAllAgents();
    return this.consensusEngine.runConsensus(
      'loan_approval',
      `Should the network approve a $${request.amount} loan to ${borrower.name}?`,
      {
        loanId,
        borrowerName: borrower.name,
        borrowerId: borrower.id,
        creditScore: creditReport.score,
        riskLevel: creditReport.riskLevel,
        requestedAmount: request.amount,
        purpose: request.purpose,
        offeredRate: request.offeredRate,
        offeredCollateral: request.offeredCollateral,
        borrowerBalance: creditReport.walletMetrics.balanceUsdt,
        repaymentHistory: creditReport.walletMetrics.repaymentHistory,
        recommendedCollateral: creditReport.recommendedCollateral,
        maxLoanAmount: creditReport.maxLoanAmount,
      },
      agents,
    );
  }

  async conveneDisputeResolution(loanId: string): Promise<ConsensusSession> {
    const loan = this.loanManager.getLoan(loanId);
    const agents = this.getAllAgents();
    if (agents.length < 3) {
      throw new Error('Dispute resolution requires at least 3 agents');
    }
    const totalOwed = this.loanManager.getTotalOwed(loan);
    const borrower = this.getAgent(loan.borrowerId);
    const repaidPercent = totalOwed > 0 ? ((loan.totalRepaid / totalOwed) * 100).toFixed(1) : '0';
    return this.consensusEngine.runConsensus(
      'dispute_resolution',
      `Loan ${loanId} is overdue. Should the network grant leniency or enforce default?`,
      {
        loanId: loan.id,
        borrowerName: borrower.name,
        borrowerCreditScore: borrower.creditScore,
        loanAmount: loan.terms.amount,
        interestRate: loan.terms.interestRate,
        totalOwed,
        totalRepaid: loan.totalRepaid,
        repaidPercent: repaidPercent + '%',
        remainingDebt: (totalOwed - loan.totalRepaid).toFixed(2),
        daysOverdue: loan.dueAt ? Math.floor((Date.now() - loan.dueAt) / (1000 * 60 * 60 * 24)) : 0,
        borrowerReputation: borrower.reputation,
        collateralPercent: loan.terms.collateralPercent,
      },
      agents,
    );
  }

  private needsCommitteeApproval(request: LoanRequest, creditScore: number): boolean {
    // Only trigger committee for genuinely risky loans — large amounts or very low credit
    return (request.amount > 500 || creditScore < 450) && this.getAllAgents().length >= 3;
  }

  dispose(): void {
    for (const wallet of this.wallets.values()) {
      wallet.dispose();
    }
  }
}
