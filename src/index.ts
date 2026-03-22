import { LoanManager } from "./loans/LoanManager.js";
import { AgentManager } from "./agents/AgentManager.js";
import { LendNetToken } from "./contracts/LendNetToken.js";
import { startServer } from "./api/server.js";
import { CONFIG, setTokenAddress } from "./config/index.js";

async function main() {
  console.log("╔══════════════════════════════════════════════════╗");
  console.log("║         LendNet — P2P Agent Lending Network     ║");
  console.log("║    Autonomous AI agents lending USDT via WDK    ║");
  console.log("╚══════════════════════════════════════════════════╝\n");

  // Validate deployer key
  if (!CONFIG.deployerPrivateKey) {
    console.error("[FATAL] DEPLOYER_PRIVATE_KEY not set in .env");
    console.error("  → Generate one: node -e \"console.log(require('ethers').Wallet.createRandom().privateKey)\"");
    console.error("  → Fund it with Sepolia ETH from a faucet");
    process.exit(1);
  }

  // Deploy or connect to LendNet USD token
  const token = new LendNetToken(CONFIG.deployerPrivateKey);
  const ethBalance = await token.getDeployerEthBalance();
  console.log(`[Deployer] ${token.deployerAddress} — ${ethBalance.toFixed(4)} ETH`);

  if (ethBalance < 0.01) {
    console.error("[FATAL] Deployer has insufficient ETH. Need at least 0.01 Sepolia ETH.");
    console.error("  → Faucet: https://www.alchemy.com/faucets/ethereum-sepolia");
    process.exit(1);
  }

  await token.initialize(CONFIG.tokenAddress || undefined);
  setTokenAddress(token.address); // Update CONFIG so WDK wallets use this token
  console.log(`[Token] LNUSD address: ${token.address}`);
  console.log(`  → Set LNUSD_ADDRESS=${token.address} in .env to reuse this token\n`);

  const loanManager = new LoanManager();
  const agentManager = new AgentManager(loanManager, token);

  // Start API server + dashboard
  startServer(agentManager, loanManager);

  // Log all events
  loanManager.onEvent((e) => {
    console.log(`[Event] ${e.type}`, JSON.stringify(e).slice(0, 200));
  });

  console.log(
    "\n[Ready] LendNet is running. All transactions are real on-chain (Sepolia).",
  );
  console.log("[API] POST /api/agents — Create an agent");
  console.log("[API] POST /api/loans/request — Request a loan");
  console.log("[API] POST /api/loans/:id/repay — Repay a loan");
  console.log("[API] POST /api/autonomous/start — Start autonomous agent loop");
  console.log("[API] POST /api/autonomous/stop — Stop autonomous agent loop");
  console.log("[API] GET  /api/agents — List all agents");
  console.log("[API] GET  /api/loans — List all loans");
  console.log("[API] GET  /api/loans/stats — Network statistics\n");
}

main().catch(console.error);
