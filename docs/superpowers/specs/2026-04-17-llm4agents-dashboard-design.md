# llm4agents Dashboard — Design Spec

**Date:** 2026-04-17
**Status:** Draft (awaiting user approval)
**Author:** Cleyson + Claude (brainstorming session)
**Scope:** v1 local dashboard for testing every endpoint of the llm4agents API (REST + MCP)

---

## 1. Context

`llm4agents` exposes two services:

- **REST API** at `https://api.llm4agents.com` — 7 endpoints documented in `openapi.json` (v1.0.0, "LLM Proxy API"), OpenAI-compatible chat completions with SSE streaming, Bearer auth.
- **MCP Server** at `https://mcp.llm4agents.com/mcp` — 10 scraper tools exposed via Model Context Protocol (Streamable HTTP, JSON response mode), same Bearer auth.

We need a local interactive dashboard that covers **100% of endpoints across both services** for testing purposes, usable by more than one person from the same codebase.

### Operational context — MAINNET
Testing happens against **mainnet with real money**. Once the dashboard is ready, the user will deposit real funds (USDT/USDC on Solana or Polygon) to a generated wallet. Once the balance is credited, real testing begins. Default model for every test is `gemini-2.5-flash-lite` (chosen for low cost). Every retry, polling loop, or redundant request costs real money — the design must prevent accidental spend.

## 2. Goals

- Exercise all 7 REST endpoints with typed, validated request/response panels.
- Exercise all 10 MCP scraper tools (6 one-shot + 4 session) with specialized UIs per tool category.
- Support multiple "agents" (API keys) side-by-side with isolated history per agent.
- Persist state locally across browser reloads (agents, history, MCP session IDs, preferences).
- Prevent accidental spend on mainnet: safe model defaults, confirmations, zero auto-retry on chat.
- Be accessible on the local network as `http://skywalker:4201` so teammates can access it.

## 3. Non-goals (v1)

