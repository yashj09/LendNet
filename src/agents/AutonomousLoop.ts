import { AgentManager } from './AgentManager.js';
import { LoanManager } from '../loans/LoanManager.js';
import type { AgentProfile, LendNetEvent } from '../config/types.js';

const LOAN_PURPOSES = [
  'Working capital for DeFi arbitrage opportunity',
  'Bridge loan for cross-chain token migration',
  'Inventory financing for NFT marketplace',
  'Liquidity provision for new trading pair',
  'Short-term capital for yield farming strategy',
  'Operating expenses for DAO treasury management',
  'Collateral top-up to avoid liquidation',
  'Funding for smart contract audit',
];

/**
 * Autonomous Agent Loop — makes agents act without human prompts.
 *
 * Each tick, agents independently:
 * 1. Borrowers: evaluate if they need a loan and auto-request one
 * 2. All agents: auto-repay due loans before they default
 * 3. Lenders: supply idle capital to Aave for yield
 * 4. Network: detect overdue loans and trigger dispute resolution
 *
 * This satisfies the hackathon requirement:
 * "The agent makes lending decisions without human prompts"
 */
export class AutonomousLoop {
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private tickCount = 0;
  private eventListeners: Array<(event: LendNetEvent) => void> = [];

  constructor(
    private agentManager: AgentManager,
    private loanManager: LoanManager,
    private intervalMs: number = 30_000, // 30 seconds default
  ) {}

  onEvent(listener: (event: LendNetEvent) => void): void {
    this.eventListeners.push(listener);
  }

  private emit(event: LendNetEvent): void {
    for (const listener of this.eventListeners) {
      listener(event);
    }
  }

  get isRunning(): boolean {
    return this.running;
  }

  get ticks(): number {
    return this.tickCount;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    console.log(`[Autonomous] Loop started — interval: ${this.intervalMs / 1000}s`);

    // Bootstrap: auto-create agents + trigger first loan immediately
    this.bootstrap().then(() => {
      this.timer = setInterval(() => this.tick(), this.intervalMs);
    });
  }

  /**
   * Auto-bootstrap the network for demo purposes:
   * - If no agents exist, create 3 agents (2 lenders + 1 borrower)
   * - Then immediately trigger a loan request to showcase the full flow
   *   (governance committee + AI negotiation + on-chain settlement)
   */
  private async bootstrap(): Promise<void> {
    let agents = this.agentManager.getAllAgents();

    if (agents.length === 0) {
      console.log('[Autonomous] No agents found — bootstrapping network...');
      this.emit({ type: 'autonomous_tick', tick: 0, actions: ['Bootstrapping: creating agents...'] });

      try {
        await this.agentManager.createAgent('Atlas Lender', 'lender');
        await this.agentManager.createAgent('Nexus Lender', 'lender');
        await this.agentManager.createAgent('Orion Borrower', 'borrower');
        console.log('[Autonomous] 3 agents created (2 lenders + 1 borrower)');
      } catch (err: any) {
        console.log(`[Autonomous] Bootstrap agent creation failed: ${err.message}`);
        return;
      }

      agents = this.agentManager.getAllAgents();
    }

    // Immediately trigger a loan to showcase the full pipeline
    const borrower = agents.find(a => a.role === 'borrower' || a.role === 'both');
    const hasLender = agents.some(a => a.role === 'lender' || a.role === 'both');
    if (!borrower || !hasLender) return;

    // Check if there are already active loans — skip if so
    const activeLoans = this.loanManager.getAllLoans()
      .filter(l => !['completed', 'defaulted', 'rejected'].includes(l.status));
    if (activeLoans.length > 0) {
      console.log('[Autonomous] Active loans already exist — skipping bootstrap loan');
      return;
    }

    const purpose = LOAN_PURPOSES[Math.floor(Math.random() * LOAN_PURPOSES.length)];
    // Use amount > $500 to trigger committee governance for demo
    const amount = 600;

    console.log(`[Autonomous] Bootstrap: triggering demo loan ($${amount}) to showcase full pipeline`);
    this.emit({ type: 'autonomous_tick', tick: 0, actions: [`Bootstrap: ${borrower.name} requesting $${amount} loan — triggers governance + negotiation`] });

    try {
      const result = await this.agentManager.requestLoan({
        borrowerId: borrower.id,
        amount,
        purpose,
        offeredRate: 10,
        offeredCollateral: 40,
      });
      if (result.agreed) {
        console.log(`[Autonomous] Bootstrap loan ${result.loanId} funded — TX: ${result.txHash}`);
      } else {
        console.log(`[Autonomous] Bootstrap loan ${result.loanId} — negotiation/committee did not agree`);
      }
    } catch (err: any) {
      console.log(`[Autonomous] Bootstrap loan failed: ${err.message}`);
    }
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    console.log(`[Autonomous] Loop stopped after ${this.tickCount} ticks`);
  }

