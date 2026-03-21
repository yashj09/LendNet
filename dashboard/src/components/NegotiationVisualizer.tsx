"use client";

import { useMemo, useState, useEffect, useRef } from "react";
import type { NegotiationMessage, LoanTerms, ConsensusSession } from "@/lib/types";

/* ─── Color System ────────────────────────────────────── */

const LENDER = {
  text: "#34d399",
  bg: "rgba(52,211,153,0.08)",
  border: "rgba(52,211,153,0.3)",
  bubbleBg: "rgba(52,211,153,0.06)",
  bubbleBorder: "rgba(52,211,153,0.2)",
};

const BORROWER = {
  text: "#a78bfa",
  bg: "rgba(167,139,250,0.08)",
  border: "rgba(167,139,250,0.3)",
  bubbleBg: "rgba(167,139,250,0.06)",
  bubbleBorder: "rgba(167,139,250,0.2)",
};

const actionStyles: Record<string, { color: string; bg: string; border: string }> = {
  PROPOSE: { color: "#c084fc", bg: "rgba(192,132,252,0.1)", border: "rgba(192,132,252,0.3)" },
  COUNTER: { color: "#fbbf24", bg: "rgba(251,191,36,0.1)", border: "rgba(251,191,36,0.3)" },
  ACCEPT: { color: "#34d399", bg: "rgba(52,211,153,0.1)", border: "rgba(52,211,153,0.3)" },
  REJECT: { color: "#f87171", bg: "rgba(248,113,113,0.1)", border: "rgba(248,113,113,0.3)" },
};

const voteColors: Record<string, { color: string; bg: string }> = {
  APPROVE: { color: "#34d399", bg: "rgba(52,211,153,0.1)" },
  DENY: { color: "#f87171", bg: "rgba(248,113,113,0.1)" },
  ABSTAIN: { color: "#6b7280", bg: "rgba(107,114,128,0.1)" },
};

const roleNodeColors: Record<string, { text: string; bg: string; border: string }> = {
  lender: { text: "#34d399", bg: "rgba(52,211,153,0.15)", border: "rgba(52,211,153,0.4)" },
  borrower: { text: "#a78bfa", bg: "rgba(167,139,250,0.15)", border: "rgba(167,139,250,0.4)" },
  both: { text: "#60a5fa", bg: "rgba(96,165,250,0.15)", border: "rgba(96,165,250,0.4)" },
};

/* ─── Helpers ─────────────────────────────────────────── */

function formatDuration(ms: number): string {
  const hours = ms / (1000 * 60 * 60);
  if (hours < 24) return `${hours.toFixed(0)}h`;
  const days = hours / 24;
  if (days < 30) return `${days.toFixed(0)}d`;
  return `${(days / 30).toFixed(1)}mo`;
}

interface TermDiff {
  field: string;
  label: string;
  prev: number;
  curr: number;
  format: (v: number) => string;
  direction: number;
}

function computeDiffs(prev: LoanTerms, curr: LoanTerms): TermDiff[] {
  const diffs: TermDiff[] = [];
  if (prev.amount !== curr.amount)
    diffs.push({ field: "amount", label: "Amount", prev: prev.amount, curr: curr.amount, format: (v) => `$${v.toFixed(0)}`, direction: curr.amount > prev.amount ? 1 : -1 });
  if (prev.interestRate !== curr.interestRate)
    diffs.push({ field: "rate", label: "Rate", prev: prev.interestRate, curr: curr.interestRate, format: (v) => `${v}%`, direction: curr.interestRate < prev.interestRate ? 1 : -1 });
  if (prev.durationMs !== curr.durationMs)
    diffs.push({ field: "duration", label: "Duration", prev: prev.durationMs, curr: curr.durationMs, format: (v) => formatDuration(v), direction: curr.durationMs > prev.durationMs ? 1 : -1 });
  if (prev.collateralPercent !== curr.collateralPercent)
    diffs.push({ field: "collateral", label: "Collateral", prev: prev.collateralPercent, curr: curr.collateralPercent, format: (v) => `${v}%`, direction: curr.collateralPercent < prev.collateralPercent ? 1 : -1 });
  return diffs;
}

/* ─── SVG Components ──────────────────────────────────── */

