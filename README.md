# LendNet -- Autonomous P2P Agent Lending Network

> AI agents that autonomously negotiate and settle USDT loans on-chain using **Tether WDK** + **Claude AI**, governed by decentralized AI consensus


<img width="1765" height="1297" alt="Screenshot 2026-03-23 at 5 30 03 AM" src="https://github.com/user-attachments/assets/4d545233-4452-4700-8e08-7f18d3dbc79b" />


## What is LendNet?

LendNet is a peer-to-peer lending network where **autonomous AI agents** negotiate loan terms in real-time, execute USDT transfers on-chain via Tether WDK, and manage credit risk -- all without human intervention. Network-wide monetary policy is set through **AI consensus governance** where agents with opposing interests debate and vote.

**100% on-chain settlement.** Every loan, repayment, and token mint is a real ERC-20 transaction on Sepolia -- verifiable on Etherscan. No fake ledgers.

Each agent has:
- A **self-custodial WDK wallet** on Sepolia testnet
- An **AI personality** powered by Claude (via Amazon Bedrock) that negotiates rates, collateral, and duration
- A **FICO-like credit score** (300-850) based on 5 weighted factors
- Full **reputation tracking** across all lending activity
- A **governance vote** in network policy decisions
- **Aave V3 integration** for yield on idle capital

### How It Works

1. **Create Agents** -- Spawn lender and borrower agents, each with a real WDK wallet funded with 1000 USDT (minted on-chain) + ETH for gas
2. **Request a Loan** -- A borrower agent submits a loan request with desired terms
3. **Committee Review** -- For risky/large loans, ALL agents deliberate and vote on whether to approve
4. **AI Negotiation** -- Claude-powered agents negotiate back and forth (up to 5 rounds) using structured tool calls
5. **On-Chain Settlement** -- If agents agree, the loan is funded via real P2P USDT transfer through WDK
6. **Repayment** -- Borrower repays (partial or full) via on-chain transfer, credit scores update
7. **Governance** -- Agents periodically convene to debate and vote on network interest rates
8. **Autonomous Mode** -- Agents independently borrow, repay, supply to Aave, and govern -- zero human input

### Architecture

```
+-------------------------------------------------+
|              Next.js Dashboard (:3001)           |
|    Interactive UI + SSE Real-Time Feed + Toasts  |
+-------------------------------------------------+
|              Express API Server (:3000)           |
+----------+----------+----------+----------------+
|  Agent   |   Loan   | Credit   |  Consensus     |
| Manager  | Manager  | Scorer   |  Engine        |
+----------+----+-----+----------+----------------+
| Negotiation   |   Governance (3-Phase Voting)    |
| Engine        |   Rate / Approval / Disputes     |
+---------------+----------------------------------+
|           Tether WDK (Wallet Layer)              |
|     Self-custodial EVM wallets on Sepolia        |
+--------------------------------------------------+
|    Self-Deployed USDT (ERC-20) + Aave V3         |
|    Real on-chain settlement on Sepolia           |
+--------------------------------------------------+
|      Claude AI (Amazon Bedrock)                  |
|   Structured tool use for all agent decisions    |
+--------------------------------------------------+
```

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Wallet Infrastructure | Tether WDK (`@tetherto/wdk`, `@tetherto/wdk-wallet-evm`) |
| AI Engine | Claude Haiku 4.5 via Amazon Bedrock (`@anthropic-ai/bedrock-sdk`) |
| Token | Self-deployed mintable USDT (ERC-20, 6 decimals) on Sepolia |
| DeFi | Aave V3 on Sepolia (supply, borrow, withdraw, repay) |
| Smart Contracts | Solidity 0.8.20, compiled with Hardhat |
| Backend | Node.js + Express + TypeScript |
| Dashboard | Next.js 15 + React 19 + Tailwind CSS 4 |
| Integrations | MCP Server + OpenClaw Plugin |

## Key Features

### 100% On-Chain Settlement

Every financial operation is a real Sepolia transaction:

| Action | On-Chain? | Details |
|--------|-----------|---------|
| Token deployment | Yes | Self-deployed USDT ERC-20 via Hardhat |
| Agent wallet creation | Yes | HD wallet via Tether WDK |
| Agent funding (mint) | Yes | Deployer mints USDT to agent |
| Loan funding | Yes | Lender -> Borrower P2P USDT transfer |
| Loan repayment | Yes | Borrower -> Lender P2P USDT transfer |
| Aave supply/withdraw | Yes | Agent <-> Aave V3 pool |
| AI negotiation | Off-chain | Claude Bedrock API calls |
| Governance voting | Off-chain | Claude Bedrock API calls |

Every transaction triggers a **toast notification** with a direct Etherscan link for verification.

### AI Consensus Governance

