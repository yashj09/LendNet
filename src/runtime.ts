import { AgentManager } from "./agents/AgentManager.js";
import { LendNetToken } from "./contracts/LendNetToken.js";
import { CONFIG, setTokenAddress } from "./config/index.js";
import { LoanManager } from "./loans/LoanManager.js";

export interface LendNetRuntime {
  agentManager: AgentManager;
  loanManager: LoanManager;
  token: LendNetToken;
}

interface InitializeRuntimeOptions {
  logBanner?: boolean;
  logSummary?: boolean;
}

function logBanner(): void {
  console.log("==================================================");
  console.log("LendNet - P2P Agent Lending Network");
  console.log("Autonomous AI agents lending USDT via WDK");
  console.log("==================================================\n");
}

function requireDeployerKey(): string {
  if (!CONFIG.deployerPrivateKey) {
    throw new Error(
      "DEPLOYER_PRIVATE_KEY not set. Generate one and fund it with Sepolia ETH.",
    );
  }

  return CONFIG.deployerPrivateKey;
}

export async function initializeRuntime(
  options: InitializeRuntimeOptions = {},
): Promise<LendNetRuntime> {
  const { logBanner: shouldLogBanner = true, logSummary = true } = options;

  if (shouldLogBanner) {
    logBanner();
  }

  const deployerPrivateKey = requireDeployerKey();
  const token = new LendNetToken(deployerPrivateKey);
  const ethBalance = await token.getDeployerEthBalance();

  if (logSummary) {
    console.log(
      `[Deployer] ${token.deployerAddress} - ${ethBalance.toFixed(4)} ETH`,
    );
  }

  if (ethBalance < 0.01) {
    throw new Error(
      "Deployer has insufficient ETH. Fund the wallet with at least 0.01 Sepolia ETH.",
    );
  }

  await token.initialize(CONFIG.tokenAddress || undefined);
  setTokenAddress(token.address);

  if (logSummary) {
    console.log(`[Token] LNUSD address: ${token.address}`);
    console.log(
      `  Set LNUSD_ADDRESS=${token.address} in .env to reuse this token\n`,
    );
  }

  const loanManager = new LoanManager();
  const agentManager = new AgentManager(loanManager, token);

  return {
    agentManager,
    loanManager,
    token,
  };
}

export function attachEventLogging(loanManager: LoanManager): void {
  loanManager.onEvent((event) => {
    console.log(`[Event] ${event.type}`, JSON.stringify(event).slice(0, 200));
  });
}

export function logReadyMessage(): void {
  console.log(
    "\n[Ready] LendNet is running. All transactions are real on-chain (Sepolia).",
  );
  console.log("[API] POST /api/agents - Create an agent");
  console.log("[API] POST /api/loans/request - Request a loan");
  console.log("[API] POST /api/loans/:id/repay - Repay a loan");
  console.log("[API] POST /api/autonomous/start - Start autonomous agent loop");
  console.log("[API] POST /api/autonomous/stop - Stop autonomous agent loop");
  console.log("[API] GET  /api/agents - List all agents");
  console.log("[API] GET  /api/loans - List all loans");
  console.log("[API] GET  /api/loans/stats - Network statistics\n");
}
