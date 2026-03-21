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

    // 6. Execute funding — internal ledger + attempt on-chain WDK transfer
    const amount = negotiation.finalTerms.amount;
    const lenderLedger = this.getLedgerBalance(lender.id);

    if (lenderLedger < amount) {
      console.log(`[Loan] Lender has insufficient balance ($${lenderLedger} < $${amount})`);
      return { loanId: loan.id, agreed: false };
    }

    // Update internal ledger
    this.ledger.set(lender.id, lenderLedger - amount);
    this.ledger.set(borrower.id, (this.getLedgerBalance(borrower.id)) + amount);

    // Attempt real on-chain transfer via WDK (best-effort)
    let txHash = `LEDGER-${Date.now().toString(36).toUpperCase()}`;
    try {
      const lenderWallet = this.getWallet(lender.id);
      const onChainBalance = await lenderWallet.getUsdtBalance();
      if (onChainBalance >= amount) {
        const transferResult = await lenderWallet.transferUsdt(
          borrower.walletAddress,
          amount
        );
        txHash = transferResult.hash;
        console.log(`[Funded] On-chain TX: ${txHash}`);
      } else {
        console.log(`[Funded] Via internal ledger (on-chain balance too low: $${onChainBalance})`);
      }
    } catch (error: any) {
      console.log(`[Funded] Via internal ledger (on-chain transfer failed: ${error.message})`);
    }

    this.loanManager.recordFunding(loan.id, txHash);

    // Update reputations
    lender.reputation.totalLoansIssued++;
    lender.reputation.totalVolumeLent += amount;
    borrower.reputation.totalLoansBorrowed++;
    borrower.reputation.totalVolumeBorrowed += amount;

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

    // Attempt real on-chain transfer via WDK (best-effort)
    let txHash = `LEDGER-${Date.now().toString(36).toUpperCase()}`;
    try {
      const borrowerWallet = this.getWallet(loan.borrowerId);
      const onChainBal = await borrowerWallet.getUsdtBalance();
      if (onChainBal >= repayAmount) {
        const result = await borrowerWallet.transferUsdt(lender.walletAddress, repayAmount);
        txHash = result.hash;
        console.log(`[Repayment] On-chain TX: ${txHash}`);
      } else {
        console.log(`[Repayment] Via internal ledger`);
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
    try {
      onChainBalances = await wallet.getBalances();
    } catch {
      // on-chain query may fail, use defaults
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
      },
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
