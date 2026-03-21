#!/usr/bin/env npx tsx
/**
 * LendNet MCP Server
 *
 * Exposes LendNet P2P lending tools via Model Context Protocol (MCP).
 * Compatible with Claude Desktop, OpenClaw (via mcporter), and any MCP client.
 *
 * Usage:
 *   npx tsx mcp-server/index.ts
 *
 * Or add to Claude Desktop config (claude_desktop_config.json):
 *   {
 *     "mcpServers": {
 *       "lendnet": {
 *         "command": "npx",
 *         "args": ["tsx", "mcp-server/index.ts"],
 *         "cwd": "/path/to/lendnet"
 *       }
 *     }
 *   }
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const API_BASE = process.env.LENDNET_API_URL || "http://localhost:3000";

async function apiGet(path: string): Promise<string> {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) return `Error: ${res.status} - ${await res.text()}`;
  return JSON.stringify(await res.json(), null, 2);
}

async function apiPost(
  path: string,
  body: Record<string, unknown>,
): Promise<string> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) return `Error: ${res.status} - ${await res.text()}`;
  return JSON.stringify(await res.json(), null, 2);
}

const server = new Server(
  { name: "lendnet-mcp", version: "1.0.0" },
  { capabilities: { tools: {} } },
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "lendnet_list_agents",
      description:
        "List all AI lending agents with credit scores, wallet balances, and reputation",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
    },
    {
      name: "lendnet_create_agent",
      description:
        "Create a new AI lending agent with a self-custodial Tether WDK wallet on Sepolia",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Agent name" },
          role: {
            type: "string",
            enum: ["lender", "borrower", "both"],
            description: "Agent role",
          },
        },
        required: ["name", "role"],
        additionalProperties: false,
      },
    },
    {
      name: "lendnet_credit_report",
      description:
        "Get detailed credit report: score (300-850), risk factors, recommended collateral",
      inputSchema: {
        type: "object",
        properties: {
          agent_id: { type: "string", description: "Agent ID" },
        },
        required: ["agent_id"],
        additionalProperties: false,
      },
    },
    {
      name: "lendnet_request_loan",
      description:
        "Request a USDT loan. Triggers autonomous AI negotiation between borrower and lender agents, then on-chain settlement via Tether WDK.",
      inputSchema: {
        type: "object",
        properties: {
          borrower_id: { type: "string", description: "Borrower agent ID" },
          amount: { type: "number", description: "Loan amount in USDT" },
          purpose: { type: "string", description: "Loan purpose" },
          offered_rate: {
            type: "number",
            description: "Max interest rate (default: 10%)",
          },
          offered_collateral: {
            type: "number",
            description: "Collateral % offered (default: 50%)",
          },
        },
        required: ["borrower_id", "amount", "purpose"],
        additionalProperties: false,
      },
    },
    {
      name: "lendnet_repay_loan",
      description:
        "Repay an outstanding loan via Tether WDK. Defaults to full repayment.",
      inputSchema: {
        type: "object",
        properties: {
          loan_id: { type: "string", description: "Loan ID" },
          amount: { type: "number", description: "Repayment amount (optional)" },
        },
        required: ["loan_id"],
        additionalProperties: false,
      },
    },
    {
      name: "lendnet_list_loans",
      description: "List all loans with status, terms, and negotiation history",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
    },
    {
      name: "lendnet_loan_stats",
      description: "Get network-wide lending statistics",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
    },
  ],
}));

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  let result: string;

  switch (name) {
    case "lendnet_list_agents":
      result = await apiGet("/api/agents");
      break;

    case "lendnet_create_agent":
      result = await apiPost("/api/agents", {
        name: (args as { name: string }).name,
        role: (args as { role: string }).role,
      });
      break;

    case "lendnet_credit_report":
      result = await apiGet(
        `/api/agents/${(args as { agent_id: string }).agent_id}/credit`,
      );
      break;

    case "lendnet_request_loan": {
      const a = args as {
        borrower_id: string;
        amount: number;
        purpose: string;
        offered_rate?: number;
        offered_collateral?: number;
      };
      result = await apiPost("/api/loans/request", {
        borrowerId: a.borrower_id,
        amount: a.amount,
        purpose: a.purpose,
        offeredRate: a.offered_rate || 10,
        offeredCollateral: a.offered_collateral || 50,
      });
      break;
    }

    case "lendnet_repay_loan": {
      const a = args as { loan_id: string; amount?: number };
      result = await apiPost(`/api/loans/${a.loan_id}/repay`, {
        amount: a.amount,
      });
      break;
    }

    case "lendnet_list_loans":
      result = await apiGet("/api/loans");
      break;

    case "lendnet_loan_stats":
      result = await apiGet("/api/loans/stats");
      break;

    default:
      result = `Unknown tool: ${name}`;
  }

  return { content: [{ type: "text", text: result }] };
});

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[MCP] LendNet MCP server running on stdio");
}

main().catch(console.error);
