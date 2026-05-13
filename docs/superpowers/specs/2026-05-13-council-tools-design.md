# Council with Research Tools — Design

**Date:** 2026-05-13
**Status:** Approved (brainstorming)
**Depends on:** existing Council feature, existing agentic chat tool loop (`runAgenticChat`)

---

## Summary

Give Council drafters (and optionally the debate stage) access to three MCP research tools — `google_search`, `google_news`, `fetch_html` — so they can ground their drafts and critiques in fresh facts instead of model memory. The tools are gated by a per-plan configuration analogous to `debateRounds`, with safe defaults and a UI that mirrors the existing rounds slider.

Out of scope: image tools, scraper tools beyond `fetch_html`, tools for the chairman, generic tool selection beyond the three named.

## Motivation

Drafters today answer from their training data only. For tasks involving current events, prices, recent news, or any time-sensitive fact, every drafter risks hallucinating or producing stale answers. The existing agentic chat already solves this for single-model conversations; Council should inherit the same capability where it adds value (drafts) and skip it where it doesn't (chairman synthesis already has all the material it needs).

## Decisions (approved during brainstorming)

| Decision | Choice |
|---|---|
| Where can tools be used? | Stages configurable per plan (option D from brainstorm). Default: lite=none, pro=drafts, power=drafts+debate. |
| Config shape | Single struct `{ stages, maxCallsPerDrafter }`. The three tools are always available together when tools are enabled. No per-tool toggles. |
| Stream visibility | Hybrid: live counter ("🔎 2 search · 1 fetch") plus on-demand expandable panel reusing `ToolStep` patterns. |
| Tool failure policy | Individual tool failure is non-fatal; the drafter continues without that result. Drafter failure (timeout, sdk_error) still ends the drafter via `*_failed`. |
| Threshold change | `COUNCIL_EXPENSIVE_THRESHOLD_CENTS` stays at 50¢. Tool calls add ~3-5¢ in `power` worst-case. |
| Integration strategy | Existing `ChatPort` stays untouched for stages without tools. A new `runDrafterTurnWithTools` wraps `sdk.chat.conversation()` for stages with tools. `onToolCall` callback gates tool whitelist + per-drafter call cap. |

## Domain Layer (`src/domain/`)

### `council.ts`

Add stage and tools config types:

```ts
export type CouncilStage = 'drafts' | 'debate'

export type CouncilToolsConfig = Readonly<{
  stages: ReadonlyArray<CouncilStage>
  maxCallsPerDrafter: number
}>
```

Extend `CouncilConfig`:

```ts
export type CouncilConfig = Readonly<{
  drafters: ReadonlyArray<Model>
  chairman: Model
  debateRounds: number
  tools: CouncilToolsConfig    // new
}>
```

Add constants:

```ts
export const COUNCIL_TOOL_NAMES = ['google_search', 'google_news', 'fetch_html'] as const
export type CouncilToolName = (typeof COUNCIL_TOOL_NAMES)[number]
export const MIN_TOOL_CALLS_PER_DRAFTER = 0 as const
export const MAX_TOOL_CALLS_PER_DRAFTER = 5 as const
```

Update `COUNCIL_PLANS` with per-plan defaults:

| Plan | `tools.stages` | `tools.maxCallsPerDrafter` |
|---|---|---|
| lite | `[]` | `0` |
| pro | `['drafts']` | `3` |
| power | `['drafts','debate']` | `3` |

Extend `estimateCouncilCostCents` to add a tools term:

```ts
const draftsMultiplier = config.tools.stages.includes('drafts') ? 1 : 0
const debateMultiplier = config.tools.stages.includes('debate') ? config.debateRounds : 0
const totalToolCalls = config.drafters.length * config.tools.maxCallsPerDrafter
  * (draftsMultiplier + debateMultiplier)
const toolsCostCents = Math.round(totalToolCalls * 0.12)  // ~$0.0012 per call
```

Add to the existing `draftAndDebateCost + synthesisCost` sum.

### `councilEvents.ts`

Add four new event variants to the `CouncilEvent` discriminated union:

```ts
| Readonly<{
    kind: 'draft_tool_call'
    slot: DrafterSlot
    callId: string
    toolName: CouncilToolName
    args: unknown
  }>
| Readonly<{
    kind: 'draft_tool_result'
    slot: DrafterSlot
    callId: string
    ok: boolean
    summary: string
  }>
| Readonly<{
    kind: 'debate_tool_call'
    round: number
    slot: DrafterSlot
    callId: string
    toolName: CouncilToolName
    args: unknown
  }>
| Readonly<{
    kind: 'debate_tool_result'
    round: number
    slot: DrafterSlot
    callId: string
    ok: boolean
    summary: string
  }>
```

`callId` correlates each `*_tool_call` with its later `*_tool_result`.

### `i18n.ts`

Add seven keys in both EN and ES:

```
council.toolsLabel              "Tools (research)"            / "Tools (investigación)"
council.toolsStagesLabel        "Enable on"                   / "Habilitar en"
council.toolsStageDrafts        "Drafts"                      / "Drafts"
council.toolsStageDebate        "Debate"                      / "Debate"
council.toolsMaxCallsLabel      "Max calls per drafter"       / "Llamadas máx por agente"
council.toolsAvailable          "Available: google_search, google_news, fetch_html"
                                / "Disponibles: google_search, google_news, fetch_html"
council.toolsNoStages           "No stages enabled"           / "Sin etapas habilitadas"
council.toolsCounter            "{search} search · {news} news · {fetch} fetch"
```

## Application Layer (`src/application/`)

### `runCouncilTurn.ts` (new file)

Single exported async generator that executes one drafter turn with tools, wrapping `sdk.chat.conversation()`:

```ts
export type DrafterTurnEvent =
  | { kind: 'delta'; text: string }
  | { kind: 'tool_call'; callId: string; toolName: CouncilToolName; args: unknown }
  | { kind: 'tool_result'; callId: string; ok: boolean; summary: string }

export type RunDrafterTurnDeps = Readonly<{
  key: ApiKey
  sdkConfig?: SdkConfig
}>

export type RunDrafterTurnParams = Readonly<{
  model: Model
  systemPrompt: string
  history: ReadonlyArray<ChatMessage>
  userMessage: string
  allowedTools: ReadonlyArray<CouncilToolName>
  maxToolCalls: number
  signal?: AbortSignal
}>

export async function* runDrafterTurnWithTools(
  deps: RunDrafterTurnDeps,
  params: RunDrafterTurnParams,
): AsyncGenerator<DrafterTurnEvent, { content: string; costCents: number }, void>
```

Internals:

- Build SDK conversation options analogous to `runAgenticChat`, with:
  - `tools: sdk.tools` (the full SDK catalog; we filter via `onToolCall`)
  - `enablePromptToolFallback: true`
  - `maxToolRounds: Math.max(1, params.maxToolCalls)`
  - `onRoundMeta` accumulates cost like `runAgenticChat` does
  - `onToolCall(name, args) => boolean` enforces:
    - `allowedTools` whitelist (reject if name not in `COUNCIL_TOOL_NAMES`)
    - Per-turn cap (reject after `callsUsed >= maxToolCalls`)
- For each yielded SDK event:
  - `text` → yield `delta`
  - `tool_start` → assign a `callId` (monotonic per turn), yield `tool_call`
  - `tool_end` → yield `tool_result` with `ok` derived from `result.isError`, `summary` derived from first content item (text truncated to 120 chars; image/resource → mime label)
- On `done`, return `{ content, costCents }`
- Errors: `LLM4AgentsError` with `tool_loop_limit` is non-fatal (loop just ends). Other SDK errors propagate via `translateSdkError`, same as `runAgenticChat`.

### `runCouncilChat.ts` (modify)

For each draft and each debate-round drafter call, branch by `config.tools.stages`:

- If stage is **not** in `config.tools.stages`: keep today's path exactly — `streamOne(chat, { model, messages, signal }, onDelta)`.
- If stage **is** in `config.tools.stages`: use a new internal helper inside `runCouncilChat.ts` (local function, not exported, analogous to today's `streamOne`) that:
  - Calls `runDrafterTurnWithTools` with the appropriate `systemPrompt` and `history` (built from `buildDrafterMessagesWithTools` / `buildDebateMessagesWithTools`)
  - Pushes deltas into the same delta queue used today, plus a parallel queue for tool events
  - The outer drainer yields `*_tool_call` / `*_tool_result` from the tool queue, interleaved with the existing `*_delta` events from the delta queue

The drainer's pattern stays the same: each parallel drafter pushes events; the outer loop drains them in arrival order between awaits.

Tool failure path: when `tool_result.ok === false`, the SDK lets the model continue with the failure noted in its context. No special handling needed at the council level — the drafter either recovers or runs out of cap and produces its best text answer.

Drafter total failure: unchanged. If `runDrafterTurnWithTools` throws (network, timeout, SDK error), the `try/catch` in the draft / debate loops emits `draft_failed` / `debate_failed` exactly like today.

### `buildCouncilPrompts.ts` (modify)

Add two new functions; the existing `buildDrafterMessages` and `buildDebateMessages` are not modified (regression safety):

```ts
buildDrafterMessagesWithTools(userTask, allowedTools: readonly CouncilToolName[], maxCalls: number)
buildDebateMessagesWithTools(args, allowedTools, maxCalls)
```

Each appends a tool instructions block to the existing system prompt:

```
You have access to these tools to research the question:
- google_search: Google web search for facts, dates, prices
- google_news: recent news
- fetch_html: full HTML of a URL when you need raw content

USE TOOLS WHEN:
- The task mentions current events, dates, prices, or anything time-sensitive
- You need to verify a specific URL or quote
- You'd otherwise hallucinate facts

DO NOT use tools when the task is purely opinion, analysis, or code that doesn't need fresh data.

Budget: max {N} tool calls. Each one costs money. Prefer one good query over several.
```

`{N}` is interpolated from `maxCalls`. The list of tools is constructed from `allowedTools` so future changes to `COUNCIL_TOOL_NAMES` propagate automatically.

## Infrastructure Layer (`src/infrastructure/`)

No new adapters. No changes to `RestApiClient`, `McpClient`, Zod schemas, or Dexie.

The new helper consumes `createSdkClient()` and `sdk.chat.conversation()` directly, identically to how `runAgenticChat` already does.

## Presentation Layer (`src/presentation/`)

### `hooks/useCouncilStore.ts` (modify)

Extend `DrafterTurnRecord` (or equivalent per-slot entries inside `CouncilSnapshot`):

```ts
type ToolCallRecord = Readonly<{
  callId: string
  toolName: CouncilToolName
  args: unknown
  result: { ok: boolean; summary: string } | null   // null while in flight
}>

type DrafterTurnRecord = Readonly<{
  slot: DrafterSlot
  stage: 'drafts' | 'debate'
  round: number | null
  toolCalls: ReadonlyArray<ToolCallRecord>          // new
  content: string
  costCents: number
  durationMs: number
}>
```

Backwards compatibility: when hydrating a legacy snapshot without `toolCalls`, default to `[]`. This is a soft migration — no version bump needed unless the existing store already versions schema.

### `hooks/useCouncilStream.ts` (modify)

Add four cases to the event reducer:

- `draft_tool_call` → push `{ callId, toolName, args, result: null }` into the current drafter's `toolCalls`
- `draft_tool_result` → find by `callId`, set `result`
- `debate_tool_call` / `debate_tool_result` → same, but into the current round's per-slot record

Everything else (start, abort, deleteRun, clearAll) stays untouched.

### `components/council/CouncilSetup.tsx` (modify)

Insert a new section between the rounds slider and the chairman picker:

- Section label: `t('council.toolsLabel')`
- Stage checkboxes: `[ ] Drafts  [ ] Debate` bound to `config.tools.stages`
- Slider: 0–5, bound to `config.tools.maxCallsPerDrafter`
- Static line: `t('council.toolsAvailable')` (the three tool names)
- Inline validation: if `maxCallsPerDrafter > 0 && stages.length === 0`, show `t('council.toolsNoStages')`

When a plan is selected, the tools section syncs to the preset's defaults, same way `debateRounds` already does.

### `components/council/CouncilStream.tsx` (modify)

Each drafter card and each debate-round card now shows, beneath the title:

- Live counter chip: `t('council.toolsCounter', { search, news, fetch })`, computed from the `toolCalls` array of that turn. Hidden when count is zero.
- Click on the chip toggles an inline expandable panel below the card title, listing each tool call.

The panel renders one row per `ToolCallRecord`:

- Icon: 🔎 for `google_search`/`google_news`, 📄 for `fetch_html`
- Arg preview: the first argument value truncated to 60 chars (e.g. the search `q` or the `url`)
- Duration or size: derived from the result summary
- Status: ✓ for `ok`, ✗ for failure

### `components/council/CouncilHistory.tsx` (modify)

Each item in the history list shows the run's total tool count as a small chip before the cost:

```
🪶 Hoy 14:32  "task..."  🔎 3   $0.0124
```

Hidden when count is zero (legacy runs and tools-disabled runs).

### `components/council/CouncilToolPanel.tsx` (new file)

Small component that renders the expandable panel of tool calls described above. Reusable from `CouncilStream` and from `CouncilHistory` when viewing a past run. Receives the `ReadonlyArray<ToolCallRecord>` as prop.

## Tests

### Domain (`tests/domain/`)

- `council.test.ts`: extend with
  - `estimateCouncilCostCents` baseline (stages=[]) equals the existing computed value (regression).
  - Cost increases when stages=['drafts'] proportionally to `drafters × maxCalls × 0.12`.
  - Cost in `power` defaults (`stages=['drafts','debate']`, `maxCalls=3`, `debateRounds=4`) adds ~4-5¢.
  - `COUNCIL_PLANS[plan].tools` defaults match the table above for all three plans.
- `council-tools.test.ts` (new): `COUNCIL_TOOL_NAMES` equals `['google_search','google_news','fetch_html']` exactly.

### Application (`tests/application/`)

- `runCouncilTurn.test.ts` (new):
  - Yields `delta` → `tool_call` → `tool_result` → `delta` → returns `{ content, costCents }`.
  - `onToolCall` rejects a tool outside whitelist (mock attempts `generate_image`; no `tool_call` event yielded).
  - `onToolCall` rejects after `maxCalls` exceeded (4th call with cap=3 returns false).
  - Tool individual failure: mock emits `tool_end` with `isError: true`; helper yields `tool_result { ok: false }` and the turn continues with the next delta.
  - Upstream abort propagates through the SDK signal.
- `runCouncilChat.test.ts`: extend with
  - `tools.stages=[]` does NOT invoke `runDrafterTurnWithTools` (verify by spying that `chat.completionStream` is still called for drafts).
  - `tools.stages=['drafts']` invokes `runDrafterTurnWithTools` in drafts but `chat.completionStream` in debate.
  - Event order: `draft_tool_call` always precedes its matching `draft_tool_result` (by `callId`).
  - Tool failure does not abort the run; final answer is produced.
- `buildCouncilPrompts.test.ts`: extend with
  - `buildDrafterMessagesWithTools` includes the three tool names and the budget number in the system prompt.
  - Original `buildDrafterMessages` does not contain the substring "google_search" (regression).

### Presentation (`tests/presentation/`)

- `council-store.test.ts`: extend with
  - New snapshot with `toolCalls: []` round-trips through `JSON.stringify`/parse identically.
  - Legacy snapshot without `toolCalls` field hydrates to `toolCalls: []`.
  - Snapshot with populated `toolCalls` preserves `callId`, `toolName`, `args`, `result` exactly.

### Coverage target

The configured threshold (80% lines / 75% branches across `domain`, `application`, `infrastructure`) must not regress. New files must meet the same bar.

### Manual verification (end-to-end)

Local dashboard on `:4310` after restart of the systemd service:

1. Plan `lite` → no tool counters appear; run completes as before.
2. Plan `pro` → each drafter card shows `🔎 N tools`; expanding shows tool calls.
3. Plan `power` → tools active in drafts and in debate; counter accumulates across rounds.
4. Estimated vs. billed cost diff is ≤ 1.5× (billed sampled via `balanceBefore - balanceAfter`).
5. Reload the page → legacy runs render without breakage; new runs preserve tool calls in `CouncilHistory`.
6. Abort during a tool call → run terminates cleanly with no orphan UI state.

## File Inventory

### Files to create

| Path | Purpose |
|---|---|
| `src/application/runCouncilTurn.ts` | `runDrafterTurnWithTools()` + `DrafterTurnEvent` |
| `tests/application/runCouncilTurn.test.ts` | New helper test suite |
| `tests/domain/council-tools.test.ts` | `COUNCIL_TOOL_NAMES` constant test |
| `src/presentation/components/council/CouncilToolPanel.tsx` | Expandable tool-call panel |

### Files to modify

| Path | Change |
|---|---|
| `src/domain/council.ts` | Add `CouncilToolsConfig`, extend `CouncilConfig`, add constants, extend plans, extend cost estimate |
| `src/domain/councilEvents.ts` | Add four new event variants |
| `src/domain/i18n.ts` | Add seven new keys × EN+ES |
| `src/application/buildCouncilPrompts.ts` | Add two `*WithTools` variants |
| `src/application/runCouncilChat.ts` | Branch per stage; drain tool events |
| `src/presentation/hooks/useCouncilStore.ts` | Extend record with `toolCalls`; legacy default |
| `src/presentation/hooks/useCouncilStream.ts` | Reducer cases for the four new events |
| `src/presentation/components/council/CouncilSetup.tsx` | Tools section UI |
| `src/presentation/components/council/CouncilStream.tsx` | Counter chip + integration of `CouncilToolPanel` |
| `src/presentation/components/council/CouncilHistory.tsx` | Tool count chip per run |
| `tests/domain/council.test.ts` | Cost estimate + defaults |
| `tests/application/runCouncilChat.test.ts` | Four new cases |
| `tests/application/buildCouncilPrompts.test.ts` | With-tools variants |
| `tests/presentation/council-store.test.ts` | Migration + roundtrip |

### Files NOT touched (asserted)

- `src/infrastructure/**` — unchanged
- `src/composition/**` — unchanged
- `src/domain/chatTools.ts`, `result.ts`, `errors.ts`, `branded.ts` — unchanged
- Any route or component outside `components/council/` — unchanged

## Implementation Order

Each step leaves typecheck/tests green before the next:

1. Domain (`council.ts` + `councilEvents.ts` + `i18n.ts`) + their tests.
2. Application — prompts (`buildCouncilPrompts.ts`) + tests.
3. Application — new helper (`runCouncilTurn.ts`) + tests in isolation.
4. Application — integration (`runCouncilChat.ts` per-stage branch) + extended tests.
5. Presentation — state (`useCouncilStore.ts` + `useCouncilStream.ts`) + store tests.
6. Presentation — Setup UI (`CouncilSetup.tsx`) + visual verification.
7. Presentation — Stream UI (`CouncilToolPanel.tsx` + `CouncilStream.tsx` + `CouncilHistory.tsx`) + visual verification.
8. Final: typecheck + lint + `test:ci` + manual verification (six points above) + `npm run build` + `systemctl --user restart llm4agents-dashboard.service`.

## Risks

| Risk | Mitigation |
|---|---|
| Tool calls slow down runs noticeably | `maxToolRounds` cap in SDK + our `onToolCall` counter cap. Defaults conservative (3). |
| Models ignore native tool calls | SDK already has prompt-mode fallback (`enablePromptToolFallback: true`), same as agentic chat. |
| Runaway cost | Per-drafter cap, council threshold ($0.50) unchanged, pre-run estimate visible to user. |
| Legacy snapshot breakage | Default `toolCalls: []` on hydration + explicit migration test. |
| Model spam-calls a blocked tool | `onToolCall` returns `false` repeatedly; SDK terminates the round; `maxToolRounds` caps total iterations. |

## Size estimate

~400–500 new lines including tests. Largest chunks: `runCouncilTurn.ts` (~150), the three council components (~100 combined). Twelve new test cases. Low risk: infrastructure untouched, persistence untouched, all routes outside `/council` untouched, the no-tools path is byte-identical to today (regression-covered by existing tests).
