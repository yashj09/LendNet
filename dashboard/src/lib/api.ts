import type { AgentStatus, Loan, LoanStats } from "./types";

const BASE = "/api";

export async function fetchAgents(): Promise<AgentStatus[]> {
  const res = await fetch(`${BASE}/agents`);
  if (!res.ok) throw new Error("Failed to fetch agents");
  return res.json();
}

export async function fetchLoans(): Promise<Loan[]> {
  const res = await fetch(`${BASE}/loans`);
  if (!res.ok) throw new Error("Failed to fetch loans");
  return res.json();
}

export async function fetchStats(): Promise<LoanStats> {
  const res = await fetch(`${BASE}/loans/stats`);
  if (!res.ok) throw new Error("Failed to fetch stats");
  return res.json();
}

export async function createAgent(
  name: string,
  role: "lender" | "borrower" | "both"
): Promise<AgentStatus> {
  const res = await fetch(`${BASE}/agents`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, role }),
  });
  if (!res.ok) throw new Error("Failed to create agent");
  return res.json();
}

export async function requestLoan(params: {
  borrowerId: string;
  amount: number;
  purpose: string;
  offeredRate?: number;
  offeredCollateral?: number;
}): Promise<{ loanId: string; agreed: boolean; txHash?: string }> {
  const res = await fetch(`${BASE}/loans/request`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  if (!res.ok) throw new Error("Failed to request loan");
  return res.json();
}

export async function repayLoan(
  loanId: string,
  amount?: number
): Promise<{ txHash: string; remaining: number }> {
  const res = await fetch(`${BASE}/loans/${loanId}/repay`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ amount }),
  });
  if (!res.ok) throw new Error("Failed to repay loan");
  return res.json();
}
