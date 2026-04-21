# llm4agents dashboard

Local interactive dashboard to test every endpoint of the [llm4agents](https://api.llm4agents.com) API — 8 REST endpoints plus 17 MCP tools (scraper, search, and image) — with multi-agent isolation and mainnet-safe guardrails. EN + ES UI.

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

## Features

Each route in the sidebar maps to one API surface:

| Route | What it tests |
|---|---|
| `/agents` | Register agents, keep API keys in IndexedDB, switch the active one |
| `/wallet` | Generate deposit addresses (Solana/Polygon × USDC/USDT), watch for deposits |
| `/chat` | `POST /v1/chat/completions` with streaming + agentic tool-calling (native or prompt mode, auto-fallback) |
| `/models` | `GET /api/v1/models` with search + price + context window |
| `/scraper/one-shot` | `fetch_html`, `markdown`, `links`, `screenshot`, `pdf`, `extract` (proxy tier: none / datacenter / residential) |
| `/scraper/sessions` | Persistent browser sessions via `session_create/exec/close/status` |
| `/search` | `google_search`, `google_news`, `google_maps`, `google_batch_search` |
| `/images` | `generate_image` (PNG), `edit_image` (JPEG), `analyze_image` (vision Q&A). Mime sniffing + inline preview + download. |
| `/tx` | `POST /v1/tx/send` — gas-sponsored USDC transfer on Polygon via EIP-2612 Permit + StablecoinForwarder. Fee debited from USD balance (no MATIC needed). |
| `/transactions` | `GET /api/v1/transactions` with filters + stats + pagination |
| `/settings` | Theme, language (EN/ES), health check, wipe local data |
| `/guide` | Step-by-step walkthrough of an end-to-end test |

The agentic chat can invoke every search / scraper / image tool mid-conversation. Images are rendered inline in the assistant bubble. The `/tx` endpoint is deliberately **not** exposed to the chat — moving real money on-chain needs an explicit user click.

### Cost protections on the chat

Three guardrails prevent runaway charges when a model loops:

1. **One tool per turn** — after a successful tool call, any second tool_call in the same turn aborts the run immediately. No extra chat.completion charged.
2. **Same-args dedup** — a repeated call with identical arguments reuses the cached result (no second MCP hit).
3. **Image short-circuit** — image tools are terminal: the PNG/JPEG IS the answer, so we skip the synthesis chat.completion entirely (saves ~$0.015 per image).

Default `maxIterations` is 3, hard cap of 3 real tool calls per run.

## Workflow

1. `/agents` → register your first agent → the API key is persisted in this browser's IndexedDB.
2. `/wallet` → "Generate wallet" → deposit USDC/USDT on Solana or Polygon.
3. Refresh balance manually → when credited, `/chat` unlocks.
4. Default model is `gemini-2.5-flash-lite`. Switching to a more expensive model prompts a confirmation.
5. Try `/images` with a prompt like "a neon-lit dashboard on a developer desk", or ask the chat to generate one directly.
6. Try `/tx` with a small amount (e.g. `0.01` USDC) to a test address — the receipt shows the fee in USD + an explorer link provided by the backend.

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
