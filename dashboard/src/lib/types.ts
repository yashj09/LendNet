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
    aaveUsdt?: number;
  };
  aavePosition?: {
    totalCollateral: string;
    totalDebt: string;
    availableBorrows: string;
    healthFactor: string;
    ltv: string;
  } | null;
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
  rejected: number;
  totalVolume: number;
  totalRepaid: number;
}

export interface LendNetEvent {
  type: string;
  [key: string]: unknown;
}

export interface NetworkPolicy {
  baseInterestRate: number;
  minCollateralPercent: number;
  maxLoanAmount: number;
  lastUpdated: number;
  reasoning: string;
}

export interface ConsensusMessage {
  round: number;
  phase: "DELIBERATION" | "DISCUSSION" | "VOTE";
  agentId: string;
  agentName: string;
  agentRole: "lender" | "borrower" | "both";
  position: string;
  vote?: "APPROVE" | "DENY" | "ABSTAIN";
  reasoning: string;
  timestamp: number;
}

export interface ConsensusSession {
  id: string;
  type: "rate_committee" | "loan_approval" | "dispute_resolution";
  topic: string;
  context?: Record<string, unknown>;
  participants: string[];
  messages: ConsensusMessage[];
  outcome: {
    decision: string;
    votes: Record<string, string>;
    passed: boolean;
    reasoning: string;
  } | null;
  startedAt: number;
  completedAt?: number;
}
