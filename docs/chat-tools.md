# Chat tools — what's exposed, what isn't, and why

The playground's main goal is to **test as many API capabilities as possible from a single chat prompt.** The agentic chat loop can invoke MCP tools mid-conversation so that one natural-language message exercises search, scraping, or image generation without the user leaving the `/chat` route.

Source of truth in code: [`src/domain/chatTools.ts`](../src/domain/chatTools.ts) — one `ChatToolDef` per registered tool, with its OpenAI function schema, cost hint, and MCP name. **Anything not listed there is NOT callable from the chat.**

## At a glance

| Tool | Category | In chat? | Cost | Why or why not |
|---|---|:---:|---|---|
| `google_search` | search | ✅ | $0.0012 | Text in, text out, single-turn fit. |
| `google_news` | search | ✅ | $0.0012 | Same. |
| `google_maps` | search | ✅ | $0.0012 | Same. |
| `google_batch_search` | search | ❌ | $0.0012/query | Array of up to 100 queries — doesn't match a conversational prompt shape. Use `/search`. |
| `fetch_html` | scraper | ✅ | $0.0007 | Text out; fits the agentic loop. |
| `markdown` | scraper | ✅ | $0.0010 | Text out. |
| `links` | scraper | ✅ | $0.0007 | JSON list, small enough for context. |
| `extract` | scraper | ✅ | $0.0012 | Structured JSON output. |
| `screenshot` | scraper | ❌ | $0.0010 | Returns ~100–300 KB base64 PNG; flooding the chat context is wasteful and the text model can't interpret it visually. Use `/scraper/one-shot`. |
| `pdf` | scraper | ❌ | $0.0012 | Returns ~30 KB+ base64 PDF; text LLMs can't parse it. Use `/scraper/one-shot`. |
| `session_create` | session | ❌ | included | Stateful — requires a multi-step lifecycle (create / exec / close) that doesn't map to one chat turn. Use `/scraper/sessions`. |
| `session_exec` | session | ❌ | varies | Depends on a live `session_id` from a prior create call. |
| `session_status` | session | ❌ | — | Same lifecycle constraint. |
| `session_close` | session | ❌ | — | Same. |
| `generate_image` | image | ✅ | $0.01–$0.02 | Short-circuited: PNG renders inline in the tool card. |
| `edit_image` | image | ✅ | $0.02 | Short-circuited; same render path. |
| `analyze_image` | image | ✅ | $0.006 | Text answer; short-circuited. |

**Registered in chat: 10.** Not registered: 7 (sessions × 4, `screenshot`, `pdf`, `google_batch_search`).

## Tools available in the chat

### Search (3)

The model can invoke these when the user asks about current events, facts, or anything time-sensitive.

- `google_search` — organic web results. Best for general "what is / when was" questions.
- `google_news` — recent articles. The model often combines this with `tbs=qdr:d` for "today".
- `google_maps` — places, addresses, lat/lng, rating, phone, website. Triggered for "find X near Y" queries.

All three accept `q`, `gl` (country), `hl` (language), `tbs` (time filter), `page`, `location`.

### Scraper — text-returning (4)

The model can read specific web pages and return structured data.

- `fetch_html` — raw HTML. Use when the user asks for literal markup (e.g. `"what tag has the main heading on X"`).
- `markdown` — readable text. Best default for "summarize this article".
- `links` — all links on the page. Useful for "list the links on X".
- `extract` — CSS-selector-based scraping. The model crafts the `selectors` object from the user's request.

Each takes a `url` and optional `proxy_tier` (`none` / `datacenter` / `residential`). The model usually leaves `proxy_tier` at `none` unless the user hints at blocking (`"use a residential proxy"`).

### Image (3)

All short-circuit after success — the image or text answer IS the response, no synthesis chat.completion runs.

- `generate_image` — text-to-PNG. Parameters: `prompt` (required), `width`, `height` (512–2048, default 1024).
- `edit_image` — modify an existing image by instruction. Parameters: `prompt`, `image` (URL or data URI), `aspect_ratio` (enum).
- `analyze_image` — vision / OCR / caption. Parameters: `prompt`, `image`. Returns plain text that surfaces as the assistant's final answer.

