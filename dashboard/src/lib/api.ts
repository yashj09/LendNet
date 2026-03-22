import type { AgentStatus, Loan, LoanStats, NetworkPolicy, ConsensusSession } from "./types";

const BASE = "http://localhost:3000/api";

async function parseError(res: Response, fallback: string): Promise<string> {
  try {
    const body = await res.json();
    return body.error || fallback;
  } catch {
    return `${fallback} (${res.status})`;
  }
}

export async function fetchAgents(): Promise<AgentStatus[]> {
  const res = await fetch(`${BASE}/agents`);
  if (!res.ok) throw new Error(await parseError(res, "Failed to fetch agents"));
  return res.json();
}

export async function fetchLoans(): Promise<Loan[]> {
  const res = await fetch(`${BASE}/loans`);
  if (!res.ok) throw new Error(await parseError(res, "Failed to fetch loans"));
  return res.json();
}

export async function fetchStats(): Promise<LoanStats> {
  const res = await fetch(`${BASE}/loans/stats`);
  if (!res.ok) throw new Error(await parseError(res, "Failed to fetch stats"));
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
  if (!res.ok) throw new Error(await parseError(res, "Failed to create agent"));
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
  if (!res.ok) throw new Error(await parseError(res, "Failed to request loan"));
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
  if (!res.ok) throw new Error(await parseError(res, "Failed to repay loan"));
  return res.json();
}

// ─── Governance API ────────────────────────────────────

export async function fetchPolicy(): Promise<NetworkPolicy> {
  const res = await fetch(`${BASE}/governance/policy`);
  if (!res.ok) throw new Error(await parseError(res, "Failed to fetch policy"));
  return res.json();
}

export async function fetchGovernanceSessions(): Promise<ConsensusSession[]> {
  const res = await fetch(`${BASE}/governance/sessions`);
  if (!res.ok) throw new Error(await parseError(res, "Failed to fetch sessions"));
  return res.json();
}

export async function conveneRateCommittee(): Promise<ConsensusSession> {
  const res = await fetch(`${BASE}/governance/rate-committee`, {
    method: "POST",
  });
  if (!res.ok) throw new Error(await parseError(res, "Failed to convene rate committee"));
  return res.json();
}

export async function conveneDispute(loanId: string): Promise<ConsensusSession> {
  const res = await fetch(`${BASE}/governance/dispute/${loanId}`, {
    method: "POST",
  });
  if (!res.ok) throw new Error(await parseError(res, "Failed to start dispute resolution"));
  return res.json();
}

// ─── Aave V3 DeFi API ────────────────────────────────

export async function fetchAavePosition(agentId: string): Promise<{
  position: any;
  aaveUsdtBalance: number;
}> {
  const res = await fetch(`${BASE}/agents/${agentId}/aave`);
  if (!res.ok) throw new Error(await parseError(res, "Failed to fetch Aave position"));
  return res.json();
}

export async function aaveSupply(agentId: string, amount: number): Promise<{ hash: string }> {
  const res = await fetch(`${BASE}/agents/${agentId}/aave/supply`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ amount }),
  });
  if (!res.ok) throw new Error(await parseError(res, "Aave supply failed"));
  return res.json();
}

export async function aaveWithdraw(agentId: string, amount: number): Promise<{ hash: string }> {
  const res = await fetch(`${BASE}/agents/${agentId}/aave/withdraw`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ amount }),
  });
  if (!res.ok) throw new Error(await parseError(res, "Aave withdraw failed"));
  return res.json();
}

// ─── Autonomous Loop API ──────────────────────────────

export async function startAutonomous(): Promise<{ status: string }> {
  const res = await fetch(`${BASE}/autonomous/start`, { method: "POST" });
  if (!res.ok) throw new Error(await parseError(res, "Failed to start autonomous mode"));
  return res.json();
}

export async function stopAutonomous(): Promise<{ status: string }> {
  const res = await fetch(`${BASE}/autonomous/stop`, { method: "POST" });
  if (!res.ok) throw new Error(await parseError(res, "Failed to stop autonomous mode"));
  return res.json();
}

export async function fetchAutonomousStatus(): Promise<{ running: boolean; ticks: number }> {
  const res = await fetch(`${BASE}/autonomous/status`);
  if (!res.ok) throw new Error(await parseError(res, "Failed to fetch autonomous status"));
  return res.json();
}
