// ─── Agent Types ───────────────────────────────────────
export interface AgentProfile {
  id: string;
  name: string;
  role: 'lender' | 'borrower' | 'both';
  walletAddress: string;
  seedPhrase: string; // stored locally, never sent to LLM
  creditScore: number;
  reputation: AgentReputation;
}

export interface AgentReputation {
  totalLoansIssued: number;
  totalLoansBorrowed: number;
  successfulRepayments: number;
  defaults: number;
  totalVolumeLent: number;   // in USDT
  totalVolumeBorrowed: number;
  avgRepaymentTime: number;  // in ms
}

// ─── Loan Types ────────────────────────────────────────
export type LoanStatus =
  | 'pending'       // loan request posted
  | 'negotiating'   // agents negotiating terms
  | 'approved'      // terms agreed
  | 'funded'        // USDT transferred to borrower
  | 'repaying'      // partial repayments made
  | 'completed'     // fully repaid
  | 'defaulted'     // borrower failed to repay
  | 'rejected';     // denied by committee, negotiation, or funding failure

export interface LoanTerms {
  amount: number;          // USDT
  interestRate: number;    // annual % (e.g. 8.5)
  durationMs: number;      // loan duration in ms
  collateralPercent: number; // 0-100+, percent of loan as collateral
  monthlyPayment: number;  // calculated USDT per payment
}

export interface Loan {
  id: string;
  borrowerId: string;
  lenderId: string;
  terms: LoanTerms;
  status: LoanStatus;
  requestedAt: number;     // timestamp
  fundedAt?: number;
  dueAt?: number;
  completedAt?: number;
  totalRepaid: number;     // USDT repaid so far
  txHashes: {
    funding?: string;
    repayments: string[];
    collateral?: string;
  };
  negotiationLog: NegotiationMessage[];
}

export interface LoanRequest {
  borrowerId: string;
  amount: number;          // requested USDT
  purpose: string;
  offeredRate: number;     // max interest rate willing to pay
  offeredCollateral: number; // collateral percent offered
}

// ─── Negotiation Types ─────────────────────────────────
export type NegotiationAction = 'PROPOSE' | 'COUNTER' | 'ACCEPT' | 'REJECT';

export interface NegotiationMessage {
  round: number;
  from: 'lender' | 'borrower';
  action: NegotiationAction;
  terms: LoanTerms;
  reasoning: string;
  timestamp: number;
}

// ─── Credit Score Types ────────────────────────────────
export interface CreditReport {
  agentId: string;
  score: number;            // 300-850
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'VERY_HIGH';
  factors: CreditFactor[];
  walletMetrics: WalletMetrics;
  recommendedCollateral: number; // suggested collateral %
  maxLoanAmount: number;         // max USDT we'd lend
}

export interface CreditFactor {
  name: string;
  impact: 'positive' | 'negative' | 'neutral';
  description: string;
  weight: number; // 0-1
}

export interface WalletMetrics {
  address: string;
  balanceUsdt: number;
  transactionCount: number;
  walletAgeDays: number;
  repaymentHistory: {
    onTime: number;
    late: number;
    defaulted: number;
  };
}

// ─── Governance Types ─────────────────────────────────
export type ConsensusType = 'rate_committee' | 'loan_approval' | 'dispute_resolution';

export type ConsensusVote = 'APPROVE' | 'DENY' | 'ABSTAIN';

export interface NetworkPolicy {
  baseInterestRate: number;      // network base rate (%)
  minCollateralPercent: number;  // floor on collateral requirements (%)
  maxLoanAmount: number;         // global max single loan (USDT)
  lastUpdated: number;
  reasoning: string;             // AI consensus explanation
}

export interface ConsensusMessage {
  round: number;
  phase: 'DELIBERATION' | 'DISCUSSION' | 'VOTE';
  agentId: string;
  agentName: string;
  agentRole: 'lender' | 'borrower' | 'both';
  position: string;              // agent's argument/stance
  vote?: ConsensusVote;
  reasoning: string;
  timestamp: number;
}

export interface ConsensusSession {
  id: string;
  type: ConsensusType;
  topic: string;                 // human-readable description
  context: Record<string, unknown>; // metrics, loan data, etc.
  participants: string[];        // agent IDs
  messages: ConsensusMessage[];
  outcome: {
    decision: string;
    votes: Record<string, ConsensusVote>;
    passed: boolean;
    reasoning: string;
  } | null;
  startedAt: number;
  completedAt?: number;
}

// ─── Event Types ───────────────────────────────────────
export type LendNetEvent =
  | { type: 'agent_created'; agent: AgentProfile; txHash?: string; amount?: number }
  | { type: 'loan_requested'; loan: Loan }
  | { type: 'negotiation_round'; loanId: string; message: NegotiationMessage }
  | { type: 'loan_funded'; loanId: string; txHash: string; amount: number }
  | { type: 'repayment_made'; loanId: string; amount: number; txHash: string }
  | { type: 'loan_completed'; loanId: string }
  | { type: 'loan_defaulted'; loanId: string }
  | { type: 'credit_updated'; agentId: string; newScore: number }
  | { type: 'governance_started'; session: ConsensusSession }
  | { type: 'governance_message'; sessionId: string; message: ConsensusMessage }
  | { type: 'governance_completed'; session: ConsensusSession }
  | { type: 'aave_supply'; agentId: string; amount: number; txHash: string }
  | { type: 'aave_withdraw'; agentId: string; amount: number; txHash: string }
  | { type: 'aave_borrow'; agentId: string; amount: number; txHash: string }
  | { type: 'aave_repay'; agentId: string; amount: number; txHash: string }
  | { type: 'autonomous_tick'; tick: number; actions: string[] }
  | { type: 'autonomous_started' }
  | { type: 'autonomous_stopped' };