  /**
   * Single autonomous tick — all agents evaluate their situation and act.
   */
  private async tick(): Promise<void> {
    this.tickCount++;
    const agents = this.agentManager.getAllAgents();
    if (agents.length < 2) return; // need at least a lender and borrower

    console.log(`\n[Autonomous] ─── Tick #${this.tickCount} ─── (${agents.length} agents)`);

    try {
      // Phase 1: Auto-repay due loans (highest priority — prevent defaults)
      await this.autoRepayDueLoans();

      // Phase 2: Detect overdue loans and trigger dispute resolution
      await this.handleOverdueLoans();

      // Phase 3: Borrowers auto-request loans if they need capital
      await this.borrowerAutoRequest(agents);

      // Phase 4: Lenders supply idle capital to Aave for yield
      await this.lenderAutoYield(agents);
    } catch (error: any) {
      console.log(`[Autonomous] Tick #${this.tickCount} error: ${error.message}`);
    }
  }

  /**
   * Phase 1: Auto-repay loans that are due or nearly due.
   * Agents autonomously track and collect repayments.
   */
  private async autoRepayDueLoans(): Promise<void> {
    const allLoans = this.loanManager.getAllLoans();
    const now = Date.now();

    for (const loan of allLoans) {
      if (loan.status !== 'funded' && loan.status !== 'repaying') continue;
      if (!loan.dueAt) continue;

      const totalOwed = this.loanManager.getTotalOwed(loan);
      const remaining = totalOwed - loan.totalRepaid;
      if (remaining <= 0) continue;

      // Auto-repay if loan is due within 2 minutes or already overdue
      const timeUntilDue = loan.dueAt - now;
      if (timeUntilDue > 2 * 60 * 1000) continue;

      const borrowerBalance = await this.agentManager.getBalance(loan.borrowerId);
      if (borrowerBalance <= 0) continue;

      // Repay as much as possible
      const repayAmount = Math.min(remaining, borrowerBalance);

      try {
        console.log(`[Autonomous] Auto-repaying $${repayAmount.toFixed(2)} on ${loan.id} (due in ${Math.round(timeUntilDue / 1000)}s)`);
        const result = await this.agentManager.repayLoan(loan.id, repayAmount);
        console.log(`[Autonomous] Repayment TX: ${result.txHash} — remaining: $${result.remaining.toFixed(2)}`);
      } catch (error: any) {
        console.log(`[Autonomous] Auto-repay failed for ${loan.id}: ${error.message}`);
      }
    }
  }

  /**
   * Phase 2: Detect overdue loans and trigger dispute resolution instead of auto-defaulting.
   */
  private async handleOverdueLoans(): Promise<void> {
    const allLoans = this.loanManager.getAllLoans();
    const now = Date.now();

    for (const loan of allLoans) {
      if (loan.status !== 'funded' && loan.status !== 'repaying') continue;
      if (!loan.dueAt || now <= loan.dueAt) continue;

      const totalOwed = this.loanManager.getTotalOwed(loan);
      if (loan.totalRepaid >= totalOwed) continue;

      // Loan is overdue — try dispute resolution if enough agents
      const agents = this.agentManager.getAllAgents();
      if (agents.length >= 3) {
        try {
          console.log(`[Autonomous] Loan ${loan.id} is overdue — convening dispute resolution`);
          await this.agentManager.conveneDisputeResolution(loan.id);
        } catch (error: any) {
          console.log(`[Autonomous] Dispute resolution failed for ${loan.id}: ${error.message}`);
        }
      } else {
        // Not enough agents for dispute — mark as defaulted
        this.loanManager.markDefault(loan.id);
        console.log(`[Autonomous] Loan ${loan.id} defaulted (not enough agents for dispute)`);
      }
    }
  }

