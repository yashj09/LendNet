"use client";

import { useState } from "react";
import { conveneRateCommittee } from "@/lib/api";
import type { ConsensusSession, NetworkPolicy } from "@/lib/types";

const phaseColors: Record<string, string> = {
  DELIBERATION: "text-amber-400",
  DISCUSSION: "text-cyan-400",
  VOTE: "text-emerald-400",
};

const voteColors: Record<string, string> = {
  APPROVE: "text-emerald-400",
  DENY: "text-red-400",
  ABSTAIN: "text-white/40",
};

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
  const [expandedSession, setExpandedSession] = useState<string | null>(null);

  async function handleRateCommittee() {
    setLoading(true);
    setError(null);
    try {
      await conveneRateCommittee();
      onCompleted();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
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
          {loading
            ? "Agents deliberating..."
            : "Convene Rate Committee"}
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

      {/* Session History */}
      {sessions.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-[10px] uppercase tracking-widest text-white/30">
            Consensus Sessions ({sessions.length})
          </h4>
          {[...sessions].reverse().map((session) => (
            <div
              key={session.id}
              className="border border-white/10 rounded-lg overflow-hidden"
            >
              {/* Session Header */}
              <button
                onClick={() =>
                  setExpandedSession(
                    expandedSession === session.id ? null : session.id
                  )
                }
                className="w-full flex items-center justify-between p-3 hover:bg-white/5 transition-colors text-left"
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`text-xs font-mono px-1.5 py-0.5 rounded ${
                      session.outcome?.passed
                        ? "bg-emerald-500/20 text-emerald-400"
                        : "bg-red-500/20 text-red-400"
                    }`}
                  >
                    {session.outcome?.decision || "PENDING"}
                  </span>
                  <span className="text-xs text-white/60">
                    {typeLabels[session.type] || session.type}
                  </span>
                </div>
                <span className="text-[10px] text-white/20">
                  {session.id}
                </span>
              </button>

              {/* Expanded: Show deliberation */}
              {expandedSession === session.id && (
                <div className="border-t border-white/5 p-3 space-y-2 max-h-[400px] overflow-y-auto">
                  <p className="text-xs text-white/40 mb-2">{session.topic}</p>

                  {session.messages.map((msg, i) => (
                    <div
                      key={i}
                      className="bg-white/[0.03] rounded-lg p-2.5 space-y-1"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-white/70">
                            {msg.agentName}
                          </span>
                          <span className="text-[10px] text-white/30">
                            ({msg.agentRole})
                          </span>
                          <span
                            className={`text-[10px] font-mono ${phaseColors[msg.phase] || "text-white/30"}`}
                          >
                            {msg.phase}
                          </span>
                        </div>
                        {msg.vote && (
                          <span
                            className={`text-xs font-bold ${voteColors[msg.vote] || "text-white/40"}`}
                          >
                            {msg.vote}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-white/50 leading-relaxed">
                        {msg.position}
                      </p>
                    </div>
                  ))}

                  {/* Vote Summary */}
                  {session.outcome && (
                    <div
                      className={`mt-2 p-2.5 rounded-lg border ${
                        session.outcome.passed
                          ? "bg-emerald-500/10 border-emerald-500/20"
                          : "bg-red-500/10 border-red-500/20"
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span
                          className={`text-xs font-bold ${session.outcome.passed ? "text-emerald-400" : "text-red-400"}`}
                        >
                          {session.outcome.decision}
                        </span>
                        <span className="text-[10px] text-white/30">
                          {Object.values(session.outcome.votes).filter((v) => v === "APPROVE").length}/
                          {Object.keys(session.outcome.votes).length} approved
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
