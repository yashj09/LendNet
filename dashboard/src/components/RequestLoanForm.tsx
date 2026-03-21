"use client";

import { useState } from "react";
import { requestLoan } from "@/lib/api";
import type { AgentStatus } from "@/lib/types";

export default function RequestLoanForm({
  agents,
  onCompleted,
}: {
  agents: AgentStatus[];
  onCompleted: () => void;
}) {
  const [borrowerId, setBorrowerId] = useState("");
  const [amount, setAmount] = useState("100");
  const [purpose, setPurpose] = useState("");
  const [rate, setRate] = useState("12");
  const [collateral, setCollateral] = useState("40");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    text: string;
    success: boolean;
  } | null>(null);

  const borrowers = agents.filter(
    (a) => a.role === "borrower" || a.role === "both",
  );
  const hasLender = agents.some(
    (a) => a.role === "lender" || a.role === "both",
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!borrowerId || !amount || !purpose.trim()) return;
    setLoading(true);
    setResult(null);
    try {
      const res = await requestLoan({
        borrowerId,
        amount: parseFloat(amount),
        purpose: purpose.trim(),
        offeredRate: parseFloat(rate),
        offeredCollateral: parseFloat(collateral),
      });
      if (res.agreed) {
        setResult({
          text: `Loan ${res.loanId} APPROVED! TX: ${res.txHash}`,
          success: true,
        });
      } else {
        setResult({
          text: `Loan ${res.loanId} — Negotiation failed, no agreement reached.`,
          success: false,
        });
      }
      setPurpose("");
      onCompleted();
    } catch (err: unknown) {
      setResult({
        text: `Error: ${err instanceof Error ? err.message : "Unknown"}`,
        success: false,
      });
    } finally {
      setLoading(false);
    }
  }

  if (agents.length < 2) {
    return (
      <p className="text-white/30 text-sm text-center py-4">
        Create at least 2 agents (1 lender + 1 borrower) to request a loan.
      </p>
    );
  }

  if (!hasLender) {
    return (
      <p className="text-white/30 text-sm text-center py-4">
        Need at least 1 lender agent to process loans.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <select
          value={borrowerId}
          onChange={(e) => setBorrowerId(e.target.value)}
          className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500/50 transition-colors"
        >
          <option value="">Select borrower...</option>
          {borrowers.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name} (Score: {a.creditScore})
            </option>
          ))}
        </select>
        <input
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="Amount (USDT)"
          min="1"
          step="0.01"
          className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-violet-500/50 transition-colors"
        />
      </div>
      <input
        type="text"
        value={purpose}
        onChange={(e) => setPurpose(e.target.value)}
        placeholder="Loan purpose (e.g. 'Capital for DeFi yield strategy')"
        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-violet-500/50 transition-colors"
      />
      <div className="grid grid-cols-2 gap-2">
        <div className="flex items-center gap-2">
          <label className="text-xs text-white/40 shrink-0">Max Rate:</label>
          <input
            type="number"
            value={rate}
            onChange={(e) => setRate(e.target.value)}
            min="1"
            max="50"
            step="0.5"
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500/50 transition-colors"
          />
          <span className="text-xs text-white/30">%</span>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-white/40 shrink-0">Collateral:</label>
          <input
            type="number"
            value={collateral}
            onChange={(e) => setCollateral(e.target.value)}
            min="0"
            max="150"
            step="5"
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500/50 transition-colors"
          />
          <span className="text-xs text-white/30">%</span>
        </div>
      </div>
      <button
        type="submit"
        disabled={loading || !borrowerId || !amount || !purpose.trim()}
        className="w-full px-4 py-2.5 rounded-lg text-sm font-semibold bg-violet-500/20 text-violet-400 border border-violet-500/30 hover:bg-violet-500/30 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
      >
        {loading
          ? "Negotiating... (AI agents are discussing terms)"
          : "Request Loan & Start AI Negotiation"}
      </button>
      {result && (
        <div
          className={`text-xs p-3 rounded-lg break-all ${
            result.success
              ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
              : "bg-red-500/10 text-red-400 border border-red-500/20"
          }`}
        >
          {result.text}
        </div>
      )}
    </form>
  );
}
