import type { AgentStatus } from "@/lib/types";

function scoreColor(score: number) {
  if (score >= 700) return "bg-emerald-500";
  if (score >= 550) return "bg-yellow-500";
  return "bg-red-500";
}

function scoreWidth(score: number) {
  return Math.max(0, Math.min(100, ((score - 300) / 550) * 100));
}

const roleBadge: Record<string, string> = {
  lender: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  borrower: "bg-violet-500/15 text-violet-400 border-violet-500/30",
  both: "bg-cyan-500/15 text-cyan-400 border-cyan-500/30",
};

export default function AgentCard({ agent }: { agent: AgentStatus }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4 hover:border-white/20 transition-colors">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <span className="font-semibold text-sm">{agent.name}</span>
        <span
          className={`text-[11px] font-semibold uppercase px-2 py-0.5 rounded border ${roleBadge[agent.role]}`}
        >
          {agent.role}
        </span>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 gap-y-1.5 text-xs text-white/50 mb-3">
        <div>
          Score:{" "}
          <span className="text-white font-medium">{agent.creditScore}</span>
        </div>
        <div>
          USDT:{" "}
          <span className="text-emerald-400 font-medium">
            {agent.balances?.balanceUsdt?.toFixed(2) ?? "0.00"}
          </span>
        </div>
        <div>
          Loans:{" "}
          <span className="text-white font-medium">
            {agent.reputation.totalLoansIssued +
              agent.reputation.totalLoansBorrowed}
          </span>
        </div>
        <div>
          Repaid:{" "}
          <span className="text-white font-medium">
            {agent.reputation.successfulRepayments}
          </span>
        </div>
      </div>

      {/* Credit Score Bar */}
      <div className="h-1.5 rounded-full bg-white/5 overflow-hidden mb-3">
        <div
          className={`h-full rounded-full transition-all duration-500 ${scoreColor(agent.creditScore)}`}
          style={{ width: `${scoreWidth(agent.creditScore)}%` }}
        />
      </div>

      {/* Wallet Address */}
      <div className="text-[10px] text-white/30 font-mono break-all">
        {agent.walletAddress}
      </div>
    </div>
  );
}
