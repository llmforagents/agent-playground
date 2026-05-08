# Agent Playground

The official playground for the [LLM4Agents](https://llm4agents.com) platform — a polished, mainnet-ready dashboard to test every endpoint of the API and every MCP tool from a single browser tab.

> **Live:** [playground.llm4agents.com](https://playground.llm4agents.com)
> **SDK:** [`@llmforagents/sdk`](https://www.npmjs.com/package/@llmforagents/sdk) — every API call in this app is made through the official TypeScript SDK.
> **License:** MIT

This repo is the source of the production playground. It is open-source so anyone integrating LLM4Agents can:

- Read a real-world reference implementation of the SDK (chat streaming, agentic tool-calling, gas-sponsored transfers, deposit watching, image generation, etc.).
- Self-host their own playground against `api.llm4agents.com` / `mcp.llm4agents.com` or against a different deployment.
- Copy individual pages or hooks straight into their own product.

---

## Why use it

- **Try the platform without writing code.** Register an agent, fund a deposit address on Solana or Polygon, and start chatting against any of the 300+ models in the catalog — all from the UI.
- **Built entirely on `@llmforagents/sdk`.** Every REST call (`/v1/chat/completions`, `/v1/tx/send`, `/v1/models`, …) and every MCP tool invocation goes through the SDK. The repo is, in effect, the largest example of how to use the SDK in a real React app.
- **17 MCP tools wired to the chat.** The agentic chat can search the web, scrape pages, take screenshots, render PDFs, and generate or edit images mid-conversation. Cost guardrails (one tool per turn, same-args dedup, image short-circuit) keep runs under control.
- **Mainnet-safe by design.** Real money flows through the `/tx` route, so it's never exposed to the agentic chat — moving funds always requires an explicit user click.
- **EN + ES UI** with neutral Latin American Spanish.

---

## Quick start

```bash
git clone https://github.com/llmforagents/agent-playground.git
cd agent-playground
npm install
cp .env.example .env   # defaults point to api.llm4agents.com + mcp.llm4agents.com
npm run dev
```

Open [http://localhost:4301](http://localhost:4301).

### Requirements

- Node 20+
- Network access to `api.llm4agents.com` and `mcp.llm4agents.com` (or your own deployment)

### Environment variables

| Var | Purpose | Default |
|---|---|---|
| `VITE_API_BASE` | Base URL of the LLM4Agents REST API | `https://api.llm4agents.com` |
| `VITE_MCP_BASE` | Base URL of the LLM4Agents MCP gateway | `https://mcp.llm4agents.com` |
| `VITE_GITHUB_CLIENT_ID` | (Optional) Enables the "Claim test USD" GitHub-OAuth flow | empty |
| `VITE_TURNSTILE_SITE_KEY` | (Optional) Cloudflare Turnstile site key paired with the claim flow | empty |

Leave the optional vars empty to hide the claim button.

---

## Features

Each route in the sidebar maps to one API surface or MCP namespace:

| Route | Backed by |
|---|---|
| `/agents` | `POST /api/v1/agents/register` — keys persisted in IndexedDB, multi-agent switching |
| `/wallet` | `POST /api/v1/wallets/generate` — Solana / Polygon × USDC / USDT, deposit polling |
| `/chat` | `POST /v1/chat/completions` with streaming + agentic tool-calling (native or prompt mode, auto-fallback) |
| `/models` | `GET /api/v1/models` with search, price, context-window filters |
| `/scraper/one-shot` | MCP tools `fetch_html`, `markdown`, `links`, `screenshot`, `pdf`, `extract` (proxy tier: none / datacenter / residential) |
| `/scraper/sessions` | Persistent browser sessions via `session_create / exec / close / status` |
| `/search` | `google_search`, `google_news`, `google_maps`, `google_batch_search` |
| `/images` | `generate_image` (PNG), `edit_image` (JPEG), `analyze_image` (vision Q&A) — mime sniffing + inline preview + download |
| `/tx` | `POST /v1/tx/send` — gas-sponsored USDC transfer on Polygon via EIP-2612 Permit + StablecoinForwarder. Fee debited from the USD balance, no MATIC needed. |
| `/transactions` | `GET /api/v1/transactions` with filters, stats, pagination |
| `/council` | Multi-model deliberation across N models with cost estimation |
| `/settings` | Theme, language (EN / ES), health check, wipe local data |
| `/guide` | Step-by-step end-to-end walkthrough |

For the full list of MCP tools wired to chat vs. tools only available through dedicated routes (and *why*), see [`docs/chat-tools.md`](docs/chat-tools.md).

### Cost protections on the chat

Three guardrails prevent runaway charges when a model loops:

1. **One tool per turn** — after a successful tool call, any second `tool_call` in the same turn aborts the run immediately. No extra `chat.completion` charged.
2. **Same-args dedup** — a repeated call with identical arguments reuses the cached result (no second MCP hit).
3. **Image short-circuit** — image tools are terminal: the PNG / JPEG *is* the answer, so the synthesis `chat.completion` is skipped entirely (≈ $0.015 saved per image).

Default `maxIterations` is `3`; hard cap of 3 real tool calls per run.

---

## Workflow

1. `/agents` → register your first agent. The API key is persisted in this browser's IndexedDB.
2. `/wallet` → **Generate wallet** → deposit USDC or USDT on Solana or Polygon.
3. Refresh balance → once credited, `/chat` unlocks.
4. Default model is `gemini-2.5-flash-lite`. Switching to a more expensive model triggers a confirmation prompt.
5. Try `/images` with a prompt like *"a neon-lit dashboard on a developer desk"*, or ask the chat to generate one directly.
6. Try `/tx` with a small amount (e.g. `0.01 USDC`) to a test address — the receipt shows the fee in USD plus an explorer link returned by the backend.

---

## Tech stack

- [**React 19**](https://react.dev) + [**TypeScript**](https://www.typescriptlang.org) (strict, with all `noUncheckedIndexedAccess` / `exactOptionalPropertyTypes` flags on)
- [**Vite**](https://vitejs.dev) for dev + production build
- [**TanStack Query**](https://tanstack.com/query) for server state
- [**Zustand**](https://zustand-demo.pmnd.rs) for UI state
- [**Tailwind CSS**](https://tailwindcss.com) + [**Radix UI**](https://radix-ui.com) + [**shadcn/ui**](https://ui.shadcn.com) for the design system
- [**Dexie**](https://dexie.org) (IndexedDB) for local agent / chat persistence
- [**Monaco Editor**](https://microsoft.github.io/monaco-editor/) for JSON / code panels
- [**Zod**](https://zod.dev) for boundary validation
- [**Vitest**](https://vitest.dev) + [**Testing Library**](https://testing-library.com) + [**MSW**](https://mswjs.io) for unit / integration tests
- [`@llmforagents/sdk`](https://www.npmjs.com/package/@llmforagents/sdk) — single source of truth for every API call

The codebase follows a **Hexagonal Architecture** layout (`domain/`, `application/`, `infrastructure/`, `presentation/`, `composition/`) — adapters in `infrastructure/` are the only place the SDK is imported, so the rest of the app is fully testable with in-memory ports.

---

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server on port `4301`, exposed on the network |
| `npm run build` | Type-check + static build into `dist/` |
| `npm run preview` | Serve the build on `4301` |
| `npm test` | Vitest watcher |
| `npm run test:ci` | Vitest single run |
| `npm run test:coverage` | Coverage report (V8) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |

---

## Deployment

The production playground at [playground.llm4agents.com](https://playground.llm4agents.com) is deployed to **Cloudflare Pages**. See [`docs/deploy-cloudflare.md`](docs/deploy-cloudflare.md) for the full deployment runbook (custom domain, Pages project, build command, env vars).

Self-hosting is supported anywhere that serves a static SPA — Cloudflare Pages, Vercel, Netlify, S3 + CloudFront, or `nginx`. The built `dist/` folder has no server-side dependencies.

---

## Mainnet warning

This dashboard is wired to **production mainnet** — addresses generated under `/wallet` receive real funds and `/tx` sends real on-chain transfers. Read [`docs/mainnet-warning.md`](docs/mainnet-warning.md) before sharing your API key with anyone.

---

## Documentation

- [`docs/chat-tools.md`](docs/chat-tools.md) — which MCP tools are exposed to the agentic chat and why.
- [`docs/council-feature.md`](docs/council-feature.md) — the multi-model deliberation feature.
- [`docs/mainnet-warning.md`](docs/mainnet-warning.md) — security & mainnet considerations.
- [`docs/deploy-cloudflare.md`](docs/deploy-cloudflare.md) — Cloudflare Pages deployment runbook.
- [`docs/testing-guide.md`](docs/testing-guide.md) — manual + automated test workflows.

---

## Contributing

Issues and pull requests are welcome. Before opening a PR:

1. `npm run typecheck && npm run lint && npm run test:ci` — all three must pass.
2. Keep new code in the existing layered structure (`domain` → `application` → `infrastructure` → `presentation`).
3. New API calls must go through `@llmforagents/sdk` — do not call `fetch` directly from feature code.

---

## License

[MIT](LICENSE) © LLM4Agents
