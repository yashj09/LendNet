/**
 * LendNet OpenClaw Plugin
 *
 * Registers agent tools that allow OpenClaw's LLM to interact with
 * the LendNet P2P lending network via Telegram, Discord, WhatsApp, etc.
 *
 * The plugin talks to the LendNet API server (Express on port 3000)
 * which handles all WDK wallet operations and Claude-powered negotiations.
 *
 * Tools registered:
 *   - lendnet_list_agents: View all lending agents and their credit scores
 *   - lendnet_create_agent: Create a new lending agent with a WDK wallet
 *   - lendnet_credit_report: Get a detailed credit report for an agent
 *   - lendnet_request_loan: Request a loan (triggers AI negotiation)
 *   - lendnet_repay_loan: Repay an outstanding loan
 *   - lendnet_list_loans: View all loans and their statuses
 *   - lendnet_loan_stats: Get network-wide lending statistics
 */

// NOTE: This plugin is designed to work with OpenClaw's plugin SDK.
// When OpenClaw is installed, replace the mock definePluginEntry with:
//   import { definePluginEntry } from "openclaw/plugin-sdk/core";

const API_BASE = process.env.LENDNET_API_URL || "http://localhost:3000";

async function apiCall(
  method: string,
  path: string,
  body?: Record<string, unknown>,
): Promise<string> {
  const url = `${API_BASE}${path}`;
  const opts: RequestInit = {
    method,
    headers: { "Content-Type": "application/json" },
  };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(url);
  if (!res.ok) {
    const err = await res.text();
    return `Error: ${res.status} - ${err}`;
  }
  const data = await res.json();
  return JSON.stringify(data, null, 2);
}

async function apiPost(
  path: string,
  body: Record<string, unknown>,
): Promise<string> {
  const url = `${API_BASE}${path}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text();
    return `Error: ${res.status} - ${err}`;
  }
  const data = await res.json();
  return JSON.stringify(data, null, 2);
}

// Tool definitions that OpenClaw's LLM can invoke
export const tools = [
  {
    name: "lendnet_list_agents",
    description:
      "List all AI lending agents in the LendNet network with their credit scores, wallet balances, and reputation",
    parameters: { type: "object", properties: {}, additionalProperties: false },
    execute: async () => {
      const result = await apiCall("GET", "/api/agents");
      return { content: [{ type: "text" as const, text: result }] };
    },
  },
  {
    name: "lendnet_create_agent",
    description:
      "Create a new AI lending agent with a self-custodial Tether WDK wallet. The agent gets a unique wallet address on Sepolia testnet.",
    parameters: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Name for the agent (e.g. 'Alpha Lender')",
        },
        role: {
          type: "string",
          enum: ["lender", "borrower", "both"],
          description: "Agent role: lender, borrower, or both",
        },
      },
      required: ["name", "role"],
      additionalProperties: false,
    },
    execute: async (
      _id: string,
      params: { name: string; role: string },
    ) => {
      const result = await apiPost("/api/agents", {
        name: params.name,
        role: params.role,
      });
      return { content: [{ type: "text" as const, text: result }] };
    },
  },
  {
    name: "lendnet_credit_report",
    description:
      "Get a detailed credit report for an agent including credit score (300-850), risk level, credit factors, wallet metrics, and recommended collateral percentage",
    parameters: {
      type: "object",
      properties: {
        agent_id: {
          type: "string",
          description: "The agent ID (e.g. 'AGENT-A1B2C3')",
        },
      },
      required: ["agent_id"],
      additionalProperties: false,
    },
    execute: async (_id: string, params: { agent_id: string }) => {
      const result = await apiCall(
        "GET",
        `/api/agents/${params.agent_id}/credit`,
      );
      return { content: [{ type: "text" as const, text: result }] };
    },
  },
  {
    name: "lendnet_request_loan",
    description:
      "Request a USDT loan as a borrower agent. This triggers an autonomous AI negotiation between the borrower and the best available lender. The agents negotiate interest rate, collateral, and duration using Claude AI. If agreed, USDT is transferred on-chain via Tether WDK.",
    parameters: {
      type: "object",
      properties: {
        borrower_id: {
          type: "string",
          description: "The borrower agent ID",
        },
        amount: {
          type: "number",
          description: "Loan amount in USDT",
        },
        purpose: {
          type: "string",
          description: "Purpose of the loan",
        },
        offered_rate: {
          type: "number",
          description:
            "Maximum interest rate the borrower is willing to pay (default: 10%)",
        },
        offered_collateral: {
          type: "number",
          description:
            "Collateral percentage the borrower is willing to put up (default: 50%)",
        },
      },
      required: ["borrower_id", "amount", "purpose"],
      additionalProperties: false,
    },
    execute: async (
      _id: string,
      params: {
        borrower_id: string;
        amount: number;
        purpose: string;
        offered_rate?: number;
        offered_collateral?: number;
      },
    ) => {
      const result = await apiPost("/api/loans/request", {
        borrowerId: params.borrower_id,
        amount: params.amount,
        purpose: params.purpose,
        offeredRate: params.offered_rate || 10,
        offeredCollateral: params.offered_collateral || 50,
      });
      return { content: [{ type: "text" as const, text: result }] };
    },
  },
  {
    name: "lendnet_repay_loan",
    description:
      "Repay an outstanding loan. Transfers USDT from borrower to lender via Tether WDK. If no amount specified, repays the full remaining balance.",
    parameters: {
      type: "object",
      properties: {
        loan_id: {
          type: "string",
          description: "The loan ID (e.g. 'LOAN-A1B2C3D4')",
        },
        amount: {
          type: "number",
          description:
            "Amount to repay in USDT (optional - defaults to full repayment)",
        },
      },
      required: ["loan_id"],
      additionalProperties: false,
    },
    execute: async (
      _id: string,
      params: { loan_id: string; amount?: number },
    ) => {
      const result = await apiPost(`/api/loans/${params.loan_id}/repay`, {
        amount: params.amount,
      });
      return { content: [{ type: "text" as const, text: result }] };
    },
  },
  {
    name: "lendnet_list_loans",
    description:
      "List all loans in the LendNet network with their status, terms, and negotiation history",
    parameters: { type: "object", properties: {}, additionalProperties: false },
    execute: async () => {
      const result = await apiCall("GET", "/api/loans");
      return { content: [{ type: "text" as const, text: result }] };
    },
  },
  {
    name: "lendnet_loan_stats",
    description:
      "Get network-wide lending statistics: total loans, volume, completion rate, defaults, and repayments",
    parameters: { type: "object", properties: {}, additionalProperties: false },
    execute: async () => {
      const result = await apiCall("GET", "/api/loans/stats");
      return { content: [{ type: "text" as const, text: result }] };
    },
  },
];

// OpenClaw plugin entry point
// When using with OpenClaw, uncomment the import and use definePluginEntry:
//
// import { definePluginEntry } from "openclaw/plugin-sdk/core";
// export default definePluginEntry({
//   id: "lendnet",
//   name: "LendNet P2P Lending",
//   register(api) {
//     for (const tool of tools) {
//       api.registerTool(tool);
//     }
//   },
// });

// Standalone export for testing and MCP integration
export default { tools };
