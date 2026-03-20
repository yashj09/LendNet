import dotenv from "dotenv";
dotenv.config();

export const CONFIG = {
  // Sepolia testnet
  chainId: 11155111,
  rpcUrl: process.env.SEPOLIA_RPC_URL || "https://sepolia.drpc.org",
  mockUsdtAddress: "0xd077a400968890eacc75cdc901f0356c943e4fdb",

  // USDT has 6 decimals
  usdtDecimals: 6,

  // AWS Bedrock
  awsRegion: process.env.AWS_REGION || "us-east-1",
  claudeHaiku: "global.anthropic.claude-haiku-4-5-20251001-v1:0",

  // Server
  port: parseInt(process.env.PORT || "3000", 10),

  // Lending defaults
  defaultLoanDurationMs: 24 * 60 * 60 * 1000, // 24 hours (for demo)
  maxNegotiationRounds: 5,
  minCreditScore: 300,
  maxCreditScore: 850,
  defaultCollateralPercent: 100,
} as const;

// Convert human-readable USDT amount to base units (6 decimals)
export function toUsdtUnits(amount: number): bigint {
  return BigInt(Math.round(amount * 10 ** CONFIG.usdtDecimals));
}

// Convert base units to human-readable USDT amount
export function fromUsdtUnits(units: bigint): number {
  return Number(units) / 10 ** CONFIG.usdtDecimals;
}
