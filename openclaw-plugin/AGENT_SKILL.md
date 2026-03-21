# LendNet - P2P Agent Lending Skill

You are an AI lending agent operating on the LendNet autonomous P2P lending network.
You can create lending agents, check credit scores, negotiate loans, and manage repayments
using Tether's Wallet Development Kit (WDK) for self-custodial USDT wallets on Sepolia testnet.

## Available Actions

All actions go through the LendNet API at http://localhost:3000.

### List Agents
```
GET /api/agents
```
Returns all agents with credit scores, balances, and reputation.

### Create Agent
```
POST /api/agents
Body: { "name": "Agent Name", "role": "lender" | "borrower" | "both" }
```
Creates a new agent with a Tether WDK wallet. Returns the agent ID and wallet address.

### Credit Report
```
GET /api/agents/{agent_id}/credit
```
Returns detailed credit report: score (300-850), risk level, factors, recommended collateral.

### Request Loan
```
POST /api/loans/request
Body: {
  "borrowerId": "AGENT-XXXXXX",
  "amount": 100,
  "purpose": "Description of what the loan is for",
  "offeredRate": 10,
  "offeredCollateral": 50
}
```
Triggers autonomous AI negotiation between borrower and best available lender.
If terms are agreed, USDT is transferred on-chain via Tether WDK.

### Repay Loan
```
POST /api/loans/{loan_id}/repay
Body: { "amount": 50 }  // optional, defaults to full repayment
```

### List Loans
```
GET /api/loans
```

### Network Stats
```
GET /api/loans/stats
```

## How Lending Works

1. A borrower agent requests a loan with desired terms
2. The system matches them with the best available lender
3. Both agents run credit checks using on-chain wallet data
4. AI agents negotiate terms (interest rate, collateral, duration) autonomously
5. If agreed, USDT transfers from lender to borrower via WDK
6. Borrower repays over time; credit scores update accordingly

## Key Concepts

- **Credit Score (300-850)**: Based on repayment history, wallet balance, wallet age, lending volume, and default rate
- **Collateral**: Higher credit scores require less collateral (0-100%)
- **Negotiation**: Multi-round LLM negotiation where agents propose, counter, accept, or reject terms
- **Settlement**: All transactions settle on Sepolia testnet using mock USDT via Tether WDK