LendNet replaces traditional DAO voting with **autonomous AI governance**. All agents participate in a 3-phase consensus process:

1. **DELIBERATION** -- Each agent independently evaluates the proposal from their role's perspective (lenders want higher rates, borrowers want lower)
2. **DISCUSSION** -- Agents see each other's positions and can revise their stance
3. **VOTE** -- Final vote, simple majority wins

Three governance scenarios:

| Scenario | Trigger | What Agents Decide |
|----------|---------|-------------------|
| **Rate Committee** | Every 5 loans (auto) or manual | Network base interest rate |
| **Loan Approval** | Loan >$500 or borrower score <450 | Whether to approve a risky loan |
| **Dispute Resolution** | Overdue loans (manual) | Extend, restructure, or default |

Requires 3+ agents. Agents with opposing interests (lenders vs borrowers) create genuine debate and compromise.

### AI Negotiation

Each loan negotiation runs up to 5 rounds where agents use Claude's structured tool calling:
- **PROPOSE** -- Suggest new terms (amount, rate, duration, collateral)
- **COUNTER** -- Counter-propose with modified terms
- **ACCEPT** -- Agree to the current terms
- **REJECT** -- Walk away from the deal

### Credit Scoring

5-factor FICO-like model (300-850):

| Factor | Weight | Description |
|--------|--------|-------------|
| Repayment History | 35% | On-time repayment track record |
| Wallet Balance | 30% | Current on-chain USDT holdings |
| Wallet Age | 15% | How long the agent has been active |
| Lending Volume | 10% | Total volume of lending activity |
| Default Rate | 10% | Historical default percentage |

### Autonomous Mode

One-click autonomous operation where agents independently:
- **Auto-borrow** -- Borrowers request loans when balance is low
- **Auto-repay** -- Repay loans approaching their due date
- **Auto-yield** -- Lenders supply idle USDT to Aave V3 for yield
- **Auto-govern** -- Rate committee convenes after every 5 loans
- **Auto-dispute** -- Detect and resolve overdue loans

### Aave V3 DeFi Integration

Agents can interact with Aave V3 on Sepolia via Tether WDK:
- Supply USDT to earn yield
- Borrow against collateral
- Withdraw supplied assets
- Repay Aave debt

## Quick Start

### Prerequisites

- Node.js 18+
- A Sepolia wallet with ~0.1 ETH (for deploying token + funding agents)
- AWS credentials with Bedrock access (for Claude AI)

### Setup

```bash
cd lendnet
npm install
cd dashboard && npm install && cd ..

cp .env.example .env
# Edit .env:
#   DEPLOYER_PRIVATE_KEY=0xYourSepoliaPrivateKey
#   AWS_REGION=us-east-1
#   AWS_ACCESS_KEY_ID=your_key
#   AWS_SECRET_ACCESS_KEY=your_secret
```

### Run

```bash
# Terminal 1: Start backend API (auto-deploys USDT token)
npm run dev

# Terminal 2: Start dashboard
npm run dev:dashboard
```

Open **http://localhost:3001** to access the interactive dashboard.

On first run, the server deploys a fresh USDT token to Sepolia. Copy the printed address to `.env` as `LNUSD_ADDRESS` to reuse it across restarts.

### Demo Flow

1. **Create 3+ agents** -- Mix of lenders and borrowers (needed for governance)
2. **Request a Loan** -- Watch AI agents negotiate terms in real-time
3. **Verify on-chain** -- Click the toast notification to view the transaction on Etherscan
4. **Repay the loan** -- See credit scores and reputations update
5. **Convene Rate Committee** -- Click the governance button to see agents debate interest rates
6. **Toggle Autonomous Mode** -- Watch agents operate independently

See [docs/SETUP.md](docs/SETUP.md) for detailed setup instructions and API curl examples.
See [docs/DEMO_SCRIPT.md](docs/DEMO_SCRIPT.md) for the demo video recording guide.

## Integrations

### MCP Server (Model Context Protocol)

```bash
npm run mcp
```

Compatible with Claude Desktop, OpenClaw (via mcporter), and any MCP client. 7 tools exposed.

### OpenClaw Plugin

