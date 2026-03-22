import { randomUUID } from 'crypto';
import { AgentWalletManager } from '../wallet/WalletManager.js';
import { CreditScorer } from '../credit/CreditScorer.js';
import { NegotiationEngine } from '../negotiation/NegotiationEngine.js';
import { ConsensusEngine } from '../governance/ConsensusEngine.js';
import { LoanManager } from '../loans/LoanManager.js';
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

// Starting demo balance for new agents (internal ledger)
const DEMO_STARTING_BALANCE = 1000;

/**
 * Manages the lifecycle of AI lending agents.
 * Each agent has a WDK wallet, credit profile, and autonomous decision-making via Claude.
 *
 * Uses a dual-layer balance system:
 * - Internal ledger: tracks balances for demo/negotiation (agents start with $1000 USDT)
 * - On-chain (WDK): attempts real Sepolia USDT transfers when on-chain funds are available
 */
export class AgentManager {
  private agents: Map<string, AgentProfile> = new Map();
  private wallets: Map<string, AgentWalletManager> = new Map();
  private ledger: Map<string, number> = new Map(); // internal USDT balances
  private creditScorer: CreditScorer;
  private negotiationEngine: NegotiationEngine;
  private consensusEngine: ConsensusEngine;
  private loanManager: LoanManager;
  private eventListeners: Array<(event: LendNetEvent) => void> = [];
  private loansSinceLastRateReview: number = 0;
  private rateReviewInterval: number = 5; // auto-trigger rate committee every N loans

  constructor(loanManager: LoanManager) {
    this.creditScorer = new CreditScorer();
    this.negotiationEngine = new NegotiationEngine();
    this.consensusEngine = new ConsensusEngine();
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
    this.ledger.set(agent.id, DEMO_STARTING_BALANCE);

    this.emit({ type: 'agent_created', agent });
    console.log(`[Agent] Created ${name} (${role}) — wallet: ${address} — demo balance: $${DEMO_STARTING_BALANCE}`);

    return agent;
  }

  /**
   * Get credit report for an agent
   */
  getLedgerBalance(agentId: string): number {
    return this.ledger.get(agentId) ?? 0;
  }

  async getEffectiveBalance(agentId: string): Promise<number> {
    const ledgerBal = this.getLedgerBalance(agentId);
    try {
      const onChainBal = await this.getWallet(agentId).getUsdtBalance();
      return ledgerBal + onChainBal;
    } catch {
      return ledgerBal;
    }
  }

