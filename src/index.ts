import {
  logBootBanner,
  withMutedStartupNoise,
} from "./logging.js";

async function main() {
  logBootBanner();

  const [{ startServer }, runtime] = await withMutedStartupNoise(async () =>
    Promise.all([
      import("./api/server.js"),
      import("./runtime.js"),
    ]),
  );

  const { attachEventLogging, initializeRuntime, logReadyMessage } = runtime;
  const { agentManager, loanManager } = await initializeRuntime({
    logBanner: false,
  });

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
