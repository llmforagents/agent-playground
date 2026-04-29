# Reasoning / Chain-of-Thought Support — Design

**Date:** 2026-04-29
**Status:** Approved (brainstorming)
**Depends on:** chat persistence (already merged), one-tool-per-turn fix (already merged)

## Goal

Allow the playground to send `reasoning` / `include_reasoning` to the backend for models that support it, capture the reasoning text the model returns (both streaming and non-streaming), render it as a collapsible block above the assistant content, persist it in the chat store, and surface reasoning-only token counts in the `CostBadge`.

## Non-goals

- Editing the model's reasoning (it's output, not input).
- Markdown rendering of reasoning text (plain monospace is enough — it's debug-style content).
- Cancel-mid-thinking (the existing Stop button cancels the whole stream — same path).
- Automatic conversion of effort between families (the mapping is fixed per family).
- Dynamic model-capability discovery from the API (hardcoded prefix list, updated manually).

## Decisions reached during brainstorming

| Decision | Choice | Rationale |
|---|---|---|
| Model detection | Hardcoded prefix list with family enum | Mirrors existing `NATIVE_TOOL_PREFIXES` pattern. Maintainable. UX clear. |
| Effort selector shape | Unified `Off / Low / Medium / High` | Single mental model. Client translates per family. |
| Block position | Above the content | Reflects the temporal order of the stream (think first, answer second). Avoids visual jump. |
| Default expansion | Expanded during stream → collapsed when done | "Live thinking" visible without abrumar el historial. Per-entry toggle by user click. |
| Effort persistence on model switch | Persists as-is | Aligns with `model`/`toolsOn` storage pattern. No re-selection friction. |

---

## Architecture

### New domain module: `src/domain/reasoning.ts`

Pure types + functions, no dependencies. Lives alongside `chatTools.ts`.

```ts
export type Effort = 'off' | 'low' | 'medium' | 'high'

export type ReasoningFamily = 'enum_effort' | 'boolean_toggle' | 'token_budget'

export const REASONING_PREFIXES: ReadonlyArray<{
  readonly prefix: string
  readonly family: ReasoningFamily
}> = [
  { prefix: 'anthropic/claude-sonnet-4',         family: 'enum_effort' },
  { prefix: 'anthropic/claude-opus-4',           family: 'enum_effort' },
  { prefix: 'openai/o1',                         family: 'enum_effort' },
  { prefix: 'openai/o3',                         family: 'enum_effort' },
  { prefix: 'openai/o4',                         family: 'enum_effort' },
  { prefix: 'deepseek/deepseek-r1',              family: 'boolean_toggle' },
  { prefix: 'qwen/qwq',                          family: 'boolean_toggle' },
  { prefix: 'google/gemini-2.5-flash-thinking',  family: 'token_budget' },
  { prefix: 'google/gemini-2.5-pro-thinking',    family: 'token_budget' },
]

const TOKEN_BUDGET_BY_LEVEL: Readonly<Record<Exclude<Effort, 'off'>, number>> = {
  low:    500,
  medium: 2000,
  high:   8000,
}

export function detectReasoningFamily(modelSlug: string): ReasoningFamily | undefined {
  const s = modelSlug.toLowerCase()
  return REASONING_PREFIXES.find((entry) => s.startsWith(entry.prefix))?.family
}

export function buildReasoningPayload(model: string, effort: Effort): Record<string, unknown> {
  if (effort === 'off') return {}
  const family = detectReasoningFamily(model)
  if (family === undefined) return {}
  switch (family) {
    case 'enum_effort':    return { reasoning: { effort } }
    case 'boolean_toggle': return { include_reasoning: true }
    case 'token_budget':   return { reasoning: { max_tokens: TOKEN_BUDGET_BY_LEVEL[effort] } }
  }
}
```

### Schema changes (`src/infrastructure/schemas/rest.ts`)

**Request — `ChatCompletionRequestSchema`:** add explicit fields so TypeScript callers can pass them with type safety.

```ts
export const ChatCompletionRequestSchema = z.object({
  model: z.string().min(1),
  messages: z.array(ChatMessageSchema).min(1),
  temperature: z.number().min(0).max(2).optional(),
  max_tokens: z.number().int().positive().optional(),
  stream: z.boolean().optional(),
  tools: z.array(ToolDefSchema).optional(),
  tool_choice: ...,
  reasoning: z.object({
    effort: z.enum(['low', 'medium', 'high']).optional(),
    max_tokens: z.number().int().positive().optional(),
  }).optional(),
  include_reasoning: z.boolean().optional(),
})
```

**Response — `ChatMessageSchema`:** already `.loose()` so `reasoning` is preserved at runtime; add the explicit field for type safety.

```ts
export const ChatMessageSchema = z.object({
  role: z.enum(['system', 'user', 'assistant', 'tool']),
  content: z.string().nullable().optional(),
  reasoning: z.string().nullable().optional(),   // NEW
  name: z.string().optional(),
  tool_calls: z.array(ToolCallSchema).optional(),
  tool_call_id: z.string().optional(),
}).loose()
```

**Usage — extract `reasoning_tokens`:** OpenRouter returns `usage.completion_tokens_details.reasoning_tokens` when applicable. Capture in non-stream response and surface via `ChatResponseMeta`.

### Port changes (`src/application/ports.ts`)

```ts
export type ChatResponseMeta = Readonly<{
  costCents?: number
  tokensInput?: number
  tokensOutput?: number
  reasoningTokens?: number   // NEW — included inside tokensOutput, surfaced separately for UI
  balanceRemainingCents?: number
  requestId?: string
}>

export type ChatStreamChunk =
  | { kind: 'delta'; text: string }
  | { kind: 'reasoning_delta'; text: string }   // NEW
  | { kind: 'done'; meta: ChatResponseMeta; fullText: string; fullReasoning?: string }   // EXTENDED
```

### Domain types (`src/domain/chat.ts`)

```ts
export type ConversationEntry =
  | { readonly kind: 'msg';     readonly role: ChatMessage['role']; readonly content: string; readonly reasoning?: string }   // NEW field
  | { readonly kind: 'agentic'; readonly steps: readonly AgenticStep[]; readonly finalText: string; readonly finalReasoning?: string }   // NEW field

export type AgenticStep =
  | { readonly kind: 'assistant_text'; readonly text: string; readonly reasoning?: string }   // EXTENDED
  | { readonly kind: 'mode_fallback'; ... }
  | { readonly kind: 'tool'; ... }
```

The optional `reasoning` field is backward-compatible — existing persisted entries without it remain valid.

### Persistence (`src/presentation/hooks/useChatStore.ts`)

Add `effort` to the per-agent bucket. Default `'off'` (no reasoning sent). Backward-compatible: existing buckets without `effort` fall back to default via spread merge.

```ts
export type ChatPersisted = Readonly<{
  entries: readonly ConversationEntry[]
  model: string
  toolsOn: boolean
  effort: Effort   // NEW
}>

export const DEFAULT_CHAT: ChatPersisted = {
  entries: [],
  model: DEFAULT_MODEL,
  toolsOn: true,
  effort: 'off',   // NEW
}
```

The `?? DEFAULT_CHAT` fallback in consumer code already handles missing fields via the spread (`{ ...DEFAULT_CHAT, ...(stored ?? {}) }` pattern). Verify this in the chat-store tests.

### Transport changes (`src/infrastructure/rest/RestApiClient.ts`)

**`chatCompletion` (non-stream):**
- Merge `buildReasoningPayload(req.model, effort)` into the JSON body before `fetch`.
- After successful parse, extract `usage.completion_tokens_details?.reasoning_tokens` (treat as `0` if absent) and put in `meta.reasoningTokens`.

**`chatCompletionStream`:**
- Merge `buildReasoningPayload(...)` same way.
- In the SSE loop, parse `chunk.choices?.[0]?.delta?.reasoning` separately from `delta.content`.
- Accumulate `fullReasoning` in parallel with `full` (content).
- Yield `{ kind: 'reasoning_delta', text }` whenever `delta.reasoning` arrives.
- On `[DONE]`, yield `{ kind: 'done', meta: ..., fullText: full, fullReasoning }`.

The `effort` parameter must reach `RestApiClient`. Two options:
- **(a)** Add `effort: Effort` to `RunAgenticParams` and to `streamChatCompletion(...)` signatures, threading through.
- **(b)** Embed `reasoning`/`include_reasoning` into `ChatCompletionRequest` at the use-case boundary, so `RestApiClient` doesn't need to know about effort at all.

**Choice: (b).** The `Chat.tsx` route calls `buildReasoningPayload(model, effort)` and merges into the `ChatCompletionRequest` it builds before calling the use case. `RestApiClient` stays decoupled from `Effort`. Cleaner layering.

### Agentic loop (`src/application/runAgenticChat.ts`)

When the assistant message has `reasoning`, attach it to the `'assistant_text'` step or emit a new event. Choosing the simpler path: attach to the existing `'assistant_text'` event.

```ts
type IterationStep = ... | {
  readonly kind: 'final';
  readonly text: string;
  readonly reasoning?: string   // NEW
}
```

Inside `runIteration`, after extracting `assistantText`:

```ts
const assistantReasoning = msg.reasoning ?? undefined
// existing tool_calls / final logic ...
if (mode === 'native' && toolCalls.length > 0) {
  // Reasoning belongs to the iteration, even though the next step is a tool call.
  // Emit it as an assistant_text event before the tool_call event.
  // (See useAgenticChat.ts handling.)
}
```

The generator emits `{ kind: 'assistant_text', text: assistantText, reasoning: assistantReasoning }` whenever the model produced reasoning, even if the same iteration also produced a tool call. Order: `thinking → assistant_text(with reasoning) → tool_call`.

### UI components

**New: `src/presentation/components/ReasoningBlock.tsx`**

```tsx
type Props = {
  reasoning: string
  isStreaming: boolean
  defaultExpanded?: boolean
}

function ReasoningBlock({ reasoning, isStreaming, defaultExpanded }: Props) {
  // expanded = isStreaming OR defaultExpanded OR user toggled
  // collapsed when isStreaming flips false (via useEffect)
  // shows duration in seconds while streaming (timer ref)
  // monospace font, muted background, scrollable overflow
}
```

Layout:

```
┌─ 💭 Razonamiento (3.2s) ▼ ──────────┐
│ Plain monospace text, scrollable     │
│ if very long. No markdown.           │
└──────────────────────────────────────┘
```

**New: `src/presentation/components/EffortSelector.tsx`**

Dropdown with 4 options. Hidden if `detectReasoningFamily(model) === undefined`. Shows the current effort and family-specific tooltip:

```
Off  - Reasoning disabled
Low  - Quick thinking
Medium - Balanced (default suggested)
High - Deep reasoning
```

For `boolean_toggle` family (DeepSeek/Qwen), the tooltip clarifies that levels collapse to on/off in this family.

**Integration in `Chat.tsx`:**

- Topbar: `<EffortSelector model={model} value={effort} onChange={setEffort} />` next to the Tools toggle.
- `Bubble role='assistant'`: render `<ReasoningBlock>` above content if `entry.reasoning` exists.
- `AgenticBlock`: for each `step.kind === 'assistant_text'` with `step.reasoning`, render `<ReasoningBlock>` before the step's text.
- During stream: `useChatStream` exposes `partialReasoning` along with `partial`. The streaming bubble renders both.
- During agentic stream: `useAgenticChat` accumulates the in-flight step's reasoning into the running state.

### Cost badge (`src/presentation/components/CostBadge.tsx`)

```
$0.012 · 245 in / 1850 out (💭 1200)
```

The `(💭 1200)` is shown only when `meta.reasoningTokens > 0`. Tooltip: "Reasoning tokens (included in completion_tokens, billed at the model's output price)."

### i18n keys (EN + ES)

```ts
'chat.reasoning.label': '💭 Razonamiento',
'chat.reasoning.elapsed': '({sec}s)',
'chat.reasoning.empty': '(sin razonamiento)',
'chat.reasoning.thinking': 'Pensando…',
'chat.reasoning.notSupported': 'Este modelo no soporta razonamiento',
'chat.effort.label': 'Effort',
'chat.effort.off': 'Off',
'chat.effort.low': 'Low',
'chat.effort.medium': 'Medium',
'chat.effort.high': 'High',
'chat.effort.tooltip': 'Reasoning effort. Higher = more thinking tokens.',
'chat.effort.tooltipBoolean': 'This family treats levels as on/off.',
'chat.effort.tooltipTokenBudget': 'Maps to a max_tokens budget: low=500, medium=2000, high=8000.',
'chat.cost.reasoningTokens': '({n} thinking)',
```

---

## Data flow summary

### Non-stream

```
Chat.tsx (effort='high', model='openai/o3')
  → builds ChatCompletionRequest with { ...req, ...buildReasoningPayload('openai/o3', 'high') }
    → reasoning: { effort: 'high' }
  → useChatStream.start(req) [or useCases.executeChatCompletion(...)]
    → RestApiClient.chatCompletion(key, req)
      → JSON.stringify(body) → fetch → response
      → parse with ChatCompletionResponseSchema
      → extract usage.completion_tokens_details.reasoning_tokens → meta.reasoningTokens
      → return { data, meta }
  → consumer reads data.choices[0].message.reasoning + content
  → renders ReasoningBlock above content + content bubble + CostBadge with reasoning count
  → persists ConversationEntry { kind: 'msg', role: 'assistant', content, reasoning }
```

### Stream

```
Chat.tsx (effort='high', model='openai/o3')
  → useChatStream.start(req) with reasoning merged
  → RestApiClient.chatCompletionStream(key, req, signal)
    → SSE loop:
        for each event:
          delta.content present → yield { kind: 'delta', text }
          delta.reasoning present → yield { kind: 'reasoning_delta', text }
          [DONE] → yield { kind: 'done', meta, fullText, fullReasoning }
  → useChatStream accumulates partial + partialReasoning separately
  → Chat.tsx renders: ReasoningBlock(partialReasoning, isStreaming=true) → Bubble(partial)
  → on done: persist with both fields
```

### Agentic

```
runAgenticChat
  → for each iteration:
      runIteration → response with msg.content + msg.reasoning + tool_calls
      yield { kind: 'thinking', iteration, mode }
      yield { kind: 'assistant_text', text: assistantText, reasoning: assistantReasoning }   // NEW reasoning
      if tool_calls: yield { kind: 'tool_call', ... }
        run tool, yield { kind: 'tool_result', ... }
      else: yield { kind: 'final', text, meta, reasoning? }
  → useAgenticChat collects steps, including reasoning per step
  → Chat.tsx AgenticBlock renders each step:
      step.kind === 'assistant_text' with step.reasoning → ReasoningBlock above the text
```

---

## Edge cases

| Case | Behavior |
|---|---|
| Effort = 'off' for any model | `buildReasoningPayload` returns `{}`, nothing is sent. |
| Model not in `REASONING_PREFIXES`, effort != 'off' | `buildReasoningPayload` returns `{}` (silent). UI hides the selector entirely so this can't happen via UI; safety net for direct API access. |
| Model supports reasoning but provider doesn't return any (empty `delta.reasoning`) | `partialReasoning === ''` → ReasoningBlock not rendered. Same as no-reasoning case. |
| User switches from compatible to incompatible model mid-conversation | Selector disappears; persisted `effort` value remains. Subsequent requests don't send `reasoning`. Switching back re-shows the selector with the saved value. |
| Persisted entry from before this feature | `entry.reasoning === undefined` → ReasoningBlock not rendered. Backward-compatible. |
| Stream contains only reasoning, no content | `Bubble` shows ReasoningBlock + content area showing `(sin respuesta)` placeholder. Rare but possible. |
| Non-stream response without `usage.completion_tokens_details` | `meta.reasoningTokens` is undefined; CostBadge omits the `(💭 N)` segment. |
| Reasoning text is very long (e.g., 10K chars) | ReasoningBlock body has `max-h-64 overflow-auto` so it doesn't blow up the layout. |

---

## Testing strategy

### Unit tests

- **`tests/domain/reasoning.test.ts` (new):**
  - `detectReasoningFamily('anthropic/claude-sonnet-4-20250513')` → `'enum_effort'`.
  - `detectReasoningFamily('google/gemini-2.5-flash-lite')` → `undefined`.
  - `buildReasoningPayload('openai/o3', 'high')` → `{ reasoning: { effort: 'high' } }`.
  - `buildReasoningPayload('deepseek/deepseek-r1', 'medium')` → `{ include_reasoning: true }` (level ignored).
  - `buildReasoningPayload('google/gemini-2.5-flash-thinking', 'high')` → `{ reasoning: { max_tokens: 8000 } }`.
  - `buildReasoningPayload(any, 'off')` → `{}`.
  - `buildReasoningPayload('unsupported/model', 'high')` → `{}`.

- **`tests/infrastructure/rest-client.test.ts` (extended):**
  - SSE chunk with `delta.reasoning` only → emits `{ kind: 'reasoning_delta', text }`.
  - SSE chunk with `delta.content` only → emits `{ kind: 'delta', text }`.
  - SSE chunk with both → emits both, in order.
  - `done` event includes `fullReasoning` accumulated from all chunks.
  - Non-stream response with `usage.completion_tokens_details.reasoning_tokens` → `meta.reasoningTokens` set.

- **`tests/application/run-agentic-chat.test.ts` (extended):**
  - Assistant message with `reasoning` propagates to `'assistant_text'` step's `reasoning` field.
  - Stream with reasoning chunks accumulates into the running step.

- **`tests/presentation/chat-store.test.ts` (extended):**
  - Default `effort` is `'off'`.
  - Setting `effort: 'high'` persists across reload.
  - Backward compat: a bucket persisted before this feature (without `effort`) loads with default `'off'`.

### Manual smoke

1. With `claude-sonnet-4`: select `effort: high`, ask "Why is 0.1 + 0.2 not exactly 0.3?". Expect reasoning streaming, then content. Reload → both persisted.
2. With `deepseek/deepseek-r1`: select `effort: low`. Expect tooltip showing it collapses to on/off. Same behavior in chat.
3. With `gemini-2.5-flash-thinking`: select `effort: high`. Expect token-budget tooltip. Cost badge shows `(💭 N)` if reasoning tokens come back.
4. Switch from `claude-sonnet-4` (effort=high) to `google/gemini-2.5-flash-lite` → selector disappears. Switch back → selector reappears with `high`.
5. Existing chat from before the feature opens normally; new turns get reasoning support.

---

## Files affected

| File | Status | Lines (approx) |
|---|---|---|
| `src/domain/reasoning.ts` | **New** | 60 |
| `src/domain/chat.ts` | Modify | +5 (extend types) |
| `src/infrastructure/schemas/rest.ts` | Modify | +12 (request + response + usage extraction) |
| `src/application/ports.ts` | Modify | +5 (`reasoningTokens` in meta, new variant) |
| `src/infrastructure/rest/RestApiClient.ts` | Modify | +20 (parse reasoning in SSE + non-stream usage extraction) |
| `src/application/runAgenticChat.ts` | Modify | +10 (capture and emit reasoning per iteration) |
| `src/presentation/hooks/useChatStream.ts` | Modify | +10 (accumulate `partialReasoning`) |
| `src/presentation/hooks/useAgenticChat.ts` | Modify | +5 (handle reasoning event) |
| `src/presentation/hooks/useChatStore.ts` | Modify | +3 (`effort` field + default) |
| `src/presentation/components/EffortSelector.tsx` | **New** | 50 |
| `src/presentation/components/ReasoningBlock.tsx` | **New** | 60 |
| `src/presentation/components/CostBadge.tsx` | Modify | +5 (reasoning tokens segment) |
| `src/presentation/routes/Chat.tsx` | Modify | +30 (selector + render in Bubble + AgenticBlock + setEffort callback) |
| `src/domain/i18n.ts` | Modify | +20 (EN+ES keys) |
| `tests/domain/reasoning.test.ts` | **New** | 40 |
| `tests/infrastructure/rest-client.test.ts` | Extend | +30 |
| `tests/application/run-agentic-chat.test.ts` | Extend | +20 |
| `tests/presentation/chat-store.test.ts` | Extend | +15 |

**Total: ~225 LOC new + ~135 LOC modified.** Spread across ~3-5 atomic commits.

---

## Out of scope (deferred)

- Editing/highlighting the reasoning text.
- Markdown rendering of reasoning.
- Auto-detection of model capabilities via API call (vs hardcoded list).
- Effort-per-model memory (one effort per agent regardless of model).
- Cancel-mid-thinking as a distinct UI action (Stop already handles it).
- Cost projection ("if I set effort to high, this will cost ~$0.X").

---

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| OpenRouter changes the response shape for reasoning | Schemas are `.loose()`; new fields land without breaking. The explicit `reasoning?: string` field tolerates `null`/`undefined`. |
| New compatible model released | Add a prefix to `REASONING_PREFIXES`. 1-line change. |
| Reasoning text exceeds localStorage quota faster than expected | The existing `safeStorage` wrapper in `useChatStore` already handles `QuotaExceededError` with the toast. No new code needed. |
| Stream chunk order: reasoning arrives interleaved with content unexpectedly | The accumulator is split (`partial` for content, `partialReasoning` for reasoning). Each renders independently. No ordering assumption. |
| Family detection misses a real prefix variant (e.g., `anthropic/claude-sonnet-4-20250513`) | `startsWith(prefix)` matches as long as the prefix is a real prefix substring. The prefix list uses base names (`anthropic/claude-sonnet-4`) so versioned slugs match. |
