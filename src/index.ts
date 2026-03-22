import { LoanManager } from "./loans/LoanManager.js";
import { AgentManager } from "./agents/AgentManager.js";
import { startServer } from "./api/server.js";

async function main() {
  console.log("╔══════════════════════════════════════════════════╗");
  console.log("║         LendNet — P2P Agent Lending Network     ║");
  console.log("║    Autonomous AI agents lending USDT via WDK    ║");
  console.log("╚══════════════════════════════════════════════════╝\n");

  const loanManager = new LoanManager();
  const agentManager = new AgentManager(loanManager);

  // Start API server + dashboard
  startServer(agentManager, loanManager);

  // Log all events
  loanManager.onEvent((e) => {
    console.log(`[Event] ${e.type}`, JSON.stringify(e).slice(0, 200));
  });

  console.log(
    "\n[Ready] LendNet is running. Use the dashboard or API to create agents and loans.",
  );
  console.log("[API] POST /api/agents — Create an agent");
  console.log("[API] POST /api/loans/request — Request a loan");
  console.log("[API] POST /api/loans/:id/repay — Repay a loan");
  console.log("[API] POST /api/autonomous/start — Start autonomous agent loop");
  console.log("[API] POST /api/autonomous/stop — Stop autonomous agent loop");
  console.log("[API] GET  /api/agents — List all agents");
  console.log("[API] GET  /api/loans — List all loans");
  console.log("[API] GET  /api/loans/stats — Network statistics");
  console.log("[API] GET  /api/agents/:id/aave — Aave V3 position data\n");
}

main().catch(console.error);