function AgentAvatar({ color, size = 48 }: { color: typeof LENDER; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48">
      <circle cx="24" cy="24" r="22" fill={color.bg} stroke={color.border} strokeWidth="1.5" />
      <circle cx="24" cy="18" r="7" fill="none" stroke={color.text} strokeWidth="1.5" opacity="0.8" />
      <path d="M12 42 Q12 28 24 28 Q36 28 36 42" fill="none" stroke={color.text} strokeWidth="1.5" opacity="0.6" />
    </svg>
  );
}

function HandshakeIcon() {
  return (
    <svg width="64" height="64" viewBox="0 0 64 64" className="animate-pulse">
      <path d="M8 36 L16 28 L24 32 L32 28" fill="none" stroke="#34d399" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M56 36 L48 28 L40 32 L32 28" fill="none" stroke="#a78bfa" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="32" cy="28" r="4" fill="rgba(251,191,36,0.3)" stroke="#fbbf24" strokeWidth="1.5" />
      <circle cx="20" cy="18" r="1.5" fill="#34d399" opacity="0.6" />
      <circle cx="44" cy="18" r="1.5" fill="#a78bfa" opacity="0.6" />
      <circle cx="32" cy="14" r="1" fill="#fbbf24" opacity="0.8" />
      <path d="M8 36 L4 44" stroke="#34d399" strokeWidth="2" strokeLinecap="round" opacity="0.4" />
      <path d="M56 36 L60 44" stroke="#a78bfa" strokeWidth="2" strokeLinecap="round" opacity="0.4" />
    </svg>
  );
}

function BreakIcon() {
  return (
    <svg width="64" height="64" viewBox="0 0 64 64">
      <path d="M10 24 L22 24 L26 32 L22 40 L10 40 Z" fill="rgba(248,113,113,0.1)" stroke="#f87171" strokeWidth="1.5" />
      <path d="M54 24 L42 24 L38 32 L42 40 L54 40 Z" fill="rgba(248,113,113,0.1)" stroke="#f87171" strokeWidth="1.5" />
      <path d="M28 20 L32 28 L28 36 L32 44" stroke="#f87171" strokeWidth="2" strokeLinecap="round" strokeDasharray="3 3" opacity="0.6" />
      <path d="M36 20 L32 28 L36 36 L32 44" stroke="#f87171" strokeWidth="2" strokeLinecap="round" strokeDasharray="3 3" opacity="0.6" />
    </svg>
  );
}

/* ─── Terms Card ──────────────────────────────────────── */

