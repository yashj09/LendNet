import type { LoanStats } from "@/lib/types";

const stats: { key: string; label: string; prefix?: string }[] = [
  { key: "total", label: "Loans" },
  { key: "totalVolume", label: "Volume", prefix: "$" },
  { key: "completed", label: "Completed" },
  { key: "totalRepaid", label: "Repaid", prefix: "$" },
];

export default function StatsBar({
  data,
  agentCount,
}: {
  data: LoanStats | null;
  agentCount: number;
}) {
  return (
    <div className="flex items-center gap-6 text-xs">
      <div className="text-white/40">
        Agents:{" "}
        <span className="text-emerald-400 font-semibold">{agentCount}</span>
      </div>
      {stats.map((s) => (
        <div key={s.key} className="text-white/40">
          {s.label}:{" "}
          <span className="text-emerald-400 font-semibold">
            {s.prefix ?? ""}
            {data ? (data as unknown as Record<string, number>)[s.key] : 0}
          </span>
        </div>
      ))}
    </div>
  );
}
