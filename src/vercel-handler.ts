import type { IncomingMessage, ServerResponse } from "http";
import { createServer } from "./api/server.js";
import { initializeRuntime } from "./runtime.js";

let appPromise: ReturnType<typeof buildApp> | null = null;

function normalizeRequestUrl(req: IncomingMessage): void {
  if (!req.url) return;

  const parsed = new URL(req.url, "http://localhost");
  const route = parsed.searchParams.get("route");

  if (!route) return;

  parsed.searchParams.delete("route");
  const normalizedPath = route.replace(/^\/+/, "");
  const search = parsed.searchParams.toString();
  req.url = `/api/${normalizedPath}${search ? `?${search}` : ""}`;
}

async function buildApp() {
  const { agentManager, loanManager } = await initializeRuntime({
    logBanner: false,
  });

  return createServer(agentManager, loanManager, {
    deploymentTarget: "vercel",
  });
}

async function getApp() {
  if (!appPromise) {
    appPromise = buildApp().catch((error) => {
      appPromise = null;
      throw error;
    });
  }

  return appPromise;
}

export default async function handler(
  req: IncomingMessage,
  res: ServerResponse,
) {
  try {
    normalizeRequestUrl(req);
    const app = await getApp();
    return app(req, res);
  } catch (error: any) {
    console.error("[Vercel] Failed to initialize backend", error);

    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          error: error?.message || "Failed to initialize backend",
          mode: "vercel-demo",
        }),
      );
    }
  }
}
