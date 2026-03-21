"use client";

import { useState } from "react";
import { createAgent } from "@/lib/api";

export default function CreateAgentForm({
  onCreated,
}: {
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [role, setRole] = useState<"lender" | "borrower" | "both">("lender");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    setResult(null);
    try {
      const agent = await createAgent(name.trim(), role);
      setResult(`Created ${agent.name} — ${agent.walletAddress}`);
      setName("");
      onCreated();
    } catch (err: unknown) {
      setResult(`Error: ${err instanceof Error ? err.message : "Unknown"}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="flex gap-2">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Agent name..."
          className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-emerald-500/50 transition-colors"
        />
        <select
          value={role}
          onChange={(e) =>
            setRole(e.target.value as "lender" | "borrower" | "both")
          }
          className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500/50 transition-colors"
        >
          <option value="lender">Lender</option>
          <option value="borrower">Borrower</option>
          <option value="both">Both</option>
        </select>
        <button
          type="submit"
          disabled={loading || !name.trim()}
          className="px-4 py-2 rounded-lg text-sm font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/30 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
        >
          {loading ? "Creating..." : "Create Agent"}
        </button>
      </div>
      {result && (
        <p className="text-xs text-white/40 break-all">{result}</p>
      )}
    </form>
  );
}
