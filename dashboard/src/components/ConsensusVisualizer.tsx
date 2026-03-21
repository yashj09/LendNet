"use client";

import { useState, useMemo } from "react";
import type { ConsensusSession } from "@/lib/types";

const roleColors: Record<string, { bg: string; text: string; border: string }> = {
  lender: { bg: "rgba(52,211,153,0.15)", text: "#34d399", border: "rgba(52,211,153,0.4)" },
  borrower: { bg: "rgba(167,139,250,0.15)", text: "#a78bfa", border: "rgba(167,139,250,0.4)" },
  both: { bg: "rgba(96,165,250,0.15)", text: "#60a5fa", border: "rgba(96,165,250,0.4)" },
};

const voteConfig: Record<string, { color: string; glow: string; label: string; icon: string }> = {
  APPROVE: { color: "#34d399", glow: "rgba(52,211,153,0.3)", label: "APPROVE", icon: "M5 13l4 4L19 7" },
  DENY: { color: "#f87171", glow: "rgba(248,113,113,0.3)", label: "DENY", icon: "M6 18L18 6M6 6l12 12" },
  ABSTAIN: { color: "#6b7280", glow: "rgba(107,114,128,0.2)", label: "ABSTAIN", icon: "M5 12h14" },
};

const typeLabels: Record<string, string> = {
  rate_committee: "Rate Committee",
  loan_approval: "Loan Approval",
  dispute_resolution: "Dispute Resolution",
};

interface AgentNode {
  agentId: string;
  agentName: string;
  agentRole: "lender" | "borrower" | "both";
  deliberation?: string;
  finalPosition?: string;
  vote?: "APPROVE" | "DENY" | "ABSTAIN";
  reasoning?: string;
  x: number;
  y: number;
}