  async getCreditReport(agentId: string): Promise<CreditReport> {
    const agent = this.getAgent(agentId);
    const effectiveBalance = await this.getEffectiveBalance(agentId);

    const walletMetrics: WalletMetrics = {
      address: agent.walletAddress,
      balanceUsdt: effectiveBalance,
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

    // 3.5 Committee approval for risky/large loans
    if (this.needsCommitteeApproval(request, creditReport.score)) {
      console.log(`[Governance] Loan triggers committee review (amount: $${request.amount}, score: ${creditReport.score})`);
      const approval = await this.conveenLoanApproval(borrower, creditReport, request, loan.id);
      if (!approval.outcome?.passed) {
        console.log('[Governance] Committee DENIED the loan');
        return { loanId: loan.id, agreed: false };
      }
      console.log('[Governance] Committee APPROVED the loan — proceeding to negotiation');
    }

    // 4. Negotiate terms via LLM
    const lenderBalance = await this.getEffectiveBalance(lender.id);
    console.log(`[Negotiation] Starting negotiation... (lender balance: $${lenderBalance})`);
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

    // 6. Execute funding — internal ledger + on-chain settlement
    const amount = negotiation.finalTerms.amount;
    const lenderLedger = this.getLedgerBalance(lender.id);

    if (lenderLedger < amount) {
      console.log(`[Loan] Lender has insufficient balance ($${lenderLedger} < $${amount})`);
      return { loanId: loan.id, agreed: false };
    }

    // Update internal ledger
    this.ledger.set(lender.id, lenderLedger - amount);
    this.ledger.set(borrower.id, (this.getLedgerBalance(borrower.id)) + amount);

    // Attempt real on-chain settlement via Aave V3 + WDK
    // Flow: Lender withdraws from Aave (if deposited) → transfers to borrower → borrower receives on-chain
    let txHash = `LEDGER-${Date.now().toString(36).toUpperCase()}`;
    const txHashes: string[] = [];
    const lenderWallet = this.getWallet(lender.id);

    // Step 1: Check if lender has Aave USDT and can withdraw from Aave first
    try {
      const aavePosition = await lenderWallet.getAavePosition();
      if (aavePosition && aavePosition.totalCollateralBase > 0n) {
        // Lender has funds in Aave — withdraw to get liquid USDT
        const withdrawResult = await lenderWallet.withdrawFromAave(amount);
        txHashes.push(withdrawResult.hash);
        console.log(`[Funded] Aave withdraw TX: ${withdrawResult.hash}`);
        this.emit({ type: 'aave_withdraw', agentId: lender.id, amount, txHash: withdrawResult.hash });
      }
    } catch (error: any) {
      console.log(`[Funded] Aave withdraw skipped: ${error.message}`);
    }

    // Step 2: Try direct WDK USDT P2P transfer to borrower (the actual settlement)
    try {
      const onChainBalance = await lenderWallet.getUsdtBalance();
      const aaveUsdtBalance = await lenderWallet.getAaveUsdtBalance();
      const totalAvailable = onChainBalance + aaveUsdtBalance;
      // Use whichever USDT token the lender has
      if (onChainBalance >= amount) {
        const transferResult = await lenderWallet.transferUsdt(
          borrower.walletAddress,
          amount
        );
        txHash = transferResult.hash;
        txHashes.push(transferResult.hash);
        console.log(`[Funded] On-chain P2P TX: ${txHash}`);
      } else if (aaveUsdtBalance >= amount) {
        // Lender has Aave test USDT — supply to Aave as DeFi proof
        const supplyResult = await lenderWallet.supplyToAave(amount);
        txHash = supplyResult.hash;
        txHashes.push(supplyResult.hash);
        console.log(`[Funded] Aave supply TX (DeFi settlement): ${txHash}`);
        this.emit({ type: 'aave_supply', agentId: lender.id, amount, txHash: supplyResult.hash });
      } else {
        console.log(`[Funded] Via internal ledger (on-chain balance: $${totalAvailable})`);
      }
    } catch (error: any) {
      console.log(`[Funded] Via internal ledger (on-chain transfer failed: ${error.message})`);
    }

    if (txHashes.length === 0) {
      console.log(`[Funded] Via internal ledger only — no on-chain funds available`);
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
      // Run in background — don't block the loan response
      this.conveneRateCommittee().catch((err) =>
        console.log(`[Governance] Auto rate review failed: ${err.message}`)
      );
    }

    return { loanId: loan.id, agreed: true, txHash };
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

    const lender = this.getAgent(loan.lenderId);
    const borrowerLedger = this.getLedgerBalance(loan.borrowerId);

    if (borrowerLedger < repayAmount) {
      throw new Error(`Insufficient balance. Have $${borrowerLedger.toFixed(2)}, need $${repayAmount.toFixed(2)}`);
    }

    console.log(`[Repayment] ${loan.borrowerId} repaying $${repayAmount} on ${loanId}`);

    // Update internal ledger
    this.ledger.set(loan.borrowerId, borrowerLedger - repayAmount);
    this.ledger.set(lender.id, (this.getLedgerBalance(lender.id)) + repayAmount);

    // Attempt real on-chain settlement: borrower transfers to lender
    let txHash = `LEDGER-${Date.now().toString(36).toUpperCase()}`;
    const borrowerWallet = this.getWallet(loan.borrowerId);

    try {
      const onChainBal = await borrowerWallet.getUsdtBalance();
      if (onChainBal >= repayAmount) {
        // P2P transfer: borrower → lender
        const result = await borrowerWallet.transferUsdt(lender.walletAddress, repayAmount);
        txHash = result.hash;
        console.log(`[Repayment] On-chain P2P TX: ${txHash}`);

        // After receiving repayment, lender can supply to Aave for yield
        try {
          const lenderWallet = this.getWallet(lender.id);
          const lenderBal = await lenderWallet.getAaveUsdtBalance();
          if (lenderBal >= repayAmount) {
            const supplyResult = await lenderWallet.supplyToAave(repayAmount);
            console.log(`[Repayment] Lender re-supplied to Aave: ${supplyResult.hash}`);
            this.emit({ type: 'aave_supply', agentId: lender.id, amount: repayAmount, txHash: supplyResult.hash });
          }
        } catch {
          // Lender re-supply is best-effort
        }
      } else {
        console.log(`[Repayment] Via internal ledger (on-chain balance: $${onChainBal})`);
      }
    } catch (error: any) {
      console.log(`[Repayment] Via internal ledger (on-chain failed: ${error.message})`);
    }

    const updatedLoan = this.loanManager.recordRepayment(loanId, repayAmount, txHash);

    // Update reputation on completion
    if (updatedLoan.status === 'completed') {
      const borrower = this.getAgent(loan.borrowerId);
      borrower.reputation.successfulRepayments++;
      console.log(`[Loan] ${loanId} COMPLETED — borrower reputation updated`);
    }

    const newRemaining = totalOwed - updatedLoan.totalRepaid;
    console.log(`[Repayment] TX: ${txHash} — remaining: $${newRemaining.toFixed(2)}`);

    return { txHash, remaining: newRemaining };
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
    let onChainBalances = { address: agent.walletAddress, balanceUsdt: 0, balanceEth: 0 };
    let aavePosition = null;
    let aaveUsdtBalance = 0;

    try {
      onChainBalances = await wallet.getBalances();
    } catch {
      // on-chain query may fail, use defaults
    }

    try {
      aavePosition = await wallet.getAavePosition();
      aaveUsdtBalance = await wallet.getAaveUsdtBalance();
    } catch {
      // Aave query may fail, use defaults
    }

    const ledgerBalance = this.getLedgerBalance(agentId);
    const loans = this.loanManager.getLoansByAgent(agentId);

    return {
      ...agent,
      balances: {
        ...onChainBalances,
        balanceUsdt: ledgerBalance + onChainBalances.balanceUsdt,
        ledgerUsdt: ledgerBalance,
        onChainUsdt: onChainBalances.balanceUsdt,
        aaveUsdt: aaveUsdtBalance,
      },
      aavePosition: aavePosition ? {
        totalCollateral: aavePosition.totalCollateralBase.toString(),
        totalDebt: aavePosition.totalDebtBase.toString(),
        availableBorrows: aavePosition.availableBorrowsBase.toString(),
        healthFactor: aavePosition.healthFactor.toString(),
        ltv: aavePosition.ltv.toString(),
      } : null,
      activeLoans: loans.filter(
        (l) => !['completed', 'defaulted', 'pending'].includes(l.status)
      ),
      loanHistory: loans,
    };
  }

  // ─── Governance: AI Consensus ────────────────────────

  getConsensusEngine(): ConsensusEngine {
    return this.consensusEngine;
  }

  getNetworkPolicy(): NetworkPolicy {
    return this.consensusEngine.getPolicy();
  }

  /**
   * Rate Committee: All agents debate and vote on the network's base interest rate.
   * Auto-triggers every N loans, or can be called manually.
   */
  async conveneRateCommittee(): Promise<ConsensusSession> {
    const agents = this.getAllAgents();
    if (agents.length < 3) {
      throw new Error('Rate committee requires at least 3 agents in the network');
    }

    const stats = this.loanManager.getStats();
    const policy = this.consensusEngine.getPolicy();

    return this.consensusEngine.runConsensus(
      'rate_committee',
      `Should the network base interest rate change from ${policy.baseInterestRate}%? Review network health and propose a new rate.`,
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

  /**
   * Loan Approval Committee: All agents evaluate a risky/large loan before it proceeds.
   * Triggered when loan amount > $200 OR borrower credit score < 600.
   */
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

  /**
   * Dispute Resolution: All agents deliberate on an overdue loan.
   * Instead of auto-defaulting, agents vote to EXTEND, RESTRUCTURE, or DEFAULT.
   */
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

  /**
   * Check if a loan request needs committee approval.
   * Threshold: amount > $200 OR borrower credit score < 600
   */
  private needsCommitteeApproval(request: LoanRequest, creditScore: number): boolean {
    return (request.amount > 200 || creditScore < 600) && this.getAllAgents().length >= 3;
  }

  dispose(): void {
    for (const wallet of this.wallets.values()) {
      wallet.dispose();
    }
  }
}