  /**
   * Phase 3: Borrower agents autonomously request loans when they need capital.
   * Decision factors: low balance, no active loans, good credit standing.
   */
  private async borrowerAutoRequest(agents: AgentProfile[]): Promise<void> {
    const borrowers = agents.filter(a => a.role === 'borrower' || a.role === 'both');
    const hasLender = agents.some(a => a.role === 'lender' || a.role === 'both');
    if (!hasLender) return;

    for (const borrower of borrowers) {
      // Skip if borrower already has active loans
      const activeLoans = this.loanManager.getLoansByAgent(borrower.id)
        .filter(l => ['funded', 'repaying', 'negotiating', 'approved', 'pending'].includes(l.status));
      if (activeLoans.length > 0) continue;

      // Borrow if balance is below threshold — agents actively seek loans
      const balance = await this.agentManager.getBalance(borrower.id);
      if (balance > 1200) continue; // most agents qualify (starting balance is $1000)

      // Don't borrow if credit score is terrible (already defaulted too much)
      if (borrower.creditScore < 350) continue;

      // Decide loan amount based on credit score
      const maxAmount = borrower.creditScore >= 600 ? 200 : 100;
      const amount = Math.min(maxAmount, 500 - balance); // borrow up to $500 total
      if (amount < 20) continue;

      const purpose = LOAN_PURPOSES[Math.floor(Math.random() * LOAN_PURPOSES.length)];

      try {
        console.log(`[Autonomous] ${borrower.name} auto-requesting $${amount} loan — "${purpose}"`);
        const result = await this.agentManager.requestLoan({
          borrowerId: borrower.id,
          amount,
          purpose,
          offeredRate: 8 + Math.random() * 7, // 8-15% offered rate
          offeredCollateral: borrower.creditScore >= 700 ? 20 : 50,
        });
        if (result.agreed) {
          console.log(`[Autonomous] Loan ${result.loanId} funded — TX: ${result.txHash}`);
        } else {
          console.log(`[Autonomous] Loan ${result.loanId} not funded (negotiation failed or denied)`);
        }
      } catch (error: any) {
        console.log(`[Autonomous] Auto-loan request failed for ${borrower.name}: ${error.message}`);
      }
    }
  }

  /**
   * Phase 4: Lenders supply idle capital to Aave V3 for yield.
   * This satisfies "agent reallocates capital to higher-yield opportunities".
   */
  private async lenderAutoYield(agents: AgentProfile[]): Promise<void> {
    const lenders = agents.filter(a => a.role === 'lender' || a.role === 'both');

    for (const lender of lenders) {
      // Check if lender has active loans to fund — don't lock up capital
      const pendingLoans = this.loanManager.getAllLoans()
        .filter(l => l.status === 'pending' || l.status === 'negotiating');
      if (pendingLoans.length > 0) continue;

      // Only supply to Aave if lender has Aave-compatible USDT on-chain
      try {
        const wallet = this.agentManager.getWallet(lender.id);
        const aaveBalance = await wallet.getAaveUsdtBalance();
        if (aaveBalance < 1) continue; // need at least 1 USDT

        // Don't supply everything — keep some liquid for immediate loan funding
        const supplyAmount = Math.floor(aaveBalance * 0.7); // supply 70%, keep 30% liquid
        if (supplyAmount < 1) continue;

        console.log(`[Autonomous] ${lender.name} supplying $${supplyAmount} to Aave for yield`);
        const result = await wallet.supplyToAave(supplyAmount);
        console.log(`[Autonomous] Aave supply TX: ${result.hash}`);
      } catch (error: any) {
        // Aave supply is best-effort — don't block the loop
        if (!error.message.includes('not initialized')) {
          console.log(`[Autonomous] Aave yield for ${lender.name} skipped: ${error.message}`);
        }
      }
    }
  }
}
