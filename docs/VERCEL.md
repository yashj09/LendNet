# Vercel Demo Backend

This backend can now run on Vercel in demo mode.

## Recommended Vercel Settings

- Root Directory: `lendnet`
- Framework Preset: `Other`
- Build Command: `npm run build:api`
- Output Directory: leave blank

## What Works

- `GET /`
- `GET /api`
- `GET /api/agents`
- `GET /api/loans`
- `GET /api/loans/stats`
- Most request-response endpoints under `/api/*`

## Demo-Mode Limitations

- Agents and loans are stored in memory, so data may reset on cold starts.
- `GET /api/events` is disabled because long-lived SSE connections do not fit this Vercel deployment.
- `POST /api/autonomous/start` and `POST /api/autonomous/stop` return a clear disabled response.
- `GET /api/autonomous/status` reports `supported: false` on Vercel.

## Required Environment Variables

- `DEPLOYER_PRIVATE_KEY`
- `SEPOLIA_RPC_URL`
- `LNUSD_ADDRESS` if reusing an existing token deployment
- `AWS_REGION` if your runtime depends on it
- `DASHBOARD_URL` optionally, for the health response payload