- No authentication/authorization of dashboard users (per-browser isolation is sufficient).
- No shared backend or central database (each user's browser has its own IndexedDB).
- No production hosting, no public exposure.
- No automated E2E tests against real servers (local Vitest only).
- No visual regression tests.
- No server-side secret storage (API keys live in the user's browser only).

## 4. Stack

- **Vite 5** + **React 18** + **TypeScript** with strict flags:
  `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noFallthroughCasesInSwitch`, `noImplicitReturns`, `noPropertyAccessFromIndexSignature`, `verbatimModuleSyntax`, `isolatedModules`, `noUnusedLocals`, `noUnusedParameters`.
- **Tailwind 3** + **shadcn/ui** for the component system and dark mode.
- **TanStack Query** (React Query v5) for server state and cache.
- **Zustand** for client-only UI state (active agent, drawer open, theme).
- **Dexie** (IndexedDB wrapper) for persistent data (agents, history, MCP sessions).
- **Zod** for every external payload (REST responses, MCP results, env vars).
- **react-router** v6 for navigation.
- **Vitest** + **@testing-library/react** + **fake-indexeddb** for tests.
- **Monaco Editor** for JSON editing in `<RequestPanel>`/`<ResponsePanel>`.
- No backend. Dev server runs on **port 4201**, binds to all interfaces (`server.host: true`), proxies `/proxy/api` and `/proxy/mcp` to bypass CORS.

## 5. Architecture — Ports & Adapters

Four layers, following Pattern 12 of the project-wide TypeScript-strict standard:

```
┌──────────────────────────────────────────────────────────┐
│ Presentation  React routes + shadcn UI                   │
├──────────────────────────────────────────────────────────┤
│ Application   Use cases — orchestrate ports, apply rules │
├──────────────────────────────────────────────────────────┤
│ Domain        Pure types: branded, Result, errors        │
├──────────────────────────────────────────────────────────┤
│ Infrastructure RestApiClient, McpClient, Dexie repos,    │
│                SSE parser                                │
└──────────────────────────────────────────────────────────┘
```

- `domain/` has zero external imports — only types, branded constructors, `Result`, error unions, `assertNever`.
- `application/` depends on domain types + port interfaces. Never imports concrete adapters.
- `infrastructure/` implements the ports. Only place that talks to `fetch`, Dexie, or external libs.
- `presentation/` validates input with Zod at form submission, calls application use cases, renders results.
- `composition/root.ts` is the only place where concrete adapters are instantiated and wired.

### Dev-server and proxies

`vite.config.ts` sets:
- `server.port: 4201`
- `server.host: true` (listen on `0.0.0.0`)
- `server.strictPort: true`
- `server.proxy`:
  - `/proxy/api` → `https://api.llm4agents.com` (rewrites `/proxy/api` prefix off)
  - `/proxy/mcp` → `https://mcp.llm4agents.com/mcp`

The browser **never** calls external hosts directly. The `Authorization: Bearer` header is attached client-side and forwarded as-is by the proxy.

### Multi-agent authentication

- Each agent is stored in IndexedDB as `{ id: AgentId, name: string, apiKey: ApiKey, createdAt: Date, color: string }`.
- A Zustand store holds `activeAgentId`.
- An `AuthInterceptor` wraps every `RestApiClient` / `McpClient` call and injects the active agent's Bearer token.
- Switching agent:
  1. `queryClient.resetQueries()` — wipes in-memory cache.
  2. Query keys are prefixed with `['agent', agentId, ...]` so Dexie filters and React Query caches are naturally segmented.
  3. UI reloads active views (balance, models, transactions, MCP sessions).

## 6. Views and components

### Layout (always visible)

- **Sidebar (left, collapsible)** — route navigation.
- **Topbar** — `<AgentSwitcher>`, "Add agent" button, live `<BalanceBadge>`, `<ThemeToggle>`, **persistent ámbar "MAINNET — real money" banner**.
- **Main panel** — the active route.
- **Slide-over `<HistoryDrawer>`** — `Ctrl+H`, lists this agent's past requests; click to reopen one.

### Routes

| Route | Purpose | Endpoints / tools |
|---|---|---|
| `/` | Home — balance card (single `GET /balance` on mount), last 5 transactions (single `GET /transactions` on mount), list of known MCP sessions **read from IndexedDB** (no auto `session_status` call), quick shortcuts. All refreshes are manual. | — |
| `/agents` | Agent manager — create (calls `POST /agents/register`), rename local, delete local, export/import JSON profile | `POST /api/v1/agents/register` |
| `/models` | Filterable model catalog with pricing and context info | `GET /api/v1/models` |
| `/chat` | Chat playground — model selector (default `gemini-2.5-flash-lite`), multi-turn messages, SSE streaming, live cost/tokens/balance badges, export transcript | `POST /v1/chat/completions` |
| `/wallet` | Balance card, "Generate wallet" action, address + QR, deposit history | `GET /api/v1/balance`, `POST /api/v1/wallets/generate` |
| `/transactions` | Paginated table with filters (`deposit`/`usage`/`refund`), cumulative spend chart, CSV export | `GET /api/v1/transactions` |
| `/scraper/one-shot` | Sub-tabs for each one-shot tool with inline preview | `fetch_html`, `markdown`, `links`, `screenshot`, `pdf`, `extract` |
| `/scraper/sessions` | Active sessions list, per-session history, visual action builder for `session_exec`, close button | `session_create/exec/close/status` |
| `/health` | Manual ping of `GET /healthz` with timestamp | `GET /healthz` |
| `/settings` | Theme, wipe history, export/import everything, verbosity level | — |

### Shared components

- `<RequestPanel>` — Zod-typed form generator + "Send" button.
- `<ResponsePanel>` — tabs `[Pretty / Raw / Headers / Timing / Cost]` with JSON folding and syntax highlighting.
- `<CostBadge>` — reads `X-Cost-Usd-Cents`, `X-Tokens-Input`, `X-Tokens-Output` from the last chat response.
- `<AgentSwitcher>`, `<HistoryTimeline>`, `<JsonEditor>` (Monaco), `<StreamingOutput>`.
- `<ProxyTierSelector>` — reusable radio for every scraper tool (`none` / `datacenter` / `residential`).
- `<ModelPicker>` — combobox over `GET /models`, default `gemini-2.5-flash-lite`, confirm dialog if user selects a more expensive model.
- `<ErrorView error={...}>` — exhaustive `switch` on `error.kind` with `assertNever` default.

## 7. Data flow

```
UI (React)
  ├── UI state (Zustand)         ← active agent, open tabs, toggles
  ├── Server state (React Query) ← models, balance, transactions, chat streams
  │        │
  │        ▼
  │    useCase (application)
  │        │
  │        ├── RestApiClient ──► fetch /proxy/api/* ──► Vite proxy ──► api.llm4agents.com
  │        └── McpClient     ──► fetch /proxy/mcp   ──► Vite proxy ──► mcp.llm4agents.com/mcp
  │                │
  │                └── Zod validation → Result<T, E>
  │
  └── Local state (Dexie)        ← saved agents, history, MCP sessions
```

### Key type patterns

- **Branded types** — `ApiKey`, `AgentId`, `SessionId`, `UsdCents`, `RequestId`, `ChainId`, `WalletAddress`, `Model`.
- **Zod schemas as source of truth** — every REST response and MCP tool result has a Zod schema; types are `z.infer<>`.
- **`Result<T, E>` everywhere fallible** — no thrown errors on expected failures.
- **Error unions per layer** — `RestError` (network, timeout, unauthorized, insufficient_balance, rate_limited, validation, upstream_error) and `McpError` (jsonrpc_error, invalid_params, plus transport errors from `RestError`).
- **Use cases are pure functions** receiving `Deps` by parameter (Pattern 11).
- **Env validated once at startup** with Zod (`VITE_API_BASE`, `VITE_MCP_BASE`) — fails fast.

### Streaming chat

- `fetch` with `Accept: text/event-stream` (no SSE client lib).
- A generator async reads the `ReadableStream`, splits on `data: `, emits typed chunks.
- A custom hook `useChatStream(params)` returns `{ status, partialText, tokens, costCents, error? }`. Final result is committed to history via the `withHistory` decorator.

### MCP client

- Single POST to `/proxy/mcp` with JSON-RPC 2.0 payload.
- Persists `session_id` for session tools (stored in Dexie, filterable by `agentId`).
- Handles Streamable HTTP responses (NDJSON / SSE).
- Exposes typed methods `mcp.callTool<ToolName>(params)` with argument shape derived from Zod.
- **Preference:** use the official `@modelcontextprotocol/sdk` TS client if it supports Streamable HTTP transport cleanly; otherwise hand-roll a minimal JSON-RPC client (~100 LOC).

### History decorator

Every use case goes through `withHistory(useCase)` which records:

```ts
type HistoryEntry = Readonly<{
  id: RequestId
  agentId: AgentId
  timestamp: Date
  kind: 'rest' | 'mcp'
  endpoint: string        // "POST /v1/chat/completions" or "mcp:fetch_html"
  request: unknown        // snapshot as sent
  response: Result<unknown, unknown>
  costCents?: UsdCents
  durationMs: number
}>
```

## 8. Error handling in UI

Typed errors, exhaustive rendering, no `throw` across layer boundaries.

| `error.kind` | Surface | Suggested action |
|---|---|---|
| `network` | Topbar red banner, tachado wifi icon | "Retry" button |
| `timeout` | Toast warning + `<ResponsePanel>` | "Retry with larger timeout" |
| `unauthorized` | Blocking modal | "API key invalid — edit agent / generate new" |
| `insufficient_balance` | `<CostBadge>` red + overlay on `/chat` | Link to `/wallet` |
| `rate_limited` | Toast with `retryAfterMs` countdown | Auto-retry when countdown hits 0 if toast left open |
| `validation` | Inline on form fields | Highlight `issues[].path` |
| `upstream_error` | Banner in `<ResponsePanel>` + toast | Copy `request-id` to clipboard |
| `jsonrpc_error` | Banner in scraper view | Show `code` + `message` |
| `invalid_params` | Inline on tool form | Highlight offending field |

### React Query retry policy

- `network`, `timeout`, `upstream_error` → 2 retries, exponential backoff (1s, 3s).
- `unauthorized`, `validation`, `insufficient_balance` → 0 retries.
- `rate_limited` → single retry respecting `retryAfterMs`.
- **Chat completions → 0 retries of any kind.** Manual retry only — the user clicks the button. This is a **mainnet guardrail**.

### Streaming errors

`useChatStream` emits `{ status: 'error', partial: string, error: RestError }` mid-stream. UI shows the partial text + "Stream interrupted — retry" banner. No auto-resume.

### ErrorBoundary

React `<ErrorBoundary>` per route, catches **renderer errors only**. Domain errors never throw.

## 9. Mainnet guardrails

Integrated into the architecture to prevent accidental spend:

1. **Default model** in `/chat`: `gemini-2.5-flash-lite` (hardcoded initial selection).
2. **Confirm dialog** if user picks a model more expensive than the default. The price comparison is dynamic, based on `GET /models` response.
3. **Persistent ámbar banner** "MAINNET — real money" in the topbar, dismissable only once ("I understand") per browser.
4. **Zero auto-retry** on `POST /v1/chat/completions` for any error class.
5. **No polling, no background refresh** on paid endpoints. Balance and transactions refetch **only** after manual user actions or after a mutation that invalidates them.
6. **Chat locked while `balance = 0`** — `/chat` shows a CTA to `/wallet` instead of the form.
7. **`docs/mainnet-warning.md`** — documents the deposit procedure and testing workflow.

## 10. Testing strategy

- **Unit (Vitest)** — heavy coverage:
  - Branded type constructors (reject invalid input).
  - Zod schemas with valid/invalid fixtures.
  - Use cases with fake `RestApiClient` / `McpClient` adapters.
  - Error classifier (status + body → `RestError`).
  - SSE parser (stream of chunks → typed events).
  - Dexie repos with `fake-indexeddb` (filter by `agentId`, order by date).
- **Component (Vitest + Testing Library)** — medium coverage:
  - `<AgentSwitcher>` invalidates queries on change.
  - `<ResponsePanel>` tab rendering by response shape.
  - `<ChatView>` with mocked stream: chunks → incremental text → cost badge.
- **E2E (manual)** — `docs/manual-qa.md` checklist per release.
- **No tests hit real servers** in CI / regular runs.
- **Coverage targets**: ≥ 80% on `domain/` + `application/`; no target on `presentation/` / `infrastructure/`.
- **Pre-commit hook** (Husky + lint-staged): `tsc --noEmit`, `eslint` with `typescript-eslint/no-floating-promises`, `vitest related --run`.

## 11. Directory structure

```
llm4agents-dashboard/
├── README.md
├── vite.config.ts
├── tsconfig.json
├── tailwind.config.ts
├── components.json
├── .env.example
├── index.html
├── docs/
│   ├── manual-qa.md
│   ├── mainnet-warning.md
│   └── superpowers/specs/
├── src/
│   ├── main.tsx
│   ├── app.tsx
│   ├── domain/
│   │   ├── branded.ts
│   │   ├── result.ts
│   │   ├── errors.ts
│   │   ├── agent.ts
│   │   ├── chat.ts
│   │   ├── scraper.ts
│   │   └── transaction.ts
│   ├── application/
│   │   ├── registerAgent.ts
│   │   ├── executeChatCompletion.ts
│   │   ├── streamChatCompletion.ts
│   │   ├── callScraperTool.ts
│   │   ├── openSession.ts
│   │   ├── execSession.ts
│   │   ├── closeSession.ts
│   │   ├── sessionStatus.ts
│   │   ├── fetchBalance.ts
│   │   ├── fetchModels.ts
│   │   ├── listTransactions.ts
│   │   ├── generateWallet.ts
│   │   ├── healthCheck.ts
│   │   └── withHistory.ts
│   ├── infrastructure/
│   │   ├── schemas/               # one per OpenAPI response + one per MCP tool
│   │   ├── rest/
│   │   │   ├── RestApiClient.ts
│   │   │   └── classifyError.ts
│   │   ├── mcp/
│   │   │   ├── McpClient.ts
│   │   │   └── tools.ts
│   │   ├── stream/sseParser.ts
│   │   └── persistence/
│   │       ├── db.ts
│   │       ├── AgentRepo.ts
│   │       ├── HistoryRepo.ts
│   │       └── SessionRepo.ts
│   ├── presentation/
│   │   ├── layout/
│   │   ├── components/
│   │   ├── hooks/
│   │   └── routes/
│   └── composition/
│       └── root.ts
├── tests/
│   ├── domain/
│   ├── application/
│   ├── infrastructure/
│   └── fixtures/
└── package.json
```

## 12. Startup procedure

```bash
git clone <repo> && cd llm4agents-dashboard
npm install
npm run dev                       # http://skywalker:4201
```

Once-per-client-machine hosts entry:
```
<IP_of_skywalker>  skywalker
```

### First-use workflow

1. `npm run dev` → open `http://skywalker:4201`.
2. UI prompt: "Create your first agent" → `POST /api/v1/agents/register` → returns `apiKey`.
3. `apiKey` persisted in browser IndexedDB, scoped to that browser.
4. Navigate to `/wallet` → "Generate wallet" → `POST /api/v1/wallets/generate`.
5. (Offline) Deposit USDT/USDC to the returned address on Solana or Polygon.
6. Back to UI → manual refresh of `GET /api/v1/balance` until credit shows.
7. `/chat` unlocks with default model `gemini-2.5-flash-lite` → real testing begins.

### Scripts

- `npm run dev` — Vite dev server, port 4201, host exposed.
- `npm run build` / `npm run preview`.
- `npm test` / `npm run test:ci`.
- `npm run typecheck` — `tsc --noEmit`.
- `npm run lint` — `eslint` with `typescript-eslint`.

## 13. Risks and open questions

| # | Risk | Mitigation |
|---|---|---|
| 1 | CORS on upstream APIs | Vite dev-proxy eliminates CORS locally; no production host planned for v1 |
| 2 | API key leakage in shared browser | Per-browser isolation assumed; documented as personal-use tool |
| 3 | MCP SDK maturity for Streamable HTTP transport | Fall back to hand-rolled JSON-RPC client if the SDK doesn't support it cleanly |
| 4 | OpenAPI drift — upstream changes response shape | Zod `safeParse` will flag the mismatch; tests fixtures catch on CI |
| 5 | User selects expensive model by accident | Confirm dialog on model switch when price > default |
| 6 | Team member forgets to switch agent → charges wrong account | `<AgentSwitcher>` always visible in topbar, active agent highlighted in color |

## 14. Out of scope for v1 (future)

- Shared config server (Enfoque 2 — add a minimal Hono server if teams ask for shared collections).
- Central database (Enfoque 3).
- Playwright E2E suite.
- Real-time shared sessions (WebRTC or similar).
- Deployment to a hosted URL with auth.
- Import from Postman / OpenAPI "Try it" definitions.

## 15. Next step

Once this spec is approved, transition to the **superpowers:writing-plans** skill to produce the step-by-step implementation plan.