Drop-in plugin for [OpenClaw](https://openclaw.ai) with Telegram/Discord/WhatsApp support. See `openclaw-plugin/`.

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/agents` | List all agents with on-chain balances |
| POST | `/api/agents` | Create agent `{name, role}` |
| GET | `/api/agents/:id` | Get agent details + Aave position |
| GET | `/api/agents/:id/credit` | Get credit report |
| POST | `/api/loans/request` | Request loan `{borrowerId, amount, purpose, offeredRate, offeredCollateral}` |
| POST | `/api/loans/:id/repay` | Repay loan `{amount?}` |
| GET | `/api/loans` | List all loans |
| GET | `/api/loans/stats` | Network statistics |
| GET | `/api/events` | SSE real-time event stream |
| GET | `/api/governance/policy` | Current network policy |
| GET | `/api/governance/sessions` | All governance sessions |
| POST | `/api/governance/rate-committee` | Convene rate committee |
| POST | `/api/governance/dispute/:loanId` | Start dispute resolution |
| GET | `/api/agents/:id/aave` | Get Aave V3 position |
| POST | `/api/agents/:id/aave/supply` | Supply USDT to Aave |
| POST | `/api/agents/:id/aave/withdraw` | Withdraw from Aave |
| POST | `/api/agents/:id/aave/borrow` | Borrow from Aave |
| POST | `/api/agents/:id/aave/repay` | Repay Aave debt |
| POST | `/api/autonomous/start` | Start autonomous mode |
| POST | `/api/autonomous/stop` | Stop autonomous mode |
| GET | `/api/autonomous/status` | Autonomous mode status |

## Project Structure

```
lendnet/
├── src/
│   ├── index.ts                 # Entry point -- deploys token, starts server
│   ├── config/
│   │   ├── index.ts             # Central configuration
│   │   └── types.ts             # TypeScript interfaces
│   ├── contracts/
│   │   ├── LendNetToken.ts      # Token deployer/minter (ethers.js)
│   │   └── USDT.json            # Compiled ABI + bytecode
│   ├── wallet/
│   │   └── WalletManager.ts     # WDK wallet wrapper + Aave V3
│   ├── credit/
│   │   └── CreditScorer.ts      # 5-factor credit scoring
│   ├── negotiation/
│   │   └── NegotiationEngine.ts # Claude AI negotiation
│   ├── governance/
│   │   └── ConsensusEngine.ts   # 3-phase AI consensus governance
│   ├── loans/
│   │   └── LoanManager.ts       # Loan lifecycle management
│   ├── agents/
│   │   ├── AgentManager.ts      # Agent orchestrator
│   │   └── AutonomousLoop.ts    # Auto-borrow, auto-repay, auto-yield
│   └── api/
│       └── server.ts            # Express REST API + SSE
├── hardhat/
│   ├── contracts/USDT.sol       # Mintable USDT token (Solidity)
│   ├── scripts/deploy.js        # Hardhat deploy script
│   └── hardhat.config.js        # Hardhat configuration
├── dashboard/                   # Next.js 15 interactive UI
│   └── src/
│       ├── app/page.tsx         # Main dashboard page
│       ├── components/          # AgentCard, LoanCard, NegotiationVisualizer,
│       │                        # GovernancePanel, TxToast, ConsensusVisualizer, etc.
│       └── lib/                 # API client + types
├── mcp-server/
│   └── index.ts                 # MCP stdio server
├── openclaw-plugin/
│   ├── index.ts                 # OpenClaw plugin handler
│   └── AGENT_SKILL.md           # Agent instruction file
├── docs/
│   ├── SETUP.md                 # Setup & testing guide
│   └── DEMO_SCRIPT.md           # Demo video script
└── package.json
```

## Judging Criteria Alignment

| Criteria | How LendNet Addresses It |
|----------|-------------------------|
| **Agent Intelligence** | Multi-round Claude negotiation with structured tool use. 3-phase governance with opposing interests. Autonomous mode with independent decision-making. |
| **WDK Wallet Integration** | Every agent has a WDK-derived HD wallet. All transfers are real on-chain ERC-20 operations. Aave V3 integration via WDK lending protocol. |
| **Technical Execution** | TypeScript throughout. Express API + Next.js dashboard. SSE real-time events. Self-deployed ERC-20 token via Hardhat. Credit scoring engine. |
| **Agentic Payment Design** | P2P loan funding, conditional repayment, committee-gated approvals, Aave yield management. All programmable and autonomous. |
| **Originality** | First agent-to-agent lending network with AI governance. Agents debate monetary policy like a central bank committee. |
| **Polish & Ship-ability** | Real-time dashboard with negotiation visualizer, governance panel, toast notifications with Etherscan links, autonomous mode toggle. |
| **Presentation & Demo** | Every tx verifiable on Etherscan. Dashboard shows full loan lifecycle. See [demo script](docs/DEMO_SCRIPT.md). |

## Known Limitations

- **In-memory storage** -- Agent and loan data resets on server restart (no database)
- **Testnet only** -- Uses Sepolia; not intended for mainnet
- **No real gas optimization** -- Transactions use default gas settings
- **Single-node** -- No distributed consensus at infrastructure level; AI consensus is application-layer

## License

Apache 2.0

---

Built for **Tether Hackathon Galactica: WDK Edition 1** by Yash Jain
