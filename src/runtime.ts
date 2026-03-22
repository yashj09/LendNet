import { AgentManager } from "./agents/AgentManager.js";
import { LendNetToken } from "./contracts/LendNetToken.js";
import { CONFIG, setTokenAddress } from "./config/index.js";
import { formatAddress, logBootBanner, logList, logSection } from "./logging.js";
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
  logBootBanner();
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
    logList("Runtime", [
      ["Network", "Sepolia"],
      ["RPC", CONFIG.rpcUrl],
      ["Deployer", formatAddress(token.deployerAddress)],
      ["ETH Balance", `${ethBalance.toFixed(4)} ETH`],
    ]);
  }

  if (ethBalance < 0.01) {
    throw new Error(
      "Deployer has insufficient ETH. Fund the wallet with at least 0.01 Sepolia ETH.",
    );
  }

  await token.initialize(CONFIG.tokenAddress || undefined);
  setTokenAddress(token.address);

  if (logSummary) {
    logList("Token", [
      ["LNUSD", token.address],    ]);
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
  logSection("LendNet Ready", [
    "All transactions are real on-chain (Sepolia).",
    `API Base      : http://localhost:${CONFIG.port}`,
    `Create Agent  : POST /api/agents`,
    `Request Loan  : POST /api/loans/request`,
    `Repay Loan    : POST /api/loans/:id/repay`,
    `Auto Start    : POST /api/autonomous/start`,
    `Auto Stop     : POST /api/autonomous/stop`,
    `List Agents   : GET  /api/agents`,
    `List Loans    : GET  /api/loans`,
    `Loan Stats    : GET  /api/loans/stats`,
  ]);
}
