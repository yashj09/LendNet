import { randomUUID } from 'crypto';
import type {
  Loan,
  LoanRequest,
  LoanTerms,
  LoanStatus,
  NegotiationMessage,
  LendNetEvent,
} from '../config/types.js';

/**
 * Manages the full lifecycle of loans: creation, funding, repayment, completion.
 * Acts as the in-memory ledger for the LendNet protocol.
 */
export class LoanManager {
  private loans: Map<string, Loan> = new Map();
  private eventListeners: Array<(event: LendNetEvent) => void> = [];

  onEvent(listener: (event: LendNetEvent) => void): void {
    this.eventListeners.push(listener);
  }

  private emit(event: LendNetEvent): void {
    for (const listener of this.eventListeners) {
      listener(event);
    }
  }

  /**
   * Create a new loan from a request (status: pending)
   */
  createLoan(request: LoanRequest): Loan {
    const loan: Loan = {
      id: `LOAN-${randomUUID().slice(0, 8).toUpperCase()}`,
      borrowerId: request.borrowerId,
      lenderId: '', // assigned during negotiation
      terms: {
        amount: request.amount,
        interestRate: request.offeredRate,
        durationMs: 0,
        collateralPercent: request.offeredCollateral,
        monthlyPayment: 0,
      },
      status: 'pending',
      requestedAt: Date.now(),
      totalRepaid: 0,
      txHashes: { repayments: [] },
      negotiationLog: [],
    };

    this.loans.set(loan.id, loan);
    this.emit({ type: 'loan_requested', loan });
    return loan;
  }

  /**
   * Update loan after negotiation completes
   */
  setNegotiationResult(
    loanId: string,
    lenderId: string,
    agreed: boolean,
    finalTerms?: LoanTerms,
    log?: NegotiationMessage[]
  ): Loan {
    const loan = this.getLoan(loanId);
    loan.lenderId = lenderId;
    loan.negotiationLog = log || [];

    if (agreed && finalTerms) {
      loan.terms = finalTerms;
      loan.status = 'approved';
    } else {
      loan.status = 'rejected';
    }

    return loan;
  }

  /**
   * Record that a loan has been funded (USDT transferred to borrower)
   */
  recordFunding(loanId: string, txHash: string): Loan {
    const loan = this.getLoan(loanId);
    loan.status = 'funded';
    loan.fundedAt = Date.now();
    loan.dueAt = Date.now() + loan.terms.durationMs;
    loan.txHashes.funding = txHash;

    this.emit({ type: 'loan_funded', loanId, txHash, amount: loan.terms.amount });
    return loan;
  }

  /**
   * Record a repayment from borrower to lender
   */
  recordRepayment(loanId: string, amount: number, txHash: string): Loan {
    const loan = this.getLoan(loanId);
    loan.totalRepaid += amount;
    loan.txHashes.repayments.push(txHash);
    loan.status = 'repaying';

    this.emit({ type: 'repayment_made', loanId, amount, txHash });

    // Check if fully repaid (principal + interest)
    const totalOwed = this.getTotalOwed(loan);
    if (loan.totalRepaid >= totalOwed) {
      loan.status = 'completed';
      loan.completedAt = Date.now();
      this.emit({ type: 'loan_completed', loanId });
    }

    return loan;
  }

  /**
   * Mark a loan as rejected (committee denied, negotiation failed, or funding failed)
   */
  rejectLoan(loanId: string): Loan {
    const loan = this.getLoan(loanId);
    loan.status = 'rejected';
    return loan;
  }

  /**
   * Mark a loan as defaulted
   */
  markDefault(loanId: string): Loan {
    const loan = this.getLoan(loanId);
    loan.status = 'defaulted';
    this.emit({ type: 'loan_defaulted', loanId });
    return loan;
  }

  /**
   * Calculate total amount owed (principal + interest)
   */
  getTotalOwed(loan: Loan): number {
    const durationYears = loan.terms.durationMs / (365 * 24 * 60 * 60 * 1000);
    const interest = loan.terms.amount * (loan.terms.interestRate / 100) * durationYears;
    return Math.round((loan.terms.amount + interest) * 100) / 100;
  }

  /**
   * Check for overdue loans and mark them as defaulted
   */
  checkOverdueLoans(): Loan[] {
    const now = Date.now();
    const defaulted: Loan[] = [];

    for (const loan of this.loans.values()) {
      if (
        (loan.status === 'funded' || loan.status === 'repaying') &&
        loan.dueAt &&
        now > loan.dueAt &&
        loan.totalRepaid < this.getTotalOwed(loan)
      ) {
        this.markDefault(loan.id);
        defaulted.push(loan);
      }
    }

    return defaulted;
  }

  getLoan(id: string): Loan {
    const loan = this.loans.get(id);
    if (!loan) throw new Error(`Loan ${id} not found`);
    return loan;
  }

  getAllLoans(): Loan[] {
    return Array.from(this.loans.values());
  }

  getLoansByAgent(agentId: string): Loan[] {
    return this.getAllLoans().filter(
      (l) => l.borrowerId === agentId || l.lenderId === agentId
    );
  }

  getLoansByStatus(status: LoanStatus): Loan[] {
    return this.getAllLoans().filter((l) => l.status === status);
  }

  getStats() {
    const loans = this.getAllLoans();
    return {
      total: loans.length,
      pending: loans.filter((l) => l.status === 'pending').length,
      negotiating: loans.filter((l) => l.status === 'negotiating').length,
      rejected: loans.filter((l) => l.status === 'rejected').length,
      approved: loans.filter((l) => l.status === 'approved').length,
      funded: loans.filter((l) => l.status === 'funded').length,
      repaying: loans.filter((l) => l.status === 'repaying').length,
      completed: loans.filter((l) => l.status === 'completed').length,
      defaulted: loans.filter((l) => l.status === 'defaulted').length,
      totalVolume: loans.reduce((sum, l) => sum + l.terms.amount, 0),
      totalRepaid: loans.reduce((sum, l) => sum + l.totalRepaid, 0),
    };
  }
}
