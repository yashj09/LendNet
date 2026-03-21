"use client";

import { useState } from "react";
import { repayLoan } from "@/lib/api";
import type { Loan } from "@/lib/types";

export default function RepayLoanForm({
  loans,
  onCompleted,
}: {
  loans: Loan[];
  onCompleted: () => void;
}) {
  const [loanId, setLoanId] = useState("");
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const repayable = loans.filter(
    (l) => l.status === "funded" || l.status === "repaying",
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!loanId) return;
    setLoading(true);
    setResult(null);
    try {
      const res = await repayLoan(
        loanId,
        amount ? parseFloat(amount) : undefined,
      );
      setResult(
        `Repaid! TX: ${res.txHash} | Remaining: $${res.remaining.toFixed(2)}`,
      );
      setAmount("");
      onCompleted();
    } catch (err: unknown) {
      setResult(`Error: ${err instanceof Error ? err.message : "Unknown"}`);
    } finally {
      setLoading(false);
    }
  }

  if (!repayable.length) {
    return (
      <p className="text-white/30 text-sm text-center py-4">
        No active loans to repay.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="flex gap-2">
        <select
          value={loanId}
          onChange={(e) => setLoanId(e.target.value)}
          className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500/50 transition-colors"
        >
          <option value="">Select loan...</option>
          {repayable.map((l) => (
            <option key={l.id} value={l.id}>
              {l.id} — ${l.terms.amount} ({l.status})
            </option>
          ))}
        </select>
        <input
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="Amount (empty = full)"
          min="0.01"
          step="0.01"
          className="w-40 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-cyan-500/50 transition-colors"
        />
        <button
          type="submit"
          disabled={loading || !loanId}
          className="px-4 py-2 rounded-lg text-sm font-semibold bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 hover:bg-cyan-500/30 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
        >
          {loading ? "Repaying..." : "Repay"}
        </button>
      </div>
      {result && (
        <p className="text-xs text-white/40 break-all">{result}</p>
      )}
    </form>
  );
}