export default function ConsensusVisualizer({
  session,
}: {
  session: ConsensusSession;
}) {
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);

  // Build agent nodes from session messages
  const agentNodes = useMemo(() => {
    const agentMap = new Map<string, Omit<AgentNode, "x" | "y">>();

    for (const msg of session.messages) {
      const existing = agentMap.get(msg.agentId) || {
        agentId: msg.agentId,
        agentName: msg.agentName,
        agentRole: msg.agentRole,
      };

      if (msg.phase === "DELIBERATION") {
        existing.deliberation = msg.position;
      }
      if (msg.phase === "VOTE" || msg.phase === "DISCUSSION") {
        existing.finalPosition = msg.position;
        existing.vote = msg.vote as "APPROVE" | "DENY" | "ABSTAIN";
        existing.reasoning = msg.reasoning;
      }

      agentMap.set(msg.agentId, existing);
    }

    // Position agents in a circle
    const agents = Array.from(agentMap.values());
    const cx = 300, cy = 240;
    const radius = 170;

    return agents.map((agent, i): AgentNode => {
      const angle = (i / agents.length) * 2 * Math.PI - Math.PI / 2;
      return {
        ...agent,
        x: cx + radius * Math.cos(angle),
        y: cy + radius * Math.sin(angle),
      };
    });
  }, [session.messages]);

  const cx = 300, cy = 240;
  const passed = session.outcome?.passed;
  const approveCount = session.outcome
    ? Object.values(session.outcome.votes).filter((v) => v === "APPROVE").length
    : 0;
  const totalVotes = session.outcome
    ? Object.keys(session.outcome.votes).length
    : 0;

  const selectedNode = agentNodes.find((n) => n.agentId === selectedAgent);

  return (
    <div className="space-y-4">
      {/* Topic */}
      <div className="text-center">
        <span className="text-[10px] uppercase tracking-widest text-white/30">
          {typeLabels[session.type] || session.type}
        </span>
        <p className="text-sm text-white/60 mt-1">{session.topic}</p>
      </div>

      {/* Visual Network */}
      <div className="relative w-full flex justify-center">
        <svg
          viewBox="0 0 600 480"
          className="w-full max-w-[600px]"
          style={{ filter: "drop-shadow(0 0 40px rgba(0,0,0,0.3))" }}
        >
          <defs>
            {/* Animated dash pattern */}
            <style>{`
              @keyframes dashFlow {
                to { stroke-dashoffset: -20; }
              }
              .consensus-line {
                animation: dashFlow 1.5s linear infinite;
              }
              @keyframes pulseGlow {
                0%, 100% { opacity: 0.6; }
                50% { opacity: 1; }
              }
              .center-pulse {
                animation: pulseGlow 2s ease-in-out infinite;
              }
              @keyframes nodeAppear {
                from { opacity: 0; transform: scale(0.5); }
                to { opacity: 1; transform: scale(1); }
              }
            `}</style>

            {/* Glow filters */}
            <filter id="glow-green">
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feFlood floodColor="#34d399" floodOpacity="0.4" result="color" />
              <feComposite in="color" in2="blur" operator="in" result="glow" />
              <feMerge>
                <feMergeNode in="glow" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <filter id="glow-red">
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feFlood floodColor="#f87171" floodOpacity="0.4" result="color" />
              <feComposite in="color" in2="blur" operator="in" result="glow" />
              <feMerge>
                <feMergeNode in="glow" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <filter id="glow-center">
              <feGaussianBlur stdDeviation="6" result="blur" />
              <feFlood
                floodColor={passed ? "#34d399" : passed === false ? "#f87171" : "#60a5fa"}
                floodOpacity="0.3"
                result="color"
              />
              <feComposite in="color" in2="blur" operator="in" result="glow" />
              <feMerge>
                <feMergeNode in="glow" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>

            {/* Radial gradient for background */}
            <radialGradient id="bgGrad" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="rgba(59,130,246,0.05)" />
              <stop offset="100%" stopColor="rgba(0,0,0,0)" />
            </radialGradient>
          </defs>

          {/* Background glow */}
          <circle cx={cx} cy={cy} r="220" fill="url(#bgGrad)" />

          {/* Connection lines from agents to center */}
          {agentNodes.map((node) => {
            const vote = node.vote;
            const lineColor = vote
              ? voteConfig[vote]?.color || "#374151"
              : "#374151";
            return (
              <line
                key={`line-${node.agentId}`}
                x1={node.x}
                y1={node.y}
                x2={cx}
                y2={cy}
                stroke={lineColor}
                strokeWidth="1.5"
                strokeDasharray="6 4"
                strokeOpacity={vote ? 0.6 : 0.2}
                className={vote ? "consensus-line" : ""}
              />
            );
          })}

          {/* Interconnection lines between agents */}
          {agentNodes.map((a, i) =>
            agentNodes.slice(i + 1).map((b) => (
              <line
                key={`inter-${a.agentId}-${b.agentId}`}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke="#374151"
                strokeWidth="0.5"
                strokeDasharray="3 6"
                strokeOpacity={0.15}
              />
            ))
          )}

          {/* Center consensus node */}
          <g filter="url(#glow-center)" className="center-pulse">
            {/* Outer ring */}
            <circle
              cx={cx}
              cy={cy}
              r="44"
              fill="none"
              stroke={passed ? "#34d399" : passed === false ? "#f87171" : "#60a5fa"}
              strokeWidth="2"
              strokeOpacity="0.4"
              strokeDasharray="4 3"
            />
            {/* Inner circle */}
            <circle
              cx={cx}
              cy={cy}
              r="36"
              fill={passed ? "rgba(52,211,153,0.1)" : passed === false ? "rgba(248,113,113,0.1)" : "rgba(96,165,250,0.1)"}
              stroke={passed ? "#34d399" : passed === false ? "#f87171" : "#60a5fa"}
              strokeWidth="1.5"
              strokeOpacity="0.6"
            />
            {/* Gear/cog decorations */}
            {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => {
              const rad = (deg * Math.PI) / 180;
              const ix = cx + 40 * Math.cos(rad);
              const iy = cy + 40 * Math.sin(rad);
              return (
                <rect
                  key={`cog-${deg}`}
                  x={ix - 3}
                  y={iy - 3}
                  width="6"
                  height="6"
                  rx="1"
                  fill={passed ? "#34d399" : passed === false ? "#f87171" : "#60a5fa"}
                  fillOpacity="0.4"
                  transform={`rotate(${deg} ${ix} ${iy})`}
                />
              );
            })}
            {/* Center icon */}
            {session.outcome ? (
              passed ? (
                <path
                  d={`M${cx - 12} ${cy} l8 8 16-16`}
                  fill="none"
                  stroke="#34d399"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ) : (
                <g>
                  <line x1={cx - 10} y1={cy - 10} x2={cx + 10} y2={cy + 10} stroke="#f87171" strokeWidth="3" strokeLinecap="round" />
                  <line x1={cx + 10} y1={cy - 10} x2={cx - 10} y2={cy + 10} stroke="#f87171" strokeWidth="3" strokeLinecap="round" />
                </g>
              )
            ) : (
              <circle cx={cx} cy={cy} r="6" fill="#60a5fa" fillOpacity="0.6" />
            )}
          </g>

          {/* Vote count under center */}
          {session.outcome && (
            <text
              x={cx}
              y={cy + 58}
              textAnchor="middle"
              className="text-[11px]"
              fill="rgba(255,255,255,0.4)"
              fontFamily="monospace"
            >
              {approveCount}/{totalVotes} approved
            </text>
          )}

          {/* Agent nodes */}
          {agentNodes.map((node) => {
            const vote = node.vote;
            const vc = vote ? voteConfig[vote] : null;
            const rc = roleColors[node.agentRole];
            const isSelected = selectedAgent === node.agentId;

            return (
              <g
                key={node.agentId}
                onClick={() => setSelectedAgent(isSelected ? null : node.agentId)}
                className="cursor-pointer"
                style={{ transition: "transform 0.2s" }}
              >
                {/* Selection ring */}
                {isSelected && (
                  <circle
                    cx={node.x}
                    cy={node.y}
                    r="46"
                    fill="none"
                    stroke={rc.text}
                    strokeWidth="1.5"
                    strokeDasharray="4 3"
                    strokeOpacity="0.5"
                  />
                )}

                {/* Agent avatar background */}
                <circle
                  cx={node.x}
                  cy={node.y}
                  r="32"
                  fill={rc.bg}
                  stroke={rc.border}
                  strokeWidth={isSelected ? "2" : "1"}
                  filter={vote === "APPROVE" ? "url(#glow-green)" : vote === "DENY" ? "url(#glow-red)" : undefined}
                />

                {/* Agent person icon */}
                <circle
                  cx={node.x}
                  cy={node.y - 6}
                  r="8"
                  fill="none"
                  stroke={rc.text}
                  strokeWidth="1.5"
                  strokeOpacity="0.8"
                />
                <path
                  d={`M${node.x - 14} ${node.y + 18} Q${node.x - 14} ${node.y + 4} ${node.x} ${node.y + 4} Q${node.x + 14} ${node.y + 4} ${node.x + 14} ${node.y + 18}`}
                  fill="none"
                  stroke={rc.text}
                  strokeWidth="1.5"
                  strokeOpacity="0.6"
                />

                {/* Vote badge (bottom-right of avatar) */}
                {vc && (
                  <g>
                    <circle
                      cx={node.x + 22}
                      cy={node.y + 22}
                      r="11"
                      fill={vc.glow}
                      stroke={vc.color}
                      strokeWidth="1.5"
                    />
                    <path
                      d={
                        vote === "APPROVE"
                          ? `M${node.x + 17} ${node.y + 22} l3 3 7-7`
                          : vote === "DENY"
                            ? `M${node.x + 18} ${node.y + 18} l8 8 M${node.x + 26} ${node.y + 18} l-8 8`
                            : `M${node.x + 17} ${node.y + 22} h10`
                      }
                      fill="none"
                      stroke={vc.color}
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </g>
                )}

                {/* Agent name label */}
                <text
                  x={node.x}
                  y={node.y + 48}
                  textAnchor="middle"
                  fill="rgba(255,255,255,0.8)"
                  fontSize="12"
                  fontWeight="600"
                  fontFamily="system-ui, sans-serif"
                >
                  {node.agentName}
                </text>

                {/* Role label */}
                <text
                  x={node.x}
                  y={node.y + 62}
                  textAnchor="middle"
                  fill={rc.text}
                  fontSize="9"
                  fontFamily="monospace"
                  opacity="0.7"
                >
                  {node.agentRole.toUpperCase()}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Selected agent detail panel */}
      {selectedNode && (
        <div
          className="rounded-xl border p-4 space-y-3 transition-all"
          style={{
            borderColor: roleColors[selectedNode.agentRole].border,
            backgroundColor: roleColors[selectedNode.agentRole].bg,
          }}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="font-semibold text-sm" style={{ color: roleColors[selectedNode.agentRole].text }}>
                {selectedNode.agentName}
              </span>
              <span className="text-[10px] font-mono text-white/30 uppercase">
                {selectedNode.agentRole}
              </span>
              {selectedNode.vote && (
                <span
                  className="text-xs font-bold px-2 py-0.5 rounded-full"
                  style={{
                    color: voteConfig[selectedNode.vote].color,
                    backgroundColor: voteConfig[selectedNode.vote].glow,
                  }}
                >
                  {selectedNode.vote}
                </span>
              )}
            </div>
            <button
              onClick={() => setSelectedAgent(null)}
              className="text-white/30 hover:text-white/60 text-xs"
            >
              Close
            </button>
          </div>

          {selectedNode.deliberation && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-amber-400/70 mb-1">
                Deliberation
              </div>
              <p className="text-xs text-white/50 leading-relaxed">
                {selectedNode.deliberation}
              </p>
            </div>
          )}

          {selectedNode.finalPosition && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-emerald-400/70 mb-1">
                Final Position
              </div>
              <p className="text-xs text-white/50 leading-relaxed">
                {selectedNode.finalPosition}
              </p>
            </div>
          )}

          {selectedNode.reasoning && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-cyan-400/70 mb-1">
                Reasoning
              </div>
              <p className="text-xs text-white/50 leading-relaxed">
                {selectedNode.reasoning}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Outcome banner */}
      {session.outcome && (
        <div
          className={`rounded-lg border p-3 text-center ${
            session.outcome.passed
              ? "bg-emerald-500/10 border-emerald-500/20"
              : "bg-red-500/10 border-red-500/20"
          }`}
        >
          <span
            className={`text-sm font-bold ${
              session.outcome.passed ? "text-emerald-400" : "text-red-400"
            }`}
          >
            {session.outcome.decision}
          </span>
          <span className="text-xs text-white/30 ml-2">
            {approveCount} approve / {totalVotes - approveCount} deny
          </span>
        </div>
      )}
    </div>
  );
}