## Tools deliberately NOT in the chat

### Stateful sessions (4 tools)

`/scraper/sessions` exposes `session_create`, `session_exec`, `session_status`, `session_close`. They need a lifecycle:

```
create  → returns session_id
exec    → N calls with that session_id (goto, click, fill, extract...)
close   → release the browser
```

A chat turn is one-and-done. There is no way to keep a session "open" for the next message without breaking the one-tool-per-turn cost guard and introducing persisted session state across turns. The tradeoff isn't worth the use case, since the `/scraper/sessions` UI is already designed for this pattern.

If you ever want to wire this into chat, the design changes required are substantial:
- Persist session IDs across turns (Zustand + cleanup).
- Relax the cost guard to allow chained `session_exec` in one run, with a different cap (e.g. 5 session steps per turn).
- A disambiguation mechanism when the user has multiple sessions open.

### Binary content (`screenshot`, `pdf`)

Both return base64 payloads 30–300 KB. Feeding that into the chat context as a tool result:

- Costs significant tokens — the next chat completion reads the whole blob as input.
- The model can't use it. Text LLMs can't decode PNGs (use `analyze_image` if you need vision on a capture) and can't read PDFs.

Practical path: ask `markdown` for page text, or take the screenshot from `/scraper/one-shot` yourself.

### `google_batch_search`

Input is an array of up to 100 `{q, gl, hl, …}` objects. Valid use case (parallel comparative queries) but not conversational — a single prompt rarely translates to "run these 100 queries in parallel". `/search` has a dedicated batch tab for this.

### REST endpoints (not MCP tools)

The following REST endpoints are **intentionally** not registered as chat tools:

- `POST /v1/tx/send` — moves real money on Polygon. Needs explicit user intent (a click in `/tx`), never an autonomous model call. Adding this would require a confirmation dialog, a per-tx value cap, and a different cost-guard category.
- `POST /api/v1/wallets/generate` — creates deposit addresses. Local per-agent state; the user initiates from `/wallet`.
- `GET /api/v1/balance` / `/models` / `/transactions` — read-only informational endpoints. Having the model ask the user's own API for their balance mid-turn adds cost with no UX gain over a direct look at the topbar / sidebar routes.

## Cost protections wired around chat tools

Three guards prevent runaway charges when a model loops:

1. **One tool call per turn.** After the first successful tool call in a run, any second `tool_call` aborts the run (see `runAgenticChat.ts` → cost guard 0).
2. **Same-args dedup.** Identical re-calls (same tool + same arguments, success or failure) return the cached result without hitting MCP again.
3. **Image short-circuit.** After a successful image tool call, the run ends immediately; no synthesis chat.completion is fired. The image or text answer is already displayed in the tool card.

Defaults: `maxIterations = 3`, hard cap of 3 real MCP calls per run.

## Adding a new tool to the chat — checklist

1. Confirm the tool returns **text-sized output** (< 10 KB serialized).
2. The tool's output should **stand alone as an answer** (no need for heavy post-processing).
3. Add a `ChatToolDef` in `src/domain/chatTools.ts`:
   - `mcpName`
   - `category` — reuse `search` / `scraper` / `image` or add a new one
   - `costPerCall` label for the ToolsViewer
   - OpenAI function schema **matching the MCP's `tools/list` schema exactly** (parameter names, types, enums)
4. Update the fuzzy matcher in `findChatTool()` if the tool has common aliases the model might invent.
5. If the tool is terminal (its output IS the final answer, like the image category), add the category to the short-circuit path in `runAgenticChat.ts`.
6. Add a Zod parameter schema in `src/infrastructure/schemas/mcp.ts` → `TOOL_PARAM_SCHEMAS` so boundary validation catches bad calls.
7. Add the tool to the correct group in `src/presentation/components/ToolsViewer.tsx` so the "View tools" popover stays accurate.
8. If the MCP response has an unusual shape (nested JSON, snake_case), extend `normalizeMcpResult` in `src/infrastructure/mcp/McpClient.ts` and add a test in `tests/infrastructure/mcp-normalize.test.ts`.
