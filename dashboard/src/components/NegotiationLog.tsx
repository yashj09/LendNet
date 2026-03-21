import type { NegotiationMessage } from "@/lib/types";

const actionColor: Record<string, string> = {
  PROPOSE: "text-violet-400",
  COUNTER: "text-yellow-400",
  ACCEPT: "text-emerald-400",
  REJECT: "text-red-400",
};

export default function NegotiationLog({
  messages,
}: {
  messages: NegotiationMessage[];
}) {
  if (!messages.length) {
    return (
      <p className="text-white/30 text-sm text-center py-8">
        Negotiations will appear here when a loan is requested.
      </p>
    );
  }

  return (
    <div className="space-y-2 max-h-[400px] overflow-y-auto">
      {messages.map((m, i) => (
        <div
          key={i}
          className={`rounded-r-lg border-l-[3px] bg-white/[0.03] p-3 ${
            m.from === "lender" ? "border-emerald-500" : "border-violet-500"
          }`}
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-semibold text-white/70">
              Round {m.round} &mdash;{" "}
              <span
                className={
                  m.from === "lender" ? "text-emerald-400" : "text-violet-400"
                }
              >
                {m.from.toUpperCase()}
              </span>
            </span>
            <span
              className={`text-xs font-bold ${actionColor[m.action] ?? "text-white/60"}`}
            >
              {m.action}
            </span>
          </div>

          {/* Terms */}
          <div className="text-xs text-white/40 mb-1">
            ${m.terms.amount} @ {m.terms.interestRate}% | Collateral:{" "}
            {m.terms.collateralPercent}%
          </div>

          {/* Reasoning */}
          <div className="text-xs text-white/60 italic">
            &ldquo;{m.reasoning}&rdquo;
          </div>
        </div>
      ))}
    </div>
  );
}
