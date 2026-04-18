# llm4agents dashboard

Local interactive dashboard to test every endpoint of the [llm4agents](https://api.llm4agents.com) API — 7 REST endpoints plus 10 MCP scraper tools — with multi-agent isolation and mainnet-safe guardrails.

## Requirements

- Node 20+
- Access to `api.llm4agents.com` and `mcp.llm4agents.com`
- (Optional) `/etc/hosts` entry so teammates can reach this machine as `skywalker`

## Quick start

```bash
npm install
npm run dev
```

Open `http://localhost:4301` (or `http://skywalker:4301` from a teammate's laptop once their `/etc/hosts` is configured).

## Workflow

1. Go to `/agents` → register your first agent → the API key is persisted in this browser's IndexedDB.
2. Go to `/wallet` → "Generate wallet" → deposit USDC/USDT on Solana or Polygon.
3. Refresh balance manually → when credited, `/chat` unlocks.
4. Default model is `gemini-2.5-flash-lite`. Switching to a more expensive model prompts a confirmation.

## Scripts

- `npm run dev` — Vite dev server, port 4301, exposed on the network.
- `npm run build` — static build (`dist/`).
- `npm run preview` — serve the build on 4301.
- `npm test` — Vitest watcher.
- `npm run test:ci` — Vitest single run.
- `npm run test:coverage` — coverage report.
- `npm run typecheck` — `tsc --noEmit`.
- `npm run lint` — ESLint.

## Mainnet warning

This dashboard is wired to **production mainnet**. See `docs/mainnet-warning.md`.

## Architecture

See `docs/superpowers/specs/2026-04-17-llm4agents-dashboard-design.md`.
