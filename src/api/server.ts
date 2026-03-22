import express from "express";
import cors from "cors";
import { CONFIG } from "../config/index.js";
import { AgentManager } from "../agents/AgentManager.js";
import { AutonomousLoop } from "../agents/AutonomousLoop.js";
import { LoanManager } from "../loans/LoanManager.js";
import type { LendNetEvent } from "../config/types.js";

export function createServer(
  agentManager: AgentManager,
  loanManager: LoanManager,
) {
  const app = express();
  app.use(cors());
  app.use(express.json());

  // SSE for real-time events
  const sseClients: express.Response[] = [];

  app.get("/api/events", (req, res) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();
    sseClients.push(res);
    req.on("close", () => {
      const idx = sseClients.indexOf(res);
      if (idx !== -1) sseClients.splice(idx, 1);
    });
  });

  function broadcastEvent(event: LendNetEvent) {
    const data = JSON.stringify(event);
    for (const client of sseClients) {
      client.write(`data: ${data}\n\n`);
    }
  }

  // Wire up events
  agentManager.onEvent(broadcastEvent);
  loanManager.onEvent(broadcastEvent);
  agentManager.getConsensusEngine().onEvent(broadcastEvent);

  // ─── Agent Routes ──────────────────────────────────────
  app.get("/api/agents", async (_req, res) => {
    try {
      const agents = agentManager.getAllAgents();
      // Sequential to avoid RPC batch limits on free-tier providers
      const statuses = [];
      for (const a of agents) {
        statuses.push(await agentManager.getAgentStatus(a.id));
      }
      res.json(statuses);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/agents/:id", async (req, res) => {
    try {
      const status = await agentManager.getAgentStatus(req.params.id);
      res.json(status);
    } catch (err: any) {
      res.status(404).json({ error: err.message });
    }
  });

  app.post("/api/agents", async (req, res) => {
    try {
      const { name, role, seed } = req.body;
      const agent = await agentManager.createAgent(name, role, seed);
      res.json(agent);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/agents/:id/credit", async (req, res) => {
    try {
      const report = await agentManager.getCreditReport(req.params.id);
      res.json(report);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ─── Loan Routes ───────────────────────────────────────
  app.get("/api/loans", (_req, res) => {
    res.json(loanManager.getAllLoans());
  });

  app.get("/api/loans/stats", (_req, res) => {
    res.json(loanManager.getStats());
  });

  app.get("/api/loans/:id", (req, res) => {
    try {
      res.json(loanManager.getLoan(req.params.id));
    } catch (err: any) {
      res.status(404).json({ error: err.message });
    }
  });

  app.post("/api/loans/request", async (req, res) => {
    try {
      const { borrowerId, amount, purpose, offeredRate, offeredCollateral } =
        req.body;
      const result = await agentManager.requestLoan({
        borrowerId,
        amount,
        purpose,
        offeredRate: offeredRate || 10,
        offeredCollateral: offeredCollateral || 50,
      });
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/loans/:id/repay", async (req, res) => {
    try {
      const { amount } = req.body;
      const result = await agentManager.repayLoan(req.params.id, amount);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ─── Governance Routes ────────────────────────────────
  app.get("/api/governance/policy", (_req, res) => {
    res.json(agentManager.getNetworkPolicy());
  });

  app.get("/api/governance/sessions", (_req, res) => {
    res.json(agentManager.getConsensusEngine().getAllSessions());
  });

  app.get("/api/governance/sessions/:id", (req, res) => {
    const session = agentManager.getConsensusEngine().getSession(req.params.id);
    if (!session) return res.status(404).json({ error: "Session not found" });
    res.json(session);
  });

  app.post("/api/governance/rate-committee", async (_req, res) => {
    try {
      const session = await agentManager.conveneRateCommittee();
      res.json(session);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post("/api/governance/dispute/:loanId", async (req, res) => {
    try {
      const session = await agentManager.conveneDisputeResolution(req.params.loanId);
      res.json(session);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // ─── Aave V3 DeFi Routes ─────────────────────────────
  app.get("/api/agents/:id/aave", async (req, res) => {
    try {
      const wallet = agentManager.getWallet(req.params.id);
      const [position, aaveBalance] = await Promise.all([
        wallet.getAavePosition(),
        wallet.getAaveUsdtBalance(),
      ]);
      res.json({ position, aaveUsdtBalance: aaveBalance });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/agents/:id/aave/supply", async (req, res) => {
    try {
      const { amount } = req.body;
      if (!amount || typeof amount !== 'number' || amount <= 0) {
        return res.status(400).json({ error: "amount must be a positive number" });
      }
      const wallet = agentManager.getWallet(req.params.id);
      const result = await wallet.supplyToAave(amount);
      res.json({ hash: result.hash, fee: result.fee.toString(), amount });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/agents/:id/aave/withdraw", async (req, res) => {
    try {
      const { amount } = req.body;
      if (!amount || typeof amount !== 'number' || amount <= 0) {
        return res.status(400).json({ error: "amount must be a positive number" });
      }
      const wallet = agentManager.getWallet(req.params.id);
      const result = await wallet.withdrawFromAave(amount);
      res.json({ hash: result.hash, fee: result.fee.toString(), amount });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/agents/:id/aave/borrow", async (req, res) => {
    try {
      const { amount } = req.body;
      if (!amount || typeof amount !== 'number' || amount <= 0) {
        return res.status(400).json({ error: "amount must be a positive number" });
      }
      const wallet = agentManager.getWallet(req.params.id);
      const result = await wallet.borrowFromAave(amount);
      res.json({ hash: result.hash, fee: result.fee.toString(), amount });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/agents/:id/aave/repay", async (req, res) => {
    try {
      const { amount } = req.body;
      if (!amount || typeof amount !== 'number' || amount <= 0) {
        return res.status(400).json({ error: "amount must be a positive number" });
      }
      const wallet = agentManager.getWallet(req.params.id);
      const result = await wallet.repayToAave(amount);
      res.json({ hash: result.hash, fee: result.fee.toString(), amount });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ─── Autonomous Loop Routes ──────────────────────────
  const autonomousLoop = new AutonomousLoop(agentManager, loanManager);
  autonomousLoop.onEvent(broadcastEvent);

  app.post("/api/autonomous/start", (_req, res) => {
    if (autonomousLoop.isRunning) {
      return res.json({ status: "already_running", ticks: autonomousLoop.ticks });
    }
    autonomousLoop.start();
    broadcastEvent({ type: 'autonomous_started' });
    res.json({ status: "started" });
  });

  app.post("/api/autonomous/stop", (_req, res) => {
    if (!autonomousLoop.isRunning) {
      return res.json({ status: "not_running" });
    }
    autonomousLoop.stop();
    broadcastEvent({ type: 'autonomous_stopped' });
    res.json({ status: "stopped", ticks: autonomousLoop.ticks });
  });

  app.get("/api/autonomous/status", (_req, res) => {
    res.json({
      running: autonomousLoop.isRunning,
      ticks: autonomousLoop.ticks,
    });
  });

  // Health check
  app.get("/", (_req, res) => {
    res.json({
      status: "ok",
      service: "LendNet API",
      dashboard: "http://localhost:3001",
    });
  });

  // Global error handler — always return JSON, never plain text
  app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('[API] Unhandled error:', err.message || err);
    res.status(500).json({ error: err.message || 'Internal server error' });
  });

  return app;
}

export function startServer(
  agentManager: AgentManager,
  loanManager: LoanManager,
) {
  const app = createServer(agentManager, loanManager);
  app.listen(CONFIG.port, () => {
    console.log(
      `\n[Server] LendNet dashboard: http://localhost:${CONFIG.port}`,
    );
  });
  return app;
}
