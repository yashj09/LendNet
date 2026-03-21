export interface AgentStatus {
  id: string;
  name: string;
  role: "lender" | "borrower" | "both";
  walletAddress: string;
  creditScore: number;
  reputation: {
    totalLoansIssued: number;
    totalLoansBorrowed: number;
    successfulRepayments: number;
    defaults: number;
    totalVolumeLent: number;
    totalVolumeBorrowed: number;
    avgRepaymentTime: number;
  };
  balances: {
    address: string;
    balanceUsdt: number;
    balanceEth: number;
  };
  activeLoans: Loan[];
  loanHistory: Loan[];
}

export interface LoanTerms {
  amount: number;
  interestRate: number;
  durationMs: number;
  collateralPercent: number;
  monthlyPayment: number;
}

export interface NegotiationMessage {
  round: number;
  from: "lender" | "borrower";
  action: "PROPOSE" | "COUNTER" | "ACCEPT" | "REJECT";
  terms: LoanTerms;
  reasoning: string;
  timestamp: number;
}

export interface Loan {
  id: string;
  borrowerId: string;
  lenderId: string;
  terms: LoanTerms;
  status: string;
  requestedAt: number;
  fundedAt?: number;
  dueAt?: number;
  completedAt?: number;
  totalRepaid: number;
  txHashes: {
    funding?: string;
    repayments: string[];
    collateral?: string;
  };
  negotiationLog: NegotiationMessage[];
}

export interface LoanStats {
  total: number;
  pending: number;
  negotiating: number;
  approved: number;
  funded: number;
  repaying: number;
  completed: number;
  defaulted: number;
  totalVolume: number;
  totalRepaid: number;
}

export interface LendNetEvent {
  type: string;
  [key: string]: unknown;
}
