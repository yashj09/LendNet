import { LoanManager } from './loans/LoanManager.js';
import { AgentManager } from './agents/AgentManager.js';
import { startServer } from './api/server.js';

/**
 * LendNet Demo — Full lifecycle demonstration
 *
 * This demo creates AI lending agents, runs autonomous loan negotiations,
 * executes on-chain USDT transfers via Tether WDK, and tracks repayments.
 *
 * NOTE: Requires funded Sepolia wallets with mock USDT.
 * Get test tokens from: https://dashboard.pimlico.io/test-erc20-faucet
 */
async function demo() {
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║       LendNet Demo — Agent Lending in Action    ║');
  console.log('╚══════════════════════════════════════════════════╝\n');

  const loanManager = new LoanManager();
  const agentManager = new AgentManager(loanManager);

  // Start the dashboard server
  startServer(agentManager, loanManager);

  // Track events
  const events: any[] = [];
  loanManager.onEvent((e) => events.push(e));
  agentManager.onEvent((e) => events.push(e));

  // ═══════════════════════════════════════════════════════
  // STEP 1: Create Lending Agents
  // ═══════════════════════════════════════════════════════
  console.log('\n══ STEP 1: Creating AI Lending Agents ══\n');

  const lender = await agentManager.createAgent('Alpha Lender', 'lender');
  const borrower = await agentManager.createAgent('Beta Borrower', 'borrower');
  const dualAgent = await agentManager.createAgent('Gamma Agent', 'both');

  // Give lender a good reputation (simulating history)
  lender.reputation.successfulRepayments = 15;
  lender.reputation.totalLoansIssued = 20;
  lender.reputation.totalVolumeLent = 25000;
  lender.creditScore = 780;

  // Borrower has moderate history
  borrower.reputation.successfulRepayments = 5;
  borrower.reputation.totalLoansBorrowed = 6;
  borrower.reputation.defaults = 1;
  borrower.reputation.totalVolumeBorrowed = 3000;
  borrower.creditScore = 650;

  console.log('\nAgents created. Fund their wallets with test USDT:');
  console.log(`  Lender  (${lender.name}):  ${lender.walletAddress}`);
  console.log(`  Borrower (${borrower.name}): ${borrower.walletAddress}`);
  console.log(`  Dual    (${dualAgent.name}):  ${dualAgent.walletAddress}`);

  // ═══════════════════════════════════════════════════════
  // STEP 2: Credit Check
  // ═══════════════════════════════════════════════════════
  console.log('\n══ STEP 2: Running Credit Reports ══\n');

  const lenderCredit = await agentManager.getCreditReport(lender.id);
  console.log(
    `${lender.name}: Score ${lenderCredit.score} (${lenderCredit.riskLevel})`
  );
  for (const f of lenderCredit.factors) {
    console.log(`  [${f.impact.toUpperCase()}] ${f.name}: ${f.description}`);
  }

  const borrowerCredit = await agentManager.getCreditReport(borrower.id);
  console.log(
    `\n${borrower.name}: Score ${borrowerCredit.score} (${borrowerCredit.riskLevel})`
  );
  for (const f of borrowerCredit.factors) {
    console.log(`  [${f.impact.toUpperCase()}] ${f.name}: ${f.description}`);
  }

  // ═══════════════════════════════════════════════════════
  // STEP 3: Loan Request + Negotiation
  // ═══════════════════════════════════════════════════════
  console.log('\n══ STEP 3: Loan Request + AI Negotiation ══\n');

  const loanResult = await agentManager.requestLoan({
    borrowerId: borrower.id,
    amount: 100,
    purpose: 'Capital for DeFi yield farming strategy across Aave and Uniswap',
    offeredRate: 12,
    offeredCollateral: 40,
  });

  console.log(`\nLoan ${loanResult.loanId}: ${loanResult.agreed ? 'APPROVED' : 'REJECTED'}`);

  if (loanResult.agreed && loanResult.txHash) {
    console.log(`Funding TX: ${loanResult.txHash}`);

    // Show loan details
    const loan = loanManager.getLoan(loanResult.loanId);
    console.log(`\nLoan Terms:`);
    console.log(`  Amount: $${loan.terms.amount} USDT`);
    console.log(`  Interest: ${loan.terms.interestRate}%`);
    console.log(`  Collateral: ${loan.terms.collateralPercent}%`);
    console.log(`  Duration: ${loan.terms.durationMs / (1000 * 60 * 60)} hours`);

    const totalOwed = loanManager.getTotalOwed(loan);
    console.log(`  Total owed: $${totalOwed.toFixed(2)}`);

    // ═══════════════════════════════════════════════════
    // STEP 4: Repayment
    // ═══════════════════════════════════════════════════
    console.log('\n══ STEP 4: Loan Repayment ══\n');

    try {
      const repayment = await agentManager.repayLoan(loan.id);
      console.log(`Repayment TX: ${repayment.txHash}`);
      console.log(`Remaining: $${repayment.remaining.toFixed(2)}`);
    } catch (err: any) {
      console.log(`Repayment skipped (likely insufficient funds): ${err.message}`);
    }
  }

  // ═══════════════════════════════════════════════════════
  // STEP 5: Updated Credit Scores
  // ═══════════════════════════════════════════════════════
  console.log('\n══ STEP 5: Updated Credit Reports ══\n');

  const updatedBorrowerCredit = await agentManager.getCreditReport(borrower.id);
  console.log(
    `${borrower.name}: Score ${updatedBorrowerCredit.score} (was ${borrowerCredit.score})`
  );

  // ═══════════════════════════════════════════════════════
  // Summary
  // ═══════════════════════════════════════════════════════
  console.log('\n══ Network Statistics ══\n');
  const stats = loanManager.getStats();
  console.log(`  Total loans: ${stats.total}`);
  console.log(`  Completed: ${stats.completed}`);
  console.log(`  Volume: $${stats.totalVolume}`);
  console.log(`  Events fired: ${events.length}`);

  console.log('\n[Demo] Complete! Dashboard running at http://localhost:3000');
  console.log('[Demo] Press Ctrl+C to exit.\n');
}

demo().catch(console.error);
