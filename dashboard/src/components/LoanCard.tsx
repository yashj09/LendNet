import type { Loan } from "@/lib/types";

const statusStyle: Record<string, string> = {
  pending: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  negotiating: "bg-violet-500/15 text-violet-400 border-violet-500/30",
  approved: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  funded: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  repaying: "bg-cyan-500/15 text-cyan-400 border-cyan-500/30",
  completed: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
  defaulted: "bg-red-500/15 text-red-400 border-red-500/30",
  rejected: "bg-red-500/15 text-red-400 border-red-500/30",
};

export default function LoanCard({ loan }: { loan: Loan }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4 hover:border-white/20 transition-colors">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <span className="font-semibold text-sm text-cyan-400">{loan.id}</span>
        <span
          className={`text-[11px] font-semibold uppercase px-2 py-0.5 rounded border ${statusStyle[loan.status] ?? "bg-white/10 text-white/60"}`}
        >
          {loan.status}
        </span>
      </div>

      {/* Details */}
      <div className="grid grid-cols-3 gap-y-1.5 text-xs text-white/50">
        <div>
          Amount:{" "}
          <span className="text-white font-medium">${loan.terms.amount}</span>
        </div>
        <div>
          Rate:{" "}
          <span className="text-white font-medium">
            {loan.terms.interestRate}%
          </span>
        </div>
        <div>
          Collateral:{" "}
          <span className="text-white font-medium">
            {loan.terms.collateralPercent}%
          </span>
        </div>
        <div>
          Repaid:{" "}
          <span className="text-emerald-400 font-medium">
            ${loan.totalRepaid.toFixed(2)}
          </span>
        </div>
        <div>
          Borrower:{" "}
          <span className="text-white font-medium">
            {loan.borrowerId.slice(0, 12)}
          </span>
        </div>
        <div>
          Lender:{" "}
          <span className="text-white font-medium">
            {loan.lenderId ? loan.lenderId.slice(0, 12) : "pending"}
          </span>
        </div>
      </div>

      {/* TX Hash */}
      {loan.txHashes.funding && (
        <div className="mt-2 text-[10px] text-white/20 font-mono truncate">
          TX: {loan.txHashes.funding}
        </div>
      )}
    </div>
  );
}