function TermsCard({ terms, diffs }: { terms: LoanTerms; diffs?: TermDiff[] }) {
  const diffMap = new Map(diffs?.map((d) => [d.field, d]));
  const fields = [
    { key: "amount", label: "Amount", value: `$${terms.amount.toFixed(0)}` },
    { key: "rate", label: "Rate", value: `${terms.interestRate}%` },
    { key: "duration", label: "Duration", value: formatDuration(terms.durationMs) },
    { key: "collateral", label: "Collateral", value: `${terms.collateralPercent}%` },
  ];

  return (
    <div className="grid grid-cols-4 gap-1.5">
      {fields.map(({ key, label, value }) => {
        const diff = diffMap.get(key);
        return (
          <div
            key={key}
            className="rounded-lg px-2 py-1.5 text-center"
            style={{
              backgroundColor: diff ? (diff.direction > 0 ? "rgba(52,211,153,0.08)" : "rgba(248,113,113,0.08)") : "rgba(255,255,255,0.03)",
              border: diff ? `1px solid ${diff.direction > 0 ? "rgba(52,211,153,0.2)" : "rgba(248,113,113,0.2)"}` : "1px solid rgba(255,255,255,0.05)",
            }}
          >
            <div className="text-[9px] uppercase tracking-wider text-white/30 mb-0.5">{label}</div>
            {diff ? (
              <div className="flex items-center justify-center gap-1">
                <span className="text-[10px] text-white/30 line-through">{diff.format(diff.prev)}</span>
                <span className="text-[10px]" style={{ color: diff.direction > 0 ? "#34d399" : "#f87171" }}>&rarr;</span>
                <span className="text-xs font-bold" style={{ color: diff.direction > 0 ? "#34d399" : "#f87171" }}>{diff.format(diff.curr)}</span>
              </div>
            ) : (
              <div className="text-xs font-semibold text-white/70">{value}</div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ─── Committee Phase (Inline Governance) ─────────────── */

function ScalesIcon({ passed }: { passed: boolean }) {
  const accentColor = passed ? "#34d399" : "#f87171";
  const tilt = passed ? -8 : 8;
  return (
    <svg width="40" height="40" viewBox="0 0 48 48">
      {/* Pillar */}
      <line x1="24" y1="10" x2="24" y2="40" stroke="#fbbf24" strokeWidth="2" opacity="0.5" />
      {/* Base */}
      <line x1="16" y1="40" x2="32" y2="40" stroke="#fbbf24" strokeWidth="2" strokeLinecap="round" opacity="0.4" />
      {/* Beam (tilted based on outcome) */}
      <line
        x1="8" y1={20 + tilt} x2="40" y2={20 - tilt}
        stroke="#fbbf24" strokeWidth="2" strokeLinecap="round"
      />
      {/* Left pan */}
      <path
        d={`M4 ${22 + tilt} Q4 ${30 + tilt} 12 ${30 + tilt} Q20 ${30 + tilt} 20 ${22 + tilt}`}
        fill="none" stroke={passed ? "#34d399" : "rgba(255,255,255,0.3)"} strokeWidth="1.5"
      />
      {/* Right pan */}
      <path
        d={`M28 ${22 - tilt} Q28 ${30 - tilt} 36 ${30 - tilt} Q44 ${30 - tilt} 44 ${22 - tilt}`}
        fill="none" stroke={passed ? "rgba(255,255,255,0.3)" : "#f87171"} strokeWidth="1.5"
      />
      {/* Crown */}
      <circle cx="24" cy="10" r="3" fill="#fbbf24" opacity="0.6" />
      {/* Verdict checkmark or X in heavier pan */}
      {passed ? (
        <path d={`M8 ${25 + tilt} l3 3 5-5`} fill="none" stroke={accentColor} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      ) : (
        <g>
          <line x1={33} y1={25 - tilt} x2={39} y2={29 - tilt} stroke={accentColor} strokeWidth="1.5" strokeLinecap="round" />
          <line x1={39} y1={25 - tilt} x2={33} y2={29 - tilt} stroke={accentColor} strokeWidth="1.5" strokeLinecap="round" />
        </g>
      )}
    </svg>
  );
}

function CommitteePhase({
  session,
  visible,
}: {
  session: ConsensusSession;
  visible: boolean;
}) {
  const [revealedAgents, setRevealedAgents] = useState(0);
  const [verdictVisible, setVerdictVisible] = useState(false);
  const passed = session.outcome?.passed;
  const approveCount = session.outcome ? Object.values(session.outcome.votes).filter((v) => v === "APPROVE").length : 0;
  const totalVotes = session.outcome ? Object.keys(session.outcome.votes).length : 0;

  const agents = useMemo(() => {
    const map = new Map<string, { name: string; role: string; deliberation?: string; vote?: string; position?: string }>();
    for (const msg of session.messages) {
      const existing = map.get(msg.agentId) || { name: msg.agentName, role: msg.agentRole };
      if (msg.phase === "DELIBERATION") existing.deliberation = msg.position;
      if (msg.phase === "VOTE") { existing.vote = msg.vote; existing.position = msg.position; }
      map.set(msg.agentId, existing);
    }
    return Array.from(map.values());
  }, [session.messages]);

  // Sequential agent reveal + verdict
  useEffect(() => {
    if (!visible) { setRevealedAgents(0); setVerdictVisible(false); return; }
    if (revealedAgents < agents.length) {
      const t = setTimeout(() => setRevealedAgents((c) => c + 1), revealedAgents === 0 ? 400 : 500);
      return () => clearTimeout(t);
    }
    if (revealedAgents >= agents.length && !verdictVisible) {
      const t = setTimeout(() => setVerdictVisible(true), 600);
      return () => clearTimeout(t);
    }
  }, [visible, revealedAgents, agents.length, verdictVisible]);

  return (
    <div
      className="transition-all duration-700 mb-4"
      style={{ opacity: visible ? 1 : 0, transform: visible ? "translateY(0)" : "translateY(20px)" }}
    >
      <style>{`
        @keyframes scanLine {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(200%); }
        }
        @keyframes verdictStamp {
          0% { transform: scale(3) rotate(-10deg); opacity: 0; }
          60% { transform: scale(0.95) rotate(1deg); opacity: 1; }
          80% { transform: scale(1.02) rotate(-0.5deg); }
          100% { transform: scale(1) rotate(0deg); opacity: 1; }
        }
        @keyframes borderPulse {
          0%, 100% { border-color: rgba(251,191,36,0.15); }
          50% { border-color: rgba(251,191,36,0.35); }
        }
        .committee-container { animation: borderPulse 3s ease-in-out infinite; }
        .verdict-stamp { animation: verdictStamp 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) both; }
      `}</style>

      {/* Header bar */}
      <div className="flex items-center gap-3 mb-3">
        <div className="flex-1 h-px" style={{ background: "linear-gradient(to right, transparent, rgba(251,191,36,0.3), transparent)" }} />
        <div className="relative flex items-center gap-2 px-4 py-1.5 rounded border border-amber-500/30 bg-amber-500/[0.06] overflow-hidden">
          <div className="absolute inset-0 overflow-hidden">
            <div className="h-full w-1/3" style={{ background: "linear-gradient(90deg, transparent, rgba(251,191,36,0.08), transparent)", animation: "scanLine 2.5s linear infinite" }} />
          </div>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth="2.5" strokeLinecap="round">
            <path d="M12 2 L2 7 L12 12 L22 7 Z" opacity="0.7" />
            <path d="M2 17 L12 22 L22 17" opacity="0.4" />
            <path d="M2 12 L12 17 L22 12" opacity="0.55" />
          </svg>
          <span className="text-[10px] font-bold tracking-[0.15em] text-amber-400 uppercase relative z-10">
            Committee Tribunal
          </span>
        </div>
        <div className="flex-1 h-px" style={{ background: "linear-gradient(to right, rgba(251,191,36,0.3), transparent)" }} />
      </div>

      {/* Main tribunal container */}
      <div className="rounded-xl border border-amber-500/15 committee-container overflow-hidden" style={{ background: "linear-gradient(180deg, rgba(251,191,36,0.03) 0%, rgba(0,0,0,0) 40%)" }}>
        {/* Topic bar */}
        <div className="px-4 py-2.5 border-b border-amber-500/10" style={{ background: "rgba(251,191,36,0.02)" }}>
          <p className="text-[11px] text-white/50 text-center font-mono">{session.topic}</p>
        </div>

        {/* Tribunal bench — horizontal panel */}
        <div className="p-4">
          <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${agents.length}, 1fr)` }}>
            {agents.map((agent, i) => {
              const rc = roleNodeColors[agent.role] || roleNodeColors.both;
              const isRevealed = i < revealedAgents;
              const isApprove = agent.vote === "APPROVE";
              const isDeny = agent.vote === "DENY";
              const voteBorderColor = isApprove ? "rgba(52,211,153,0.4)" : isDeny ? "rgba(248,113,113,0.4)" : "rgba(255,255,255,0.08)";
              const voteGlow = isApprove ? "0 0 12px rgba(52,211,153,0.15)" : isDeny ? "0 0 12px rgba(248,113,113,0.15)" : "none";

              return (
                <div
                  key={i}
                  className="rounded-lg border relative overflow-hidden transition-all duration-500"
                  style={{
                    opacity: isRevealed ? 1 : 0,
                    transform: isRevealed ? "translateY(0) scale(1)" : "translateY(15px) scale(0.95)",
                    borderColor: isRevealed ? voteBorderColor : "rgba(255,255,255,0.05)",
                    backgroundColor: "rgba(255,255,255,0.02)",
                    boxShadow: isRevealed ? voteGlow : "none",
                  }}
                >
                  {/* Top accent line */}
                  <div
                    className="h-0.5 transition-all duration-500"
                    style={{
                      background: isRevealed
                        ? isApprove
                          ? "linear-gradient(90deg, transparent, #34d399, transparent)"
                          : isDeny
                            ? "linear-gradient(90deg, transparent, #f87171, transparent)"
                            : "linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent)"
                        : "transparent",
                    }}
                  />

                  <div className="p-3 space-y-2.5">
                    {/* Agent identity row */}
                    <div className="flex items-center gap-2.5">
                      <div className="flex-shrink-0">
                        <svg width="32" height="32" viewBox="0 0 48 48">
                          <circle cx="24" cy="24" r="22" fill={rc.bg} stroke={rc.border} strokeWidth="2" />
                          <circle cx="24" cy="18" r="7" fill="none" stroke={rc.text} strokeWidth="2" opacity="0.8" />
                          <path d="M12 42 Q12 28 24 28 Q36 28 36 42" fill="none" stroke={rc.text} strokeWidth="2" opacity="0.6" />
                        </svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold text-white/80 truncate">{agent.name}</div>
                        <div className="text-[9px] font-mono uppercase tracking-wider" style={{ color: rc.text }}>{agent.role}</div>
                      </div>
                      {/* Vote stamp */}
                      {agent.vote && isRevealed && (
                        <div
                          className="flex-shrink-0 px-2 py-1 rounded border text-[10px] font-black tracking-wider"
                          style={{
                            color: isApprove ? "#34d399" : "#f87171",
                            borderColor: isApprove ? "rgba(52,211,153,0.4)" : "rgba(248,113,113,0.4)",
                            backgroundColor: isApprove ? "rgba(52,211,153,0.1)" : "rgba(248,113,113,0.1)",
                            transform: `rotate(${isApprove ? -2 : 2}deg)`,
                          }}
                        >
                          {agent.vote}
                        </div>
                      )}
                    </div>

                    {/* Reasoning quote */}
                    {agent.position && isRevealed && (
                      <div className="relative pl-2.5" style={{ borderLeft: `2px solid ${isApprove ? "rgba(52,211,153,0.3)" : isDeny ? "rgba(248,113,113,0.3)" : "rgba(255,255,255,0.1)"}` }}>
                        <p className="text-[10px] text-white/40 leading-relaxed line-clamp-3">
                          {agent.position}
                        </p>
                      </div>
                    )}

                    {/* Not yet revealed — scanning placeholder */}
                    {!isRevealed && (
                      <div className="space-y-1.5">
                        <div className="h-2 rounded-full bg-white/[0.04] overflow-hidden">
                          <div className="h-full w-1/3" style={{ background: "linear-gradient(90deg, transparent, rgba(251,191,36,0.15), transparent)", animation: "scanLine 1.5s linear infinite" }} />
                        </div>
                        <div className="h-2 w-2/3 rounded-full bg-white/[0.03]" />
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Connecting bench line under agents */}
          <div className="flex items-center mt-3 mb-1 px-2">
            <div className="flex-1 h-px" style={{ background: "linear-gradient(90deg, transparent, rgba(251,191,36,0.2))" }} />
            <div className="mx-2">
              <svg width="6" height="6" viewBox="0 0 6 6">
                <rect width="6" height="6" rx="1" fill="#fbbf24" opacity="0.3" transform="rotate(45 3 3)" />
              </svg>
            </div>
            <div className="flex-1 h-px" style={{ background: "rgba(251,191,36,0.2)" }} />
            <div className="mx-2">
              <svg width="6" height="6" viewBox="0 0 6 6">
                <rect width="6" height="6" rx="1" fill="#fbbf24" opacity="0.3" transform="rotate(45 3 3)" />
              </svg>
            </div>
            <div className="flex-1 h-px" style={{ background: "linear-gradient(90deg, rgba(251,191,36,0.2), transparent)" }} />
          </div>
        </div>

        {/* Verdict banner */}
        {session.outcome && verdictVisible && (
          <div
            className="border-t p-4"
            style={{
              borderColor: passed ? "rgba(52,211,153,0.2)" : "rgba(248,113,113,0.2)",
              background: passed
                ? "linear-gradient(180deg, rgba(52,211,153,0.06), rgba(52,211,153,0.02))"
                : "linear-gradient(180deg, rgba(248,113,113,0.06), rgba(248,113,113,0.02))",
            }}
          >
            <div className="flex items-center justify-center gap-4 verdict-stamp">
              <ScalesIcon passed={!!passed} />
              <div className="text-center">
                <div
                  className="text-lg font-black tracking-[0.2em] uppercase"
                  style={{
                    color: passed ? "#34d399" : "#f87171",
                    textShadow: passed
                      ? "0 0 20px rgba(52,211,153,0.3)"
                      : "0 0 20px rgba(248,113,113,0.3)",
                  }}
                >
                  {passed ? "APPROVED" : "DENIED"}
                </div>
                <div className="text-[10px] text-white/30 font-mono mt-0.5">
                  {approveCount} approve &middot; {totalVotes - approveCount} deny &middot; {totalVotes} total
                </div>
              </div>
              <ScalesIcon passed={!!passed} />
            </div>
          </div>
        )}

        {/* Still deliberating state */}
        {!session.outcome && (
          <div className="border-t border-amber-500/10 p-3 text-center">
            <div className="flex items-center justify-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
              <span className="text-[10px] text-amber-400/60 font-mono uppercase tracking-wider">Agents deliberating...</span>
            </div>
          </div>
        )}
      </div>

      {/* Arrow to negotiation */}
      {passed && verdictVisible && (
        <div className="flex justify-center py-3 transition-all duration-500" style={{ opacity: verdictVisible ? 1 : 0 }}>
          <div className="flex flex-col items-center gap-1">
            <div className="w-px h-8" style={{ background: "linear-gradient(to bottom, rgba(52,211,153,0.3), rgba(52,211,153,0.1))" }} />
            <svg width="20" height="12" viewBox="0 0 20 12">
              <path d="M2 2 L10 10 L18 2" fill="none" stroke="rgba(52,211,153,0.4)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="text-[9px] text-white/20 uppercase tracking-[0.15em]">Proceeding to Negotiation</span>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Main Component ──────────────────────────────────── */

export default function NegotiationVisualizer({
  messages,
  committeeSession,
}: {
  messages: NegotiationMessage[];
  committeeSession?: ConsensusSession | null;
}) {
  // Sequential reveal state
  const [visibleCount, setVisibleCount] = useState(0);
  const [committeeVisible, setCommitteeVisible] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const hasCommittee = !!committeeSession;
  const committeeDenied = hasCommittee && committeeSession?.outcome && !committeeSession.outcome.passed;

  const outcome = useMemo(() => {
    if (!messages.length) return null;
    const last = messages[messages.length - 1];
    if (last.action === "ACCEPT") return "accepted";
    if (last.action === "REJECT") return "rejected";
    return null;
  }, [messages]);

  const finalTerms = useMemo(() => {
    if (!messages.length || outcome !== "accepted") return null;
    const lastIdx = messages.length - 1;
    return lastIdx > 0 ? messages[lastIdx - 1].terms : messages[lastIdx].terms;
  }, [messages, outcome]);

  // Reset on new loan selection
  const msgKey = messages.length > 0 ? `${messages[0].timestamp}-${messages.length}` : "empty";
  useEffect(() => {
    setVisibleCount(0);
    setCommitteeVisible(false);
  }, [msgKey]);

  // Sequential reveal via interval — doesn't cancel itself
  const totalItems = messages.length + (outcome ? 1 : 0);
  useEffect(() => {
    if (hasCommittee && !committeeVisible) {
      const t = setTimeout(() => setCommitteeVisible(true), 300);
      return () => clearTimeout(t);
    }

    if (visibleCount >= totalItems) return;

    const t = setTimeout(() => {
      setVisibleCount((c) => c + 1);
      if (scrollRef.current) {
        scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
      }
    }, visibleCount === 0 ? 300 : 600);

    return () => clearTimeout(t);
  }, [visibleCount, totalItems, hasCommittee, committeeVisible]);

  // Empty state
  if (!messages.length && !hasCommittee) {
    return (
      <div className="text-center py-16">
        <svg width="48" height="48" viewBox="0 0 48 48" className="mx-auto mb-4 opacity-20">
          <circle cx="24" cy="24" r="22" fill="none" stroke="white" strokeWidth="1" strokeDasharray="4 4" />
          <path d="M16 24 L22 30 L32 18" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" opacity="0.3" />
        </svg>
        <p className="text-white/30 text-sm">Negotiations will appear here when a loan is requested.</p>
        <p className="text-white/15 text-xs mt-1">AI agents negotiate terms in real-time</p>
      </div>
    );
  }

  // Committee denied — show only committee phase with blocked message
  if (committeeDenied && !messages.length) {
    return (
      <div className="space-y-4">
        {hasCommittee && <CommitteePhase session={committeeSession!} visible={committeeVisible} />}

        {committeeVisible && (
          <div
            className="rounded-xl border border-red-500/20 bg-red-500/[0.03] p-6 text-center space-y-3 transition-all duration-700"
            style={{ opacity: committeeVisible ? 1 : 0 }}
          >
            <BreakIcon />
            <div className="text-sm font-bold text-red-400">BLOCKED BY COMMITTEE</div>
            <p className="text-[11px] text-white/30">
              The agent committee denied this loan request. Negotiation did not proceed.
            </p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-0">
      {/* VS Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <AgentAvatar color={LENDER} size={44} />
          <div>
            <div className="text-xs font-semibold" style={{ color: LENDER.text }}>LENDER</div>
            <div className="text-[10px] text-white/25 font-mono">Capital Provider</div>
          </div>
        </div>
        <div className="flex flex-col items-center">
          <div className="text-[10px] font-bold tracking-[0.3em] px-3 py-1 rounded-full border" style={{ color: "rgba(255,255,255,0.4)", borderColor: "rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.02)" }}>
            VS
          </div>
          <div className="text-[9px] text-white/15 mt-1">{messages.length} round{messages.length !== 1 ? "s" : ""}</div>
        </div>
        <div className="flex items-center gap-3 flex-row-reverse">
          <AgentAvatar color={BORROWER} size={44} />
          <div className="text-right">
            <div className="text-xs font-semibold" style={{ color: BORROWER.text }}>BORROWER</div>
            <div className="text-[10px] text-white/25 font-mono">Loan Seeker</div>
          </div>
        </div>
      </div>

      {/* Committee Phase (if applicable) */}
      {hasCommittee && <CommitteePhase session={committeeSession!} visible={committeeVisible} />}

      {/* Center divider + Rounds Timeline */}
      <div className="relative" ref={scrollRef} style={{ maxHeight: "600px", overflowY: "auto" }}>
        <div
          className="absolute left-1/2 top-0 bottom-0 w-px -translate-x-1/2"
          style={{ background: "linear-gradient(to bottom, rgba(255,255,255,0.05), rgba(255,255,255,0.1), rgba(255,255,255,0.05))" }}
        />

        <div className="space-y-4 relative py-2">
          {messages.map((msg, i) => {
            const isLender = msg.from === "lender";
            const agent = isLender ? LENDER : BORROWER;
            const action = actionStyles[msg.action];
            const prevTerms = i > 0 ? messages[i - 1].terms : null;
            const diffs = prevTerms ? computeDiffs(prevTerms, msg.terms) : [];
            const isVisible = i < visibleCount;

            return (
              <div
                key={i}
                className="relative transition-all duration-700"
                style={{
                  opacity: isVisible ? 1 : 0,
                  transform: isVisible
                    ? "translateY(0)"
                    : isLender
                      ? "translateX(-30px) translateY(10px)"
                      : "translateX(30px) translateY(10px)",
                  pointerEvents: isVisible ? "auto" : "none",
                }}
              >
                {/* Timeline dot */}
                <div
                  className="absolute left-1/2 top-4 -translate-x-1/2 z-10 w-3 h-3 rounded-full border-2 transition-all duration-500"
                  style={{
                    borderColor: isVisible ? action.color : "transparent",
                    backgroundColor: isVisible ? action.bg : "transparent",
                    transform: isVisible ? "scale(1)" : "scale(0)",
                  }}
                />

                {/* Round content */}
                <div className="grid grid-cols-2 gap-4">
                  {/* Left side */}
                  <div className={isLender ? "" : "opacity-0 pointer-events-none"}>
                    {isLender && (
                      <div className="rounded-xl p-3.5 space-y-2.5 relative" style={{ backgroundColor: agent.bubbleBg, border: `1px solid ${agent.bubbleBorder}` }}>
                        <div className="absolute top-4 -right-2 w-0 h-0" style={{ borderTop: "6px solid transparent", borderBottom: "6px solid transparent", borderLeft: `8px solid ${agent.bubbleBorder}` }} />
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ color: action.color, backgroundColor: action.bg, border: `1px solid ${action.border}` }}>{msg.action}</span>
                          <span className="text-[10px] font-mono text-white/20">R{msg.round}</span>
                        </div>
                        <TermsCard terms={msg.terms} diffs={diffs} />
                        <p className="text-[11px] text-white/45 leading-relaxed italic">&ldquo;{msg.reasoning}&rdquo;</p>
                      </div>
                    )}
                  </div>

                  {/* Right side */}
                  <div className={!isLender ? "" : "opacity-0 pointer-events-none"}>
                    {!isLender && (
                      <div className="rounded-xl p-3.5 space-y-2.5 relative" style={{ backgroundColor: agent.bubbleBg, border: `1px solid ${agent.bubbleBorder}` }}>
                        <div className="absolute top-4 -left-2 w-0 h-0" style={{ borderTop: "6px solid transparent", borderBottom: "6px solid transparent", borderRight: `8px solid ${agent.bubbleBorder}` }} />
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-mono text-white/20">R{msg.round}</span>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ color: action.color, backgroundColor: action.bg, border: `1px solid ${action.border}` }}>{msg.action}</span>
                        </div>
                        <TermsCard terms={msg.terms} diffs={diffs} />
                        <p className="text-[11px] text-white/45 leading-relaxed italic">&ldquo;{msg.reasoning}&rdquo;</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Outcome */}
      {outcome && visibleCount > messages.length - 1 && (
        <div className="pt-4">
          <div
            className={`rounded-xl border p-5 text-center space-y-3 transition-all duration-700 ${outcome === "accepted" ? "animate-pulse" : ""}`}
            style={{
              opacity: visibleCount >= messages.length ? 1 : 0,
              backgroundColor: outcome === "accepted" ? "rgba(52,211,153,0.04)" : "rgba(248,113,113,0.04)",
              borderColor: outcome === "accepted" ? "rgba(52,211,153,0.2)" : "rgba(248,113,113,0.2)",
            }}
          >
            <div className="flex justify-center">
              {outcome === "accepted" ? <HandshakeIcon /> : <BreakIcon />}
            </div>
            <div>
              <div className="text-sm font-bold" style={{ color: outcome === "accepted" ? "#34d399" : "#f87171" }}>
                {outcome === "accepted" ? "DEAL REACHED" : "NO AGREEMENT"}
              </div>
              <div className="text-[10px] text-white/25 mt-0.5">
                {outcome === "accepted" ? "Both agents agreed to the terms" : "Agents could not reach an agreement"}
              </div>
            </div>

            {finalTerms && (
              <div className="rounded-lg p-3 mt-2 mx-auto max-w-md" style={{ backgroundColor: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
                <div className="text-[9px] uppercase tracking-widest text-white/25 mb-2">Agreed Terms</div>
                <div className="grid grid-cols-4 gap-2">
                  <div className="text-center">
                    <div className="text-sm font-bold text-white/80">${finalTerms.amount.toFixed(0)}</div>
                    <div className="text-[9px] text-white/25">Amount</div>
                  </div>
                  <div className="text-center">
                    <div className="text-sm font-bold text-white/80">{finalTerms.interestRate}%</div>
                    <div className="text-[9px] text-white/25">Rate</div>
                  </div>
                  <div className="text-center">
                    <div className="text-sm font-bold text-white/80">{formatDuration(finalTerms.durationMs)}</div>
                    <div className="text-[9px] text-white/25">Duration</div>
                  </div>
                  <div className="text-center">
                    <div className="text-sm font-bold text-white/80">{finalTerms.collateralPercent}%</div>
                    <div className="text-[9px] text-white/25">Collateral</div>
                  </div>
                </div>
                {finalTerms.monthlyPayment > 0 && (
                  <div className="text-[10px] text-white/30 mt-2 pt-2 border-t border-white/5 text-center">
                    Monthly Payment: ${finalTerms.monthlyPayment.toFixed(2)}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
