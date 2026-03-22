import { startServer } from "./api/server.js";
import {
  attachEventLogging,
  initializeRuntime,
  logReadyMessage,
} from "./runtime.js";

async function main() {
  const { agentManager, loanManager } = await initializeRuntime();

  // Start API server + dashboard
  startServer(agentManager, loanManager);

  // Log all events
  attachEventLogging(loanManager);
  logReadyMessage();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
