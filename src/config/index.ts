import dotenv from "dotenv";
dotenv.config();

export const CONFIG = {
  // Sepolia testnet
  chainId: 11155111,
  rpcUrl: process.env.SEPOLIA_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com",

  // LendNet USD token (self-deployed mintable ERC-20)
  // Set LNUSD_ADDRESS in .env to reuse a previously deployed token
  tokenAddress: process.env.LNUSD_ADDRESS || "",
  deployerPrivateKey: process.env.DEPLOYER_PRIVATE_KEY || "",

  // Aave V3 Sepolia
  aaveUsdtAddress: "0xaA8E23Fb1079EA71e0a56F48a2aA51851D8433D0",
  aavePoolAddress: "0x6Ae43d3271ff6888e7Fc43Fd7321a503ff738951",
  aaveUiPoolDataProvider: "0x69529987FA4A075D0C00B0128fa848dc9ebbE9CE",
  aavePoolAddressesProvider: "0x012bAC54348C0E635dCAc9D5FB99f06F24136C9A",
  aaveOracle: "0x2da88497588bf89281816106C7259e31AF45a663",

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
};

// Mutable — set after token deployment
export function setTokenAddress(address: string): void {
  (CONFIG as any).tokenAddress = address;
}

// Convert human-readable USDT amount to base units (6 decimals)
export function toUsdtUnits(amount: number): bigint {
  return BigInt(Math.round(amount * 10 ** CONFIG.usdtDecimals));
}

// Convert base units to human-readable USDT amount
export function fromUsdtUnits(units: bigint): number {
  return Number(units) / 10 ** CONFIG.usdtDecimals;
}
