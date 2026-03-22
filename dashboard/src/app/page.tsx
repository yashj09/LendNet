"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import AgentCard from "@/components/AgentCard";
import LoanCard from "@/components/LoanCard";
import NegotiationVisualizer from "@/components/NegotiationVisualizer";
import EventFeed from "@/components/EventFeed";
import StatsBar from "@/components/StatsBar";
import CreateAgentForm from "@/components/CreateAgentForm";
import RequestLoanForm from "@/components/RequestLoanForm";
import RepayLoanForm from "@/components/RepayLoanForm";
import GovernancePanel from "@/components/GovernancePanel";
import { fetchAgents, fetchLoans, fetchStats, fetchPolicy, fetchGovernanceSessions, startAutonomous, stopAutonomous, fetchAutonomousStatus } from "@/lib/api";
import type {
  AgentStatus,
  Loan,
  LoanStats,
  LendNetEvent,
  NegotiationMessage,
  NetworkPolicy,
  ConsensusSession,
} from "@/lib/types";

export default function Dashboard() {
  const [agents, setAgents] = useState<AgentStatus[]>([]);
  const [loans, setLoans] = useState<Loan[]>([]);
  const [stats, setStats] = useState<LoanStats | null>(null);
  const [events, setEvents] = useState<LendNetEvent[]>([]);
  const [negotiation, setNegotiation] = useState<NegotiationMessage[]>([]);
  const [selectedLoanId, setSelectedLoanId] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [policy, setPolicy] = useState<NetworkPolicy | null>(null);
  const [govSessions, setGovSessions] = useState<ConsensusSession[]>([]);
  const [activeLoanId, setActiveLoanId] = useState<string | null>(null);
  const [autonomous, setAutonomous] = useState<{ running: boolean; ticks: number }>({ running: false, ticks: 0 });

  const refresh = useCallback(async () => {
    try {
      const [a, l, s, p, g, auto] = await Promise.all([
        fetchAgents(),
        fetchLoans(),
        fetchStats(),
        fetchPolicy().catch(() => null),
        fetchGovernanceSessions().catch(() => []),
        fetchAutonomousStatus().catch(() => ({ running: false, ticks: 0 })),
      ]);
      setAgents(a);
      setLoans(l);
      setStats(s);
      if (p) setPolicy(p);
      setGovSessions(g);
      setAutonomous(auto);
      setConnected(true);

      // Show selected loan's negotiation, or latest
      const target = selectedLoanId
        ? l.find((loan) => loan.id === selectedLoanId)
        : [...l].reverse().find((loan) => loan.negotiationLog?.length > 0);
      if (target?.negotiationLog) {
        setNegotiation(target.negotiationLog);
        setActiveLoanId(target.id);
      }
    } catch {
      setConnected(false);
    }
  }, [selectedLoanId]);

  // SSE for real-time events
  useEffect(() => {
    const source = new EventSource("http://localhost:3000/api/events");
    source.onmessage = (e) => {
      try {
        const event: LendNetEvent = JSON.parse(e.data);
        setEvents((prev) => [event, ...prev].slice(0, 100));
        refresh();
      } catch {
        // ignore
      }
    };
    source.onerror = () => setConnected(false);
    source.onopen = () => setConnected(true);
    return () => source.close();
  }, [refresh]);

  // Find committee session linked to the active loan
  const committeeSession = useMemo(() => {
    if (!activeLoanId || !govSessions.length) return null;
    return govSessions.find(
      (s) => s.type === "loan_approval" && s.context?.loanId === activeLoanId
    ) || null;
  }, [activeLoanId, govSessions]);

  // Initial load + periodic refresh
  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 5000);
    return () => clearInterval(interval);
  }, [refresh]);

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="border-b border-white/10 bg-white/[0.02] px-6 py-4">
        <div className="max-w-[1440px] mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div>
              <h1 className="text-xl font-bold text-emerald-400 tracking-tight">
                LendNet
              </h1>
              <p className="text-[11px] text-white/30 mt-0.5">
                Autonomous P2P Agent Lending Network &middot; Powered by Tether
                WDK + Claude AI
              </p>
            </div>
            <div
              className={`h-2 w-2 rounded-full ${connected ? "bg-emerald-400 animate-pulse" : "bg-red-400"}`}
              title={connected ? "Connected" : "Disconnected"}
            />
          </div>
          <div className="flex items-center gap-3">
            <StatsBar data={stats} agentCount={agents.length} />
            <button
              onClick={async () => {
                try {
                  if (autonomous.running) {
                    await stopAutonomous();
                    setAutonomous((prev) => ({ ...prev, running: false }));
                  } else {
                    await startAutonomous();
                    setAutonomous((prev) => ({ ...prev, running: true }));
                  }
                } catch {
                  // ignore
                }
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                autonomous.running
                  ? "bg-cyan-500/20 text-cyan-400 border-cyan-500/30 hover:bg-cyan-500/30"
                  : "bg-white/5 text-white/40 border-white/10 hover:text-white/60 hover:border-white/20"
              }`}
              title={autonomous.running ? `Autonomous mode active (${autonomous.ticks} ticks)` : "Start autonomous agent mode"}
            >
              {autonomous.running ? (
                <span className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-pulse" />
                  AUTO
                  <span className="text-[10px] text-cyan-400/60">#{autonomous.ticks}</span>
                </span>
              ) : (
                "AUTO"
              )}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-[1440px] mx-auto p-6 space-y-5">
        {/* Connection Warning */}
        {!connected && (
          <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/5 p-4 text-sm text-yellow-400 text-center">
            Cannot connect to LendNet API. Make sure the backend is running:{" "}
            <code className="bg-white/5 px-2 py-0.5 rounded">npm run dev</code>
          </div>
        )}

        {/* Top Row: Create Agent + Request Loan */}
        <div className="grid grid-cols-2 gap-5">
          <section className="rounded-xl border border-white/10 bg-white/[0.02] p-5">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-emerald-400 mb-4">
              Create Agent
            </h2>
            <CreateAgentForm onCreated={refresh} />
          </section>

          <section className="rounded-xl border border-white/10 bg-white/[0.02] p-5">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-violet-400 mb-4">
              Request Loan
            </h2>
            <RequestLoanForm agents={agents} onCompleted={refresh} />
          </section>
        </div>

        {/* Agents + Loans */}
        <div className="grid grid-cols-2 gap-5">
          <section className="rounded-xl border border-white/10 bg-white/[0.02] p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xs font-semibold uppercase tracking-widest text-emerald-400">
                AI Agents ({agents.length})
              </h2>
            </div>
            {agents.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-white/20 text-sm mb-2">No agents yet</p>
                <p className="text-white/10 text-xs">
                  Create a lender and a borrower above to get started
                </p>
              </div>
            ) : (
              <div className="space-y-3 max-h-[500px] overflow-y-auto">
                {agents.map((agent) => (
                  <AgentCard key={agent.id} agent={agent} />
                ))}
              </div>
            )}
          </section>

          <section className="rounded-xl border border-white/10 bg-white/[0.02] p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xs font-semibold uppercase tracking-widest text-violet-400">
                Loans ({loans.length})
              </h2>
            </div>
            {loans.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-white/20 text-sm mb-2">No loans yet</p>
                <p className="text-white/10 text-xs">
                  Request a loan above to start AI-powered negotiation
                </p>
              </div>
            ) : (
              <div className="space-y-3 max-h-[500px] overflow-y-auto">
                {loans.map((loan) => (
                  <div
                    key={loan.id}
                    onClick={() => setSelectedLoanId(loan.id)}
                    className={`cursor-pointer transition-all ${
                      selectedLoanId === loan.id
                        ? "ring-1 ring-violet-500/50 rounded-lg"
                        : ""
                    }`}
                  >
                    <LoanCard loan={loan} />
                  </div>
                ))}
              </div>
            )}

            {/* Repay Section */}
            {loans.some(
              (l) => l.status === "funded" || l.status === "repaying",
            ) && (
              <div className="mt-4 pt-4 border-t border-white/5">
                <h3 className="text-xs font-semibold uppercase tracking-widest text-cyan-400 mb-3">
                  Repay Loan
                </h3>
                <RepayLoanForm loans={loans} onCompleted={refresh} />
              </div>
            )}
          </section>
        </div>

        {/* AI Negotiation */}
        <section className="rounded-xl border border-violet-500/20 bg-violet-500/[0.02] p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-violet-400">
              AI Negotiation
              {selectedLoanId && (
                <span className="ml-2 text-cyan-400">
                  ({selectedLoanId})
                </span>
              )}
            </h2>
            {selectedLoanId && (
              <button
                onClick={() => setSelectedLoanId(null)}
                className="text-xs text-white/30 hover:text-white/60 transition-colors"
              >
                Show latest
              </button>
            )}
          </div>
          <NegotiationVisualizer messages={negotiation} committeeSession={committeeSession} />
        </section>

        {/* AI Governance */}
        <section className="rounded-xl border border-amber-500/20 bg-amber-500/[0.02] p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-amber-400">
              AI Consensus Governance
            </h2>
            {govSessions.length > 0 && (
              <span className="text-[10px] text-white/20">
                {govSessions.length} session{govSessions.length !== 1 ? "s" : ""}
              </span>
            )}
          </div>
          <GovernancePanel
            policy={policy}
            sessions={govSessions}
            agentCount={agents.length}
            onCompleted={refresh}
          />
        </section>

        {/* Event Feed */}
        <section className="rounded-xl border border-white/10 bg-white/[0.02] p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-emerald-400">
              Live Event Feed ({events.length})
            </h2>
            {events.length > 0 && (
              <button
                onClick={() => setEvents([])}
                className="text-xs text-white/30 hover:text-white/60 transition-colors"
              >
                Clear
              </button>
            )}
          </div>
          <EventFeed events={events} />
        </section>

        {/* Footer */}
        <footer className="text-center text-[11px] text-white/15 py-4">
          LendNet &mdash; Built for Tether Hackathon Galactica: WDK Edition 1
          &middot; Apache 2.0 &middot; Sepolia Testnet
        </footer>
      </main>
    </div>
  );
}
