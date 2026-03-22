"use client";

import { useState } from "react";
import { conveneRateCommittee } from "@/lib/api";
import ConsensusVisualizer from "./ConsensusVisualizer";
import type { ConsensusSession, NetworkPolicy } from "@/lib/types";

const typeLabels: Record<string, string> = {
  rate_committee: "Rate Committee",
  loan_approval: "Loan Approval",
  dispute_resolution: "Dispute Resolution",
};

export default function GovernancePanel({
  policy,
  sessions,
  agentCount,
  onCompleted,
}: {
  policy: NetworkPolicy | null;
  sessions: ConsensusSession[];
  agentCount: number;
  onCompleted: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);

  async function handleRateCommittee() {
    setLoading(true);
    setError(null);
    try {
      const result = await conveneRateCommittee();
      setActiveSessionId(result.id);
      onCompleted();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  // Auto-select the latest session if none is selected
  const sortedSessions = [...sessions].reverse();
  const displaySession = activeSessionId
    ? sessions.find((s) => s.id === activeSessionId) || sortedSessions[0]
    : sortedSessions[0];

  return (
    <div className="space-y-5">
      {/* Current Policy */}
      {policy && (
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white/5 rounded-lg p-3 text-center">
            <div className="text-lg font-bold text-amber-400">
              {policy.baseInterestRate}%
            </div>
            <div className="text-[10px] text-white/30 uppercase tracking-wider">
              Base Rate
            </div>
          </div>
          <div className="bg-white/5 rounded-lg p-3 text-center">
            <div className="text-lg font-bold text-cyan-400">
              {policy.minCollateralPercent}%
            </div>
            <div className="text-[10px] text-white/30 uppercase tracking-wider">
              Min Collateral
            </div>
          </div>
          <div className="bg-white/5 rounded-lg p-3 text-center">
            <div className="text-lg font-bold text-violet-400">
              ${policy.maxLoanAmount}
            </div>
            <div className="text-[10px] text-white/30 uppercase tracking-wider">
              Max Loan
            </div>
          </div>
        </div>
      )}

      {policy?.reasoning && (
        <p className="text-xs text-white/30 italic">{policy.reasoning}</p>
      )}

      {/* Actions */}
      <div className="flex gap-2">
        <button
          onClick={handleRateCommittee}
          disabled={loading || agentCount < 3}
          className="flex-1 px-4 py-2.5 rounded-lg text-sm font-semibold bg-amber-500/20 text-amber-400 border border-amber-500/30 hover:bg-amber-500/30 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
        >
          {loading ? "Agents deliberating..." : "Convene Rate Committee"}
        </button>
      </div>

      {agentCount < 3 && (
        <p className="text-xs text-white/20 text-center">
          Need 3+ agents for governance consensus
        </p>
      )}

      {error && (
        <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg p-2">
          {error}
        </p>
      )}

      {/* Visual Consensus Network */}
      {displaySession && (
        <div className="border border-white/10 rounded-xl bg-white/[0.02] p-5">
          <ConsensusVisualizer session={displaySession} />
        </div>
      )}

      {/* Session Selector (if multiple) */}
      {sortedSessions.length > 1 && (
        <div className="space-y-2">
          <h4 className="text-[10px] uppercase tracking-widest text-white/30">
            All Sessions ({sortedSessions.length})
          </h4>
          <div className="flex flex-wrap gap-2">
            {sortedSessions.map((session) => {
              const isActive =
                displaySession?.id === session.id;
              return (
                <button
                  key={session.id}
                  onClick={() => setActiveSessionId(session.id)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs border transition-all ${
                    isActive
                      ? "border-amber-500/40 bg-amber-500/10 text-amber-400"
                      : "border-white/10 bg-white/[0.02] text-white/40 hover:text-white/60 hover:border-white/20"
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      session.outcome?.passed
                        ? "bg-emerald-400"
                        : session.outcome
                          ? "bg-red-400"
                          : "bg-blue-400 animate-pulse"
                    }`}
                  />
                  <span className="font-mono">{session.id.slice(0, 12)}</span>
                  <span className="text-white/20">
                    {typeLabels[session.type] || session.type}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
