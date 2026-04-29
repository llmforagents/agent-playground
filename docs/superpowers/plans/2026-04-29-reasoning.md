# Reasoning / Chain-of-Thought Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface reasoning text from compatible models (Claude 4.x, OpenAI o-series, DeepSeek R1, Qwen QwQ, Gemini 2.5 thinking) in the playground chat UI, with a unified Off/Low/Medium/High effort selector that the client translates per family. Render reasoning as a collapsible block above content, persist alongside the existing chat store, and surface reasoning-only token counts in the CostBadge.

**Architecture:** Add a pure `domain/reasoning.ts` module for family detection and per-family payload translation. Schemas absorb new optional fields (`reasoning`, `include_reasoning` on request; `reasoning` on message). The transport layer (`RestApiClient`) parses `delta.reasoning` from SSE chunks separately from `delta.content`, and extracts `usage.completion_tokens_details.reasoning_tokens` from non-stream responses. Consumer hooks (`useChatStream`, `useAgenticChat`) accumulate reasoning in parallel state. New presentation components `ReasoningBlock` and `EffortSelector` render the live thinking and the family-aware control. Persistence extends the existing `ChatPersisted` bucket and `ConversationEntry`.

**Tech Stack:** TypeScript (strict), Zod 4 (`.loose()` already on `ChatMessageSchema`), Zustand (existing store), React 19, Vitest + jsdom (tests).

**Spec:** `docs/superpowers/specs/2026-04-29-reasoning-design.md`

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `src/domain/reasoning.ts` | **Create** | `Effort` type, `ReasoningFamily`, `REASONING_PREFIXES` list, `detectReasoningFamily()`, `buildReasoningPayload()` |
| `src/domain/chat.ts` | Modify | Extend `ConversationEntry kind:'msg'` with `reasoning?: string`; `kind:'agentic'` with `finalReasoning?: string`; `AgenticStep kind:'assistant_text'` with `reasoning?: string` |
| `src/infrastructure/schemas/rest.ts` | Modify | Add `reasoning?` + `include_reasoning?` to request; `reasoning?: string` to `ChatMessageSchema`; extract `reasoningTokens` in `extractMeta()` (moved or wrapped) |
| `src/application/ports.ts` | Modify | Add `reasoningTokens?: number` to `ChatResponseMeta`; add `reasoning_delta` variant to `ChatStreamChunk`; `done` chunk gains `fullReasoning?: string` |
| `src/infrastructure/rest/RestApiClient.ts` | Modify | Parse `delta.reasoning` in SSE loop; capture `reasoning_tokens` from non-stream usage |
| `src/application/runAgenticChat.ts` | Modify | Pass `msg.reasoning` through into the `assistant_text` event when present |
| `src/presentation/hooks/useAgenticChat.ts` | Modify | Attach `reasoning` to `'assistant_text'` step when the event includes it |
| `src/presentation/hooks/useChatStream.ts` | Modify | Accumulate `partialReasoning` in state alongside `partial`; expose `fullReasoning` in `done` |
| `src/presentation/hooks/useChatStore.ts` | Modify | Add `effort: Effort` field to `ChatPersisted` and `DEFAULT_CHAT` |
| `src/presentation/components/ReasoningBlock.tsx` | **Create** | Collapsible block with elapsed timer during streaming, auto-collapse on done |
| `src/presentation/components/EffortSelector.tsx` | **Create** | Dropdown Off/Low/Medium/High; hidden when current model has no `ReasoningFamily` |
| `src/presentation/components/CostBadge.tsx` | Modify | Append `(💭 N)` segment when `meta.reasoningTokens > 0` |
| `src/presentation/routes/Chat.tsx` | Modify | Read `effort` from store; merge `buildReasoningPayload(model, effort)` into request before stream/agentic; mount `EffortSelector` in topbar; render `ReasoningBlock` in `Bubble` and `AgenticBlock` |
| `src/domain/i18n.ts` | Modify | Add `chat.reasoning.*`, `chat.effort.*`, `chat.cost.reasoningTokens` keys (EN+ES) |
| `tests/domain/reasoning.test.ts` | **Create** | Unit tests for `detectReasoningFamily` + `buildReasoningPayload` |
| `tests/infrastructure/rest-client.test.ts` | Extend | Tests for `delta.reasoning` parsing + `reasoning_tokens` extraction |
| `tests/application/run-agentic-chat.test.ts` | Extend | Test that `reasoning` propagates through agentic loop |
| `tests/presentation/chat-store.test.ts` | Extend | Test that `effort` defaults to `'off'` and persists |

---

## Task 1: Domain module `reasoning.ts` (TDD)

**Files:**
- Create: `src/domain/reasoning.ts`
- Create: `tests/domain/reasoning.test.ts`

- [ ] **Step 1.1: Write the failing tests**

Create `tests/domain/reasoning.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  detectReasoningFamily,
  buildReasoningPayload,
  type Effort,
} from '@/domain/reasoning'

describe('detectReasoningFamily', () => {
  it('matches Claude 4.x as enum_effort', () => {
    expect(detectReasoningFamily('anthropic/claude-sonnet-4')).toBe('enum_effort')
    expect(detectReasoningFamily('anthropic/claude-sonnet-4-20250513')).toBe('enum_effort')
    expect(detectReasoningFamily('anthropic/claude-opus-4')).toBe('enum_effort')
  })

  it('matches OpenAI o-series as enum_effort', () => {
    expect(detectReasoningFamily('openai/o1')).toBe('enum_effort')
    expect(detectReasoningFamily('openai/o3')).toBe('enum_effort')
    expect(detectReasoningFamily('openai/o4-mini')).toBe('enum_effort')
  })

  it('matches DeepSeek R1 and Qwen QwQ as boolean_toggle', () => {
    expect(detectReasoningFamily('deepseek/deepseek-r1')).toBe('boolean_toggle')
    expect(detectReasoningFamily('qwen/qwq-32b')).toBe('boolean_toggle')
  })

  it('matches Gemini 2.5 thinking as token_budget', () => {
    expect(detectReasoningFamily('google/gemini-2.5-flash-thinking')).toBe('token_budget')
    expect(detectReasoningFamily('google/gemini-2.5-pro-thinking')).toBe('token_budget')
  })

  it('returns undefined for unsupported models', () => {
    expect(detectReasoningFamily('google/gemini-2.5-flash-lite')).toBeUndefined()
    expect(detectReasoningFamily('openai/gpt-4o-mini')).toBeUndefined()
    expect(detectReasoningFamily('meta-llama/llama-3-70b')).toBeUndefined()
  })

  it('is case-insensitive on the model slug', () => {
    expect(detectReasoningFamily('ANTHROPIC/CLAUDE-SONNET-4')).toBe('enum_effort')
  })
})

describe('buildReasoningPayload', () => {
  it('returns empty object when effort is off', () => {
    expect(buildReasoningPayload('anthropic/claude-sonnet-4', 'off')).toEqual({})
    expect(buildReasoningPayload('openai/gpt-4o-mini', 'off')).toEqual({})
  })

  it('returns empty object when model is not compatible regardless of effort', () => {
    const efforts: readonly Effort[] = ['low', 'medium', 'high']
    for (const e of efforts) {
      expect(buildReasoningPayload('openai/gpt-4o-mini', e)).toEqual({})
    }
  })

  it('uses reasoning.effort for enum_effort family', () => {
    expect(buildReasoningPayload('anthropic/claude-sonnet-4', 'low')).toEqual({ reasoning: { effort: 'low' } })
    expect(buildReasoningPayload('openai/o3', 'medium')).toEqual({ reasoning: { effort: 'medium' } })
    expect(buildReasoningPayload('openai/o4-mini', 'high')).toEqual({ reasoning: { effort: 'high' } })
  })

  it('uses include_reasoning for boolean_toggle family (level ignored)', () => {
    expect(buildReasoningPayload('deepseek/deepseek-r1', 'low')).toEqual({ include_reasoning: true })
    expect(buildReasoningPayload('deepseek/deepseek-r1', 'medium')).toEqual({ include_reasoning: true })
    expect(buildReasoningPayload('qwen/qwq-32b', 'high')).toEqual({ include_reasoning: true })
  })

  it('maps level to max_tokens for token_budget family', () => {
    expect(buildReasoningPayload('google/gemini-2.5-flash-thinking', 'low')).toEqual({ reasoning: { max_tokens: 500 } })
    expect(buildReasoningPayload('google/gemini-2.5-flash-thinking', 'medium')).toEqual({ reasoning: { max_tokens: 2000 } })
    expect(buildReasoningPayload('google/gemini-2.5-flash-thinking', 'high')).toEqual({ reasoning: { max_tokens: 8000 } })
  })
})
```

- [ ] **Step 1.2: Run tests to confirm they fail with module-not-found**

Run: `npm run test:ci -- tests/domain/reasoning.test.ts`
Expected: FAIL — `Cannot find module '@/domain/reasoning'`.

- [ ] **Step 1.3: Create the implementation**

Create `src/domain/reasoning.ts`:

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
  low: 500,
  medium: 2000,
  high: 8000,
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

- [ ] **Step 1.4: Run tests, expect green**

Run: `npm run test:ci -- tests/domain/reasoning.test.ts`
Expected: 14 tests pass.

- [ ] **Step 1.5: Run full suite + typecheck**

Run: `npm run typecheck && npm run test:ci`
Expected: typecheck PASS; total tests = 87 + 14 = 101 (existing 87 + 14 new).

- [ ] **Step 1.6: Commit**

```bash
git add src/domain/reasoning.ts tests/domain/reasoning.test.ts
git commit -m "$(cat <<'EOF'
feat(reasoning): add domain module for family detection and payload translation

Pure types and functions: Effort enum (off/low/medium/high),
ReasoningFamily classification (enum_effort/boolean_toggle/token_budget),
hardcoded prefix list, and buildReasoningPayload() that maps a unified
effort level to the correct request shape per family.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Schema and port type extensions

**Files:**
- Modify: `src/infrastructure/schemas/rest.ts` (request schema, message schema, response usage)
- Modify: `src/application/ports.ts` (`ChatResponseMeta`, `ChatStreamChunk`)

- [ ] **Step 2.1: Extend `ChatCompletionRequestSchema`**

Open `src/infrastructure/schemas/rest.ts`. Find the existing `ChatCompletionRequestSchema` (around line 114) and add two optional fields at the bottom:

```ts
export const ChatCompletionRequestSchema = z.object({
  model: z.string().min(1),
  messages: z.array(ChatMessageSchema).min(1),
  temperature: z.number().min(0).max(2).optional(),
  max_tokens: z.number().int().positive().optional(),
  stream: z.boolean().optional(),
  tools: z.array(ToolDefSchema).optional(),
  tool_choice: z.union([z.enum(['auto', 'none', 'required']), z.object({ type: z.literal('function'), function: z.object({ name: z.string() }) })]).optional(),
  reasoning: z.object({
    effort: z.enum(['low', 'medium', 'high']).optional(),
    max_tokens: z.number().int().positive().optional(),
  }).optional(),
  include_reasoning: z.boolean().optional(),
})
```

- [ ] **Step 2.2: Extend `ChatMessageSchema` with `reasoning?: string`**

In the same file, find `ChatMessageSchema` (around line 97) and add `reasoning`:

```ts
export const ChatMessageSchema = z.object({
  role: z.enum(['system', 'user', 'assistant', 'tool']),
  content: z.string().nullable().optional(),
  reasoning: z.string().nullable().optional(),
  name: z.string().optional(),
  tool_calls: z.array(ToolCallSchema).optional(),
  tool_call_id: z.string().optional(),
}).loose()
```

- [ ] **Step 2.3: Extend `ChatResponseMeta` with `reasoningTokens?: number`**

Open `src/application/ports.ts`. Find `ChatResponseMeta` (around line 18) and add the field:

```ts
export type ChatResponseMeta = Readonly<{
  costCents?: number
  tokensInput?: number
  tokensOutput?: number
  reasoningTokens?: number
  balanceRemainingCents?: number
  requestId?: string
}>
```

- [ ] **Step 2.4: Extend `ChatStreamChunk` with `reasoning_delta` and `done.fullReasoning`**

In the same file, find `ChatStreamChunk` (around line 31) and replace:

```ts
export type ChatStreamChunk =
  | { readonly kind: 'delta'; readonly text: string }
  | { readonly kind: 'reasoning_delta'; readonly text: string }
  | { readonly kind: 'done'; readonly meta: ChatResponseMeta; readonly fullText: string; readonly fullReasoning?: string }
```

- [ ] **Step 2.5: Run typecheck and full suite**

Run: `npm run typecheck && npm run test:ci`
Expected: typecheck PASS, 101 tests pass (no changes broke anything).

- [ ] **Step 2.6: Commit**

```bash
git add src/infrastructure/schemas/rest.ts src/application/ports.ts
git commit -m "$(cat <<'EOF'
feat(reasoning): extend schemas and port types for reasoning fields

Request schema accepts optional reasoning ({effort, max_tokens}) and
include_reasoning. Message schema accepts reasoning?: string (already
.loose() so runtime preservation worked, this adds the explicit type).
ChatResponseMeta carries reasoningTokens. ChatStreamChunk gains a
reasoning_delta variant and the done event carries fullReasoning.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Domain types extension (`ConversationEntry`, `AgenticStep`)

**Files:**
- Modify: `src/domain/chat.ts`

- [ ] **Step 3.1: Extend the types**

Open `src/domain/chat.ts`. Find the three relocated types from the previous chat-persistence work (`AgenticStep`, `ConversationEntry`). Replace them with the extended versions:

```ts
/** A single step in an agentic run, persisted across reloads. */
export type AgenticStep =
  | { readonly kind: 'assistant_text'; readonly text: string; readonly reasoning?: string }
  | { readonly kind: 'mode_fallback'; readonly from: DispatchMode; readonly to: DispatchMode; readonly reason: string }
  | { readonly kind: 'tool'; readonly callId: string; readonly toolName: string; readonly args: unknown; readonly status: 'running' | 'ok' | 'error'; readonly summary?: string; readonly raw?: unknown }

/** A turn in the conversation: a plain user/assistant message or a multi-step agentic block. */
export type ConversationEntry =
  | { readonly kind: 'msg'; readonly role: ChatMessage['role']; readonly content: string; readonly reasoning?: string }
  | { readonly kind: 'agentic'; readonly steps: readonly AgenticStep[]; readonly finalText: string; readonly finalReasoning?: string }
```

The `reasoning` and `finalReasoning` fields are optional, so existing persisted entries without them remain valid (backward-compatible).

- [ ] **Step 3.2: Run typecheck and tests**

Run: `npm run typecheck && npm run test:ci`
Expected: typecheck PASS, 101 tests pass.

- [ ] **Step 3.3: Commit**

```bash
git add src/domain/chat.ts
git commit -m "$(cat <<'EOF'
feat(reasoning): extend ConversationEntry and AgenticStep with reasoning fields

Optional reasoning?: string on msg entries, finalReasoning?: string on
agentic entries, and reasoning?: string on assistant_text steps.
Backward-compatible: persisted entries without these fields are valid.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: RestApiClient — parse reasoning in stream + extract reasoning_tokens (TDD)

**Files:**
- Modify: `src/infrastructure/rest/RestApiClient.ts`
- Extend: `tests/infrastructure/rest-client.test.ts`

- [ ] **Step 4.1: Inspect the existing test file to know the testing pattern**

Run: `cat tests/infrastructure/rest-client.test.ts | head -80`

You need to see how SSE streaming is tested. The pattern uses `MSW` (Mock Service Worker) per the project's tests. If the file does not exist or doesn't have streaming tests, write a small new suite using a hand-rolled `ReadableStream` that emits SSE-formatted bytes.

- [ ] **Step 4.2: Write the failing test for `delta.reasoning` parsing**

Append to `tests/infrastructure/rest-client.test.ts` (or create it if absent — see Step 4.1). Use this test fixture:

```ts
import { describe, it, expect, vi } from 'vitest'
import { RestApiClient } from '@/infrastructure/rest/RestApiClient'
import { ApiKey } from '@/domain/branded'
import type { ChatStreamChunk } from '@/application/ports'

function makeSseStream(events: readonly string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  return new ReadableStream({
    start(controller) {
      for (const ev of events) controller.enqueue(encoder.encode(`data: ${ev}\n\n`))
      controller.enqueue(encoder.encode('data: [DONE]\n\n'))
      controller.close()
    },
  })
}

async function collect(gen: AsyncGenerator<ChatStreamChunk, void, void>): Promise<readonly ChatStreamChunk[]> {
  const out: ChatStreamChunk[] = []
  for await (const c of gen) out.push(c)
  return out
}

describe('RestApiClient.chatCompletionStream — reasoning', () => {
  it('parses delta.reasoning and emits reasoning_delta chunks', async () => {
    const stream = makeSseStream([
      JSON.stringify({ choices: [{ delta: { reasoning: 'Let me think.' } }] }),
      JSON.stringify({ choices: [{ delta: { content: 'Answer is 42.' } }] }),
    ])
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(stream, { status: 200, headers: { 'content-type': 'text/event-stream' } }),
    )
    const client = new RestApiClient('https://api.test', 'https://mcp.test')
    const chunks = await collect(client.chatCompletionStream(
      ApiKey('sk_test'),
      { model: 'openai/o3', messages: [{ role: 'user', content: 'hi' }], stream: true },
      new AbortController().signal,
    ))
    fetchMock.mockRestore()

    const reasoningChunks = chunks.filter((c) => c.kind === 'reasoning_delta')
    const contentChunks = chunks.filter((c) => c.kind === 'delta')
    const doneChunk = chunks.find((c) => c.kind === 'done')

    expect(reasoningChunks).toHaveLength(1)
    expect(reasoningChunks[0]).toEqual({ kind: 'reasoning_delta', text: 'Let me think.' })
    expect(contentChunks).toHaveLength(1)
    expect(contentChunks[0]).toEqual({ kind: 'delta', text: 'Answer is 42.' })
    expect(doneChunk?.kind === 'done' && doneChunk.fullText).toBe('Answer is 42.')
    expect(doneChunk?.kind === 'done' && doneChunk.fullReasoning).toBe('Let me think.')
  })

  it('handles a chunk with both delta.content and delta.reasoning together', async () => {
    const stream = makeSseStream([
      JSON.stringify({ choices: [{ delta: { content: 'A', reasoning: 'B' } }] }),
    ])
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(stream, { status: 200, headers: { 'content-type': 'text/event-stream' } }),
    )
    const client = new RestApiClient('https://api.test', 'https://mcp.test')
    const chunks = await collect(client.chatCompletionStream(
      ApiKey('sk_test'),
      { model: 'openai/o3', messages: [{ role: 'user', content: 'hi' }], stream: true },
      new AbortController().signal,
    ))
    fetchMock.mockRestore()

    const kinds = chunks.map((c) => c.kind)
    expect(kinds).toContain('delta')
    expect(kinds).toContain('reasoning_delta')
    expect(kinds).toContain('done')
  })
})

describe('RestApiClient.chatCompletion — reasoning_tokens', () => {
  it('extracts reasoning_tokens from usage.completion_tokens_details', async () => {
    const responseBody = {
      id: 'x',
      object: 'chat.completion',
      created: 0,
      model: 'openai/o3',
      choices: [{ index: 0, message: { role: 'assistant', content: 'hi', reasoning: 'thinking' } }],
      usage: {
        prompt_tokens: 10,
        completion_tokens: 100,
        total_tokens: 110,
        completion_tokens_details: { reasoning_tokens: 75 },
      },
    }
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(responseBody), { status: 200, headers: { 'content-type': 'application/json' } }),
    )
    const client = new RestApiClient('https://api.test', 'https://mcp.test')
    const res = await client.chatCompletion(
      ApiKey('sk_test'),
      { model: 'openai/o3', messages: [{ role: 'user', content: 'hi' }] },
    )
    fetchMock.mockRestore()

    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.value.meta.reasoningTokens).toBe(75)
    expect(res.value.data.choices[0]?.message.reasoning).toBe('thinking')
  })

  it('omits reasoningTokens when usage has no completion_tokens_details', async () => {
    const responseBody = {
      id: 'x',
      object: 'chat.completion',
      created: 0,
      model: 'openai/gpt-4o-mini',
      choices: [{ index: 0, message: { role: 'assistant', content: 'hi' } }],
      usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
    }
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(responseBody), { status: 200, headers: { 'content-type': 'application/json' } }),
    )
    const client = new RestApiClient('https://api.test', 'https://mcp.test')
    const res = await client.chatCompletion(
      ApiKey('sk_test'),
      { model: 'openai/gpt-4o-mini', messages: [{ role: 'user', content: 'hi' }] },
    )
    fetchMock.mockRestore()

    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.value.meta.reasoningTokens).toBeUndefined()
  })
})
```

- [ ] **Step 4.3: Run the new tests, confirm they fail**

Run: `npm run test:ci -- tests/infrastructure/rest-client.test.ts`
Expected: FAIL — the existing client doesn't parse reasoning, so the assertions miss the new chunks/fields.

- [ ] **Step 4.4: Modify the SSE stream parser to capture reasoning**

Open `src/infrastructure/rest/RestApiClient.ts`. Find `chatCompletionStream` (around line 74). Replace the body of the SSE loop to track reasoning separately:

```ts
async *chatCompletionStream(
  key: ApiKey, req: ChatCompletionRequest, signal: AbortSignal,
): AsyncGenerator<ChatStreamChunk, void, void> {
  const url = `${this.apiBase}/v1/chat/completions`
  const res = await fetch(url, {
    method: 'POST',
    signal,
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${key}`,
      accept: 'text/event-stream',
    },
    body: JSON.stringify({ ...req, stream: true }),
  })
  if (!res.ok || !res.body) {
    return
  }
  let full = ''
  let fullReasoning = ''
  for await (const ev of parseSseStream(res.body)) {
    if (ev.data === '[DONE]') {
      yield {
        kind: 'done',
        fullText: full,
        meta: extractMeta(res.headers),
        ...(fullReasoning ? { fullReasoning } : {}),
      }
      return
    }
    try {
      const chunk = JSON.parse(ev.data) as { choices?: { delta?: { content?: string; reasoning?: string } }[] }
      const delta = chunk.choices?.[0]?.delta
      const contentDelta = delta?.content ?? ''
      const reasoningDelta = delta?.reasoning ?? ''
      if (reasoningDelta) {
        fullReasoning += reasoningDelta
        yield { kind: 'reasoning_delta', text: reasoningDelta }
      }
      if (contentDelta) {
        full += contentDelta
        yield { kind: 'delta', text: contentDelta }
      }
    } catch { /* ignore malformed chunks */ }
  }
  yield {
    kind: 'done',
    fullText: full,
    meta: extractMeta(res.headers),
    ...(fullReasoning ? { fullReasoning } : {}),
  }
}
```

Note the conditional spread `...(fullReasoning ? { fullReasoning } : {})`: only include `fullReasoning` when there was any (avoids exposing an empty string).

- [ ] **Step 4.5: Modify `chatCompletion` (non-stream) to capture `reasoning_tokens`**

In the same file, find `chatCompletion` (around line 56) and find the `meta` line. Replace the simple `extractMeta(response.headers)` call with one that also reads from the parsed body's `usage`:

```ts
async chatCompletion(
  key: ApiKey, req: ChatCompletionRequest,
): Promise<Result<ChatResponseWithMeta, RestError>> {
  const url = `${this.apiBase}/v1/chat/completions`
  const res = await this.fetchSafe(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify({ ...req, stream: false }),
  })
  if (!res.ok) return res
  const { response } = res.value
  const parsed = ChatCompletionResponseSchema.safeParse(await response.json())
  if (!parsed.success) {
    return Err({ kind: 'validation', issues: zodIssuesToZodLike(parsed.error.issues) })
  }
  const headerMeta = extractMeta(response.headers)
  const reasoningTokens = extractReasoningTokens(parsed.data)
  const meta: ChatResponseMeta = reasoningTokens !== undefined
    ? { ...headerMeta, reasoningTokens }
    : headerMeta
  return Ok({ data: parsed.data, meta })
}
```

Then add a private helper at the end of the file (near `extractMeta`):

```ts
function extractReasoningTokens(data: ChatCompletionResponse): number | undefined {
  const usage = data.usage as { completion_tokens_details?: { reasoning_tokens?: number } } | undefined
  const n = usage?.completion_tokens_details?.reasoning_tokens
  return typeof n === 'number' && n >= 0 ? n : undefined
}
```

The cast is acceptable here because the response schema is `.loose()` and `completion_tokens_details` is a passthrough field not in the explicit type.

- [ ] **Step 4.6: Run the new tests, expect green**

Run: `npm run test:ci -- tests/infrastructure/rest-client.test.ts`
Expected: 4 new tests pass (2 for stream, 2 for non-stream).

- [ ] **Step 4.7: Run full suite + typecheck**

Run: `npm run typecheck && npm run test:ci`
Expected: typecheck PASS, total tests = 101 + 4 = 105.

- [ ] **Step 4.8: Commit**

```bash
git add src/infrastructure/rest/RestApiClient.ts tests/infrastructure/rest-client.test.ts
git commit -m "$(cat <<'EOF'
feat(reasoning): parse delta.reasoning and reasoning_tokens in transport

chatCompletionStream emits reasoning_delta chunks alongside delta
chunks, and the done event carries fullReasoning. chatCompletion
(non-stream) extracts usage.completion_tokens_details.reasoning_tokens
and surfaces it via meta.reasoningTokens.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: useChatStore — add `effort` field

**Files:**
- Modify: `src/presentation/hooks/useChatStore.ts`
- Extend: `tests/presentation/chat-store.test.ts`

- [ ] **Step 5.1: Write the failing test**

Append to `tests/presentation/chat-store.test.ts`, inside the existing `describe('useChatStore', ...)` block:

```ts
  it('defaults effort to "off" in DEFAULT_CHAT', () => {
    expect(DEFAULT_CHAT.effort).toBe('off')
  })

  it('persists effort across the store and respects setChat overrides', () => {
    useChatStore.getState().setChat(A, { entries: [], model: 'm', toolsOn: true, effort: 'high' })
    expect(useChatStore.getState().byAgent[A]?.effort).toBe('high')
  })

  it('serializes effort to localStorage', () => {
    useChatStore.getState().setChat(A, { entries: [], model: 'm', toolsOn: true, effort: 'medium' })
    const raw = localStorage.getItem('llm4agents-chats')
    expect(raw).not.toBeNull()
    const parsed = JSON.parse(raw!)
    expect(parsed.state.byAgent[A].effort).toBe('medium')
  })
```

- [ ] **Step 5.2: Run tests, confirm failure**

Run: `npm run test:ci -- tests/presentation/chat-store.test.ts`
Expected: FAIL — `effort` doesn't exist on `ChatPersisted`.

- [ ] **Step 5.3: Add `effort` to `ChatPersisted` and `DEFAULT_CHAT`**

Open `src/presentation/hooks/useChatStore.ts`. Update the imports at the top to include `Effort`:

```ts
import type { Effort } from '@/domain/reasoning'
```

Find `ChatPersisted` and `DEFAULT_CHAT` and replace:

```ts
export type ChatPersisted = Readonly<{
  entries: readonly ConversationEntry[]
  model: string
  toolsOn: boolean
  effort: Effort
}>

export const DEFAULT_CHAT: ChatPersisted = {
  entries: [],
  model: DEFAULT_MODEL,
  toolsOn: true,
  effort: 'off',
}
```

- [ ] **Step 5.4: Run tests, expect green**

Run: `npm run test:ci -- tests/presentation/chat-store.test.ts`
Expected: 8 tests pass (5 existing + 3 new).

- [ ] **Step 5.5: Run typecheck and full suite**

Run: `npm run typecheck && npm run test:ci`
Expected: typecheck PASS, 108 tests pass. Note: `Chat.tsx` may show a typecheck error because `setChat` calls now require `effort`. Fix in this same step by updating each `setChatBucket(agent.id, { ...current, X: Y })` call site — but wait, those use `...current` which already includes `effort` after this change. So they should still typecheck. Verify.

If any call site fails typecheck because it does `setChatBucket(agent.id, { entries: ..., model: ..., toolsOn: ... })` (without spread), update it to use the spread or include `effort`.

- [ ] **Step 5.6: Commit**

```bash
git add src/presentation/hooks/useChatStore.ts tests/presentation/chat-store.test.ts
git commit -m "$(cat <<'EOF'
feat(reasoning): add effort field to ChatPersisted

Per-agent persisted bucket now carries effort: 'off'|'low'|'medium'|'high'
defaulting to 'off'. Survives reload and agent switches.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: useChatStream — accumulate `partialReasoning`

**Files:**
- Modify: `src/presentation/hooks/useChatStream.ts`

- [ ] **Step 6.1: Update `ChatStreamState` and accumulate reasoning**

Open `src/presentation/hooks/useChatStream.ts`. Replace the `ChatStreamState` type and the `start` function body:

```ts
import { useCallback, useRef, useState } from 'react'
import { useAppContainer } from './useAppContainer'
import { useActiveAgent } from './useActiveAgent'
import type { ChatResponseMeta } from '@/application/ports'
import type { ChatCompletionRequest } from '@/infrastructure/schemas/rest'
import type { AppError } from '@/domain/errors'
import { coerceToAppError } from '@/domain/errors'

export type ChatStreamState =
  | { readonly status: 'idle' }
  | { readonly status: 'streaming'; readonly partial: string; readonly partialReasoning: string }
  | { readonly status: 'done'; readonly fullText: string; readonly fullReasoning: string; readonly meta: ChatResponseMeta }
  | { readonly status: 'error'; readonly partial: string; readonly partialReasoning: string; readonly error: AppError }

export function useChatStream() {
  const container = useAppContainer()
  const agent = useActiveAgent()
  const [state, setState] = useState<ChatStreamState>({ status: 'idle' })
  const abortRef = useRef<AbortController | null>(null)

  const start = useCallback(async (req: ChatCompletionRequest) => {
    if (!agent) return
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setState({ status: 'streaming', partial: '', partialReasoning: '' })
    let partial = ''
    let partialReasoning = ''
    try {
      for await (const chunk of container.useCases.streamChatCompletion(agent.id, agent.apiKey, req, controller.signal)) {
        if (chunk.kind === 'delta') {
          partial += chunk.text
          setState({ status: 'streaming', partial, partialReasoning })
        } else if (chunk.kind === 'reasoning_delta') {
          partialReasoning += chunk.text
          setState({ status: 'streaming', partial, partialReasoning })
        } else if (chunk.kind === 'done') {
          setState({
            status: 'done',
            fullText: chunk.fullText,
            fullReasoning: chunk.fullReasoning ?? '',
            meta: chunk.meta,
          })
        }
      }
    } catch (e) {
      setState({ status: 'error', partial, partialReasoning, error: coerceToAppError(e) })
    }
  }, [container, agent])

  const stop = useCallback(() => abortRef.current?.abort(), [])

  return { state, start, stop }
}
```

- [ ] **Step 6.2: Run typecheck**

Run: `npm run typecheck`
Expected: PASS. There may be errors in `Chat.tsx` consumers — leave those for Task 11. If the typecheck fails ONLY in `Chat.tsx`, that's expected and Task 11 fixes it. If it fails elsewhere, fix here.

If typecheck fails on `Chat.tsx` for now, ignore and continue.

- [ ] **Step 6.3: Run tests**

Run: `npm run test:ci`
Expected: tests still pass (no test currently asserts on `useChatStream` shape directly; integration is via `Chat.tsx` which we touch in Task 11).

- [ ] **Step 6.4: Commit**

```bash
git add src/presentation/hooks/useChatStream.ts
git commit -m "$(cat <<'EOF'
feat(reasoning): accumulate partialReasoning in useChatStream

State now carries partialReasoning alongside partial. Stream chunks
of kind reasoning_delta append to partialReasoning. Done state
includes fullReasoning (defaulting to empty string when absent).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: runAgenticChat + useAgenticChat — propagate reasoning per iteration (TDD)

**Files:**
- Modify: `src/application/runAgenticChat.ts`
- Modify: `src/presentation/hooks/useAgenticChat.ts`
- Extend: `tests/application/run-agentic-chat.test.ts`

- [ ] **Step 7.1: Write the failing test**

Append to `tests/application/run-agentic-chat.test.ts`:

```ts
  it('propagates message.reasoning into the assistant_text event', async () => {
    const rest: RestApiPort = {
      ...chatWith([]),
      chatCompletion: async () => Ok({
        data: {
          id: 'id', object: 'chat.completion', created: 0, model: 'openai/o3',
          choices: [{
            index: 0,
            message: { role: 'assistant' as const, content: 'Final answer.', reasoning: 'Step 1: think. Step 2: conclude.' },
          }],
        },
        meta: { costCents: 1, reasoningTokens: 50 },
      }),
    }
    const events = await collect(runAgenticChat(
      { rest, mcp: { callTool: async () => Ok({ content: [{ type: 'text' as const, text: 'unused' }] }) }, key: KEY, agent: AGENT },
      { model: 'openai/o3', messages: [{ role: 'user', content: 'hi' }], mode: 'native' },
    ))
    const assistantTextEv = events.find((e) => e.kind === 'assistant_text')
    expect(assistantTextEv).toBeDefined()
    if (assistantTextEv?.kind !== 'assistant_text') throw new Error('shape')
    expect(assistantTextEv.text).toBe('Final answer.')
    expect(assistantTextEv.reasoning).toBe('Step 1: think. Step 2: conclude.')
  })
```

Note: the test uses `kind: 'assistant_text'`. The current implementation does NOT yield this event from `runAgenticChat`. Search the file: `grep "assistant_text" src/application/runAgenticChat.ts`. The existing `AgenticEvent` union has `'assistant_text'` (line 17), but the body of the loop doesn't emit it. We need to emit it.

- [ ] **Step 7.2: Run the test, confirm failure**

Run: `npm run test:ci -- tests/application/run-agentic-chat.test.ts`
Expected: FAIL — `assistantTextEv` is `undefined` because `runAgenticChat` never yields `'assistant_text'`.

- [ ] **Step 7.3: Modify `runAgenticChat` to emit `assistant_text` with `reasoning`**

Open `src/application/runAgenticChat.ts`. First, extend the `AgenticEvent` `assistant_text` variant to include `reasoning?: string`:

```ts
export type AgenticEvent =
  | { readonly kind: 'thinking'; readonly iteration: number; readonly mode: DispatchMode }
  | { readonly kind: 'assistant_text'; readonly text: string; readonly reasoning?: string }
  | { readonly kind: 'tool_call'; ... }
  ...
```

Then, in `runIteration`, change the `IterationStep` type to carry reasoning when present:

```ts
type IterationStep =
  | { readonly kind: 'tool_call'; readonly callId: string; readonly name: string; readonly args: unknown; readonly reasoning?: string }
  | { readonly kind: 'final'; readonly text: string; readonly reasoning?: string }
  | { readonly kind: 'error'; readonly error: RestError; readonly providerMightNotSupportTools: boolean }
```

In the body of `runIteration`, after extracting `assistantText`, also extract reasoning:

```ts
const assistantText = msg.content ?? ''
const assistantReasoning = typeof msg.reasoning === 'string' && msg.reasoning.length > 0 ? msg.reasoning : undefined
```

Then on the two return paths in `runIteration`:

```ts
// native mode, tool_calls present:
return {
  step: { kind: 'tool_call', callId: tc.id, name: tc.function.name, args, ...(assistantReasoning ? { reasoning: assistantReasoning } : {}) },
  meta,
}

// native mode, no tool_calls (final):
return { step: { kind: 'final', text: assistantText, ...(assistantReasoning ? { reasoning: assistantReasoning } : {}) }, meta }

// prompt mode, tool_call:
return { step: { kind: 'tool_call', callId, name: parsed.name, args: parsed.args, ...(assistantReasoning ? { reasoning: assistantReasoning } : {}) }, meta }

// prompt mode, final:
return { step: { kind: 'final', text: parsed.text, ...(assistantReasoning ? { reasoning: assistantReasoning } : {}) }, meta }
```

Now, in the main `runAgenticChat` generator body, **before** yielding `tool_call` or `final`, emit `assistant_text` if there's reasoning to surface:

In the section `// step.kind === 'tool_call'` (around line 278), insert before `yield { kind: 'tool_call', ... }`:

```ts
// Before yielding the tool_call, if the assistant produced reasoning during this iteration,
// surface it as an assistant_text event so the UI can render the thinking before the tool fires.
if (step.reasoning) {
  yield { kind: 'assistant_text', text: '', reasoning: step.reasoning }
}
```

In the section `if (step.kind === 'final')` (around line 273), replace the yield:

```ts
if (step.kind === 'final') {
  yield {
    kind: 'final',
    text: step.text,
    meta: lastMeta,
    ...(step.reasoning ? { reasoningOnFinal: step.reasoning } : {}),
  }
  return
}
```

Wait — actually a simpler approach: emit `assistant_text` BEFORE the `final` event too. That way the same UI handler reads reasoning from `assistant_text` regardless of whether it's a final or a step:

```ts
if (step.kind === 'final') {
  if (step.reasoning) {
    yield { kind: 'assistant_text', text: '', reasoning: step.reasoning }
  }
  yield { kind: 'final', text: step.text, meta: lastMeta }
  return
}
```

This keeps the `'final'` event shape unchanged. The hook (`useAgenticChat`) collects reasoning from `assistant_text` events into the corresponding step.

- [ ] **Step 7.4: Run the test, expect green**

Run: `npm run test:ci -- tests/application/run-agentic-chat.test.ts`
Expected: the new test passes. All other agentic tests still pass.

- [ ] **Step 7.5: Update `useAgenticChat` to attach reasoning to the running step**

Open `src/presentation/hooks/useAgenticChat.ts`. Find the event handler section (around line 47). Replace the `assistant_text` branch with:

```ts
} else if (ev.kind === 'assistant_text') {
  // Attach reasoning to the running step. If the event includes text, the step
  // also captures it; if text is empty (reasoning-only event) we still create
  // the step so the UI has something to render reasoning into.
  steps = [...steps, {
    kind: 'assistant_text',
    text: ev.text,
    ...(ev.reasoning ? { reasoning: ev.reasoning } : {}),
  }]
  setState({ status: 'running', iteration, mode, steps })
}
```

- [ ] **Step 7.6: Run typecheck and full suite**

Run: `npm run typecheck && npm run test:ci`
Expected: typecheck PASS (Chat.tsx may still have unrelated issues — fix in Task 11). Tests = 109 (108 + 1 new).

- [ ] **Step 7.7: Commit**

```bash
git add src/application/runAgenticChat.ts src/presentation/hooks/useAgenticChat.ts tests/application/run-agentic-chat.test.ts
git commit -m "$(cat <<'EOF'
feat(reasoning): propagate message.reasoning through the agentic loop

runAgenticChat captures msg.reasoning per iteration and emits an
assistant_text event carrying the reasoning before the tool_call or
final event fires. useAgenticChat appends this as an assistant_text
step on the running state, so the UI can render the thinking inline.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: i18n keys (EN + ES)

**Files:**
- Modify: `src/domain/i18n.ts`

- [ ] **Step 8.1: Add EN keys**

Open `src/domain/i18n.ts`. Find the EN block (`const EN = {`). Inside the `// Chat` section, after the last `chat.*` key, append:

```ts
  // Reasoning
  'chat.reasoning.label': '💭 Reasoning',
  'chat.reasoning.elapsed': '({sec}s)',
  'chat.reasoning.empty': '(no reasoning)',
  'chat.reasoning.thinking': 'Thinking…',
  'chat.reasoning.notSupported': 'This model does not support reasoning',
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

- [ ] **Step 8.2: Add ES keys**

In the same file, find the ES block (`const ES: Record<MessageKey, string> = {`). Inside the `// Chat` section, after the last `chat.*` key, append:

```ts
  // Reasoning
  'chat.reasoning.label': '💭 Razonamiento',
  'chat.reasoning.elapsed': '({sec}s)',
  'chat.reasoning.empty': '(sin razonamiento)',
  'chat.reasoning.thinking': 'Pensando…',
  'chat.reasoning.notSupported': 'Este modelo no soporta razonamiento',
  'chat.effort.label': 'Effort',
  'chat.effort.off': 'Off',
  'chat.effort.low': 'Bajo',
  'chat.effort.medium': 'Medio',
  'chat.effort.high': 'Alto',
  'chat.effort.tooltip': 'Esfuerzo de razonamiento. Más alto = más tokens de pensamiento.',
  'chat.effort.tooltipBoolean': 'Esta familia trata los niveles como on/off.',
  'chat.effort.tooltipTokenBudget': 'Se mapea a un presupuesto de max_tokens: bajo=500, medio=2000, alto=8000.',
  'chat.cost.reasoningTokens': '({n} pensando)',
```

- [ ] **Step 8.3: Run typecheck**

Run: `npm run typecheck`
Expected: PASS. The `MessageKey` type derives from EN, so adding to EN forces ES to provide the same keys.

- [ ] **Step 8.4: Commit**

```bash
git add src/domain/i18n.ts
git commit -m "$(cat <<'EOF'
i18n(reasoning): add reasoning + effort labels (EN+ES)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: ReasoningBlock component

**Files:**
- Create: `src/presentation/components/ReasoningBlock.tsx`

- [ ] **Step 9.1: Create the component**

Create `src/presentation/components/ReasoningBlock.tsx`:

```tsx
import { useEffect, useRef, useState } from 'react'
import { ChevronDownIcon, ChevronRightIcon } from 'lucide-react'
import { useT } from '@/presentation/hooks/useT'

type Props = {
  reasoning: string
  isStreaming: boolean
}

export function ReasoningBlock({ reasoning, isStreaming }: Props): React.JSX.Element | null {
  const t = useT()
  const [expanded, setExpanded] = useState<boolean>(isStreaming)
  const [elapsedMs, setElapsedMs] = useState(0)
  const startRef = useRef<number | null>(null)
  const prevStreamingRef = useRef(isStreaming)

  // Auto-collapse when streaming flips false (and the user hasn't manually toggled
  // since the stream started). Simplest behavior: collapse once on the streaming → done transition.
  useEffect(() => {
    if (prevStreamingRef.current && !isStreaming) {
      setExpanded(false)
    }
    prevStreamingRef.current = isStreaming
  }, [isStreaming])

  // Live timer while streaming.
  useEffect(() => {
    if (!isStreaming) { startRef.current = null; setElapsedMs(0); return }
    if (startRef.current === null) startRef.current = Date.now()
    setElapsedMs(Date.now() - startRef.current)
    const id = setInterval(() => {
      if (startRef.current !== null) setElapsedMs(Date.now() - startRef.current)
    }, 500)
    return () => clearInterval(id)
  }, [isStreaming])

  if (!reasoning && !isStreaming) return null

  const elapsedSec = Math.floor(elapsedMs / 1000)
  const headerLabel = isStreaming
    ? `${t('chat.reasoning.label')} · ${t('chat.reasoning.thinking')} ${t('chat.reasoning.elapsed', { sec: elapsedSec })}`
    : t('chat.reasoning.label')

  return (
    <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 max-w-[85%] overflow-hidden mb-2">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-amber-500/10 transition-colors text-amber-700 dark:text-amber-400"
      >
        {expanded
          ? <ChevronDownIcon className="size-3.5 flex-shrink-0" />
          : <ChevronRightIcon className="size-3.5 flex-shrink-0" />}
        <span className="font-medium">{headerLabel}</span>
      </button>
      {expanded ? (
        <div className="px-3 py-2 border-t border-amber-500/20 max-h-64 overflow-auto">
          <pre className="font-mono text-[11px] text-foreground whitespace-pre-wrap break-words">
            {reasoning || <span className="italic text-muted-foreground">{t('chat.reasoning.empty')}</span>}
          </pre>
        </div>
      ) : null}
    </div>
  )
}
```

- [ ] **Step 9.2: Run typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 9.3: Commit**

```bash
git add src/presentation/components/ReasoningBlock.tsx
git commit -m "$(cat <<'EOF'
feat(reasoning): add ReasoningBlock component

Collapsible block with live elapsed timer while streaming. Auto-collapses
on streaming → done transition. Renders as null when there's no reasoning
and the stream isn't active. Monospace pre with max-h-64 overflow.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: EffortSelector component

**Files:**
- Create: `src/presentation/components/EffortSelector.tsx`

- [ ] **Step 10.1: Create the component**

Create `src/presentation/components/EffortSelector.tsx`:

```tsx
import { detectReasoningFamily, type Effort, type ReasoningFamily } from '@/domain/reasoning'
import { useT } from '@/presentation/hooks/useT'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/presentation/components/ui/select'

type Props = {
  model: string
  value: Effort
  onChange: (next: Effort) => void
}

const ORDER: readonly Effort[] = ['off', 'low', 'medium', 'high'] as const

const TOOLTIP_BY_FAMILY: Readonly<Record<ReasoningFamily, 'chat.effort.tooltip' | 'chat.effort.tooltipBoolean' | 'chat.effort.tooltipTokenBudget'>> = {
  enum_effort:    'chat.effort.tooltip',
  boolean_toggle: 'chat.effort.tooltipBoolean',
  token_budget:   'chat.effort.tooltipTokenBudget',
}

export function EffortSelector({ model, value, onChange }: Props): React.JSX.Element | null {
  const t = useT()
  const family = detectReasoningFamily(model)
  if (family === undefined) return null

  const labelFor = (e: Effort): string => {
    switch (e) {
      case 'off':    return t('chat.effort.off')
      case 'low':    return t('chat.effort.low')
      case 'medium': return t('chat.effort.medium')
      case 'high':   return t('chat.effort.high')
    }
  }

  return (
    <div className="flex items-center gap-2 min-w-0" title={t(TOOLTIP_BY_FAMILY[family])}>
      <span className="hidden sm:inline text-xs text-muted-foreground flex-shrink-0">
        💭 {t('chat.effort.label')}
      </span>
      <Select value={value} onValueChange={(v) => onChange(v as Effort)}>
        <SelectTrigger size="sm" className="h-9 min-w-[6rem]" aria-label={t('chat.effort.label')}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {ORDER.map((e) => (
            <SelectItem key={e} value={e}>{labelFor(e)}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
```

- [ ] **Step 10.2: Run typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 10.3: Commit**

```bash
git add src/presentation/components/EffortSelector.tsx
git commit -m "$(cat <<'EOF'
feat(reasoning): add EffortSelector component

Dropdown with Off/Low/Medium/High options, hidden when the current
model has no detected reasoning family. Tooltip varies per family
to clarify how the level maps (enum, on/off, or max_tokens budget).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: CostBadge — surface reasoning tokens

**Files:**
- Modify: `src/presentation/components/CostBadge.tsx`

- [ ] **Step 11.1: Inspect the current CostBadge to know its existing shape**

Run: `cat src/presentation/components/CostBadge.tsx`

You'll see how it formats `meta` (likely cost + tokens in/out). Plan: append `(💭 N)` after the existing tokens segment when `meta.reasoningTokens > 0`.

- [ ] **Step 11.2: Add reasoning-tokens segment to the badge**

Open `src/presentation/components/CostBadge.tsx`. The exact existing JSX depends on the current implementation; follow this pattern, adapting names to whatever the current file uses:

```tsx
// In the existing function, after rendering tokensInput / tokensOutput, before the closing wrapper:
{meta?.reasoningTokens && meta.reasoningTokens > 0 ? (
  <span
    className="text-amber-600 dark:text-amber-400"
    title="Reasoning tokens (included in completion_tokens, billed at the model's output price)"
  >
    {' '}{t('chat.cost.reasoningTokens', { n: meta.reasoningTokens })}
  </span>
) : null}
```

If `CostBadge` doesn't already use `useT`, import it: `import { useT } from '@/presentation/hooks/useT'` and call `const t = useT()` inside the component.

- [ ] **Step 11.3: Run typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 11.4: Commit**

```bash
git add src/presentation/components/CostBadge.tsx
git commit -m "$(cat <<'EOF'
feat(reasoning): show reasoning_tokens in CostBadge

Append a (💭 N) segment when meta.reasoningTokens > 0. Tooltip
explains the tokens are included in completion_tokens and billed
at the model's output price.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: Chat.tsx integration — wire effort, selector, and ReasoningBlock

**Files:**
- Modify: `src/presentation/routes/Chat.tsx`

- [ ] **Step 12.1: Add imports**

Open `src/presentation/routes/Chat.tsx`. At the top of the imports block, add:

```ts
import { EffortSelector } from '@/presentation/components/EffortSelector'
import { ReasoningBlock } from '@/presentation/components/ReasoningBlock'
import { buildReasoningPayload, type Effort } from '@/domain/reasoning'
```

- [ ] **Step 12.2: Read `effort` from the chat store and add a `setEffort` callback**

Find the section where `chat`, `entries`, `model`, `toolsOn`, and the three `useCallback` setters are defined (lines ~25-50 of the current file). Right after `setToolsOn`, add:

```ts
const effort = chat.effort
const setEffort = useCallback((next: Effort): void => {
  if (!agent) return
  const current = useChatStore.getState().byAgent[agent.id] ?? DEFAULT_CHAT
  setChatBucket(agent.id, { ...current, effort: next })
}, [agent, setChatBucket])
```

- [ ] **Step 12.3: Merge reasoning payload into the request before stream/agentic**

Find the `send()` function. Replace the section that builds `nextMessages` and dispatches to `agentic` or `stream`:

```ts
const send = (): void => {
  const trimmed = input.trim()
  if (!trimmed || busy) return
  const userEntry: ConversationEntry = { kind: 'msg', role: 'user', content: trimmed }
  const nextEntries = [...entries, userEntry]
  setEntries(nextEntries)
  setInput('')
  const nextMessages: readonly ChatMessage[] = [...chatMessages, { role: 'user', content: trimmed }]
  const reasoningPayload = buildReasoningPayload(model, effort)
  if (toolsOn) {
    void agentic.start({ model, messages: nextMessages, ...reasoningPayload })
  } else {
    void stream.start({
      model,
      messages: nextMessages.map((m) => ({ role: m.role, content: m.content })),
      stream: true,
      ...reasoningPayload,
    })
  }
}
```

NOTE: `agentic.start` and `stream.start` may have signatures that don't accept arbitrary spread fields. Check `useAgenticChat.start` and `useChatStream.start`:
- `useChatStream.start` takes a `ChatCompletionRequest` — already accepts `reasoning` and `include_reasoning` after Task 2.
- `useAgenticChat.start` takes `{ model: string; messages: readonly ChatMessage[] }`. We need to extend it to also accept the reasoning payload and pass it through to `runAgenticChat`. Do that next.

- [ ] **Step 12.4: Extend `useAgenticChat.start` and `runAgenticChat` to accept reasoning fields**

Open `src/presentation/hooks/useAgenticChat.ts`. Find `start` (around line 25). Change the signature to accept the reasoning fields and pass them to `runAgenticChat`:

```ts
const start = useCallback(async (params: {
  model: string
  messages: readonly ChatMessage[]
  reasoning?: { effort?: 'low'|'medium'|'high'; max_tokens?: number }
  include_reasoning?: boolean
}) => {
  if (!agent) return
  abortRef.current?.abort()
  const controller = new AbortController()
  abortRef.current = controller
  let steps: readonly AgenticStep[] = []
  let iteration = 0
  let mode: DispatchMode = 'native'
  setState({ status: 'running', iteration, mode, steps })

  try {
    const gen = container.useCases.runAgenticChat(agent.id, agent.apiKey, {
      model: params.model,
      messages: params.messages,
      signal: controller.signal,
      ...(params.reasoning ? { reasoning: params.reasoning } : {}),
      ...(params.include_reasoning ? { include_reasoning: params.include_reasoning } : {}),
    })
    // ... rest unchanged
```

Then open `src/application/useCases.ts`. Find `runAgenticChat` in the `UseCases` interface (around line 56). Extend the params type:

```ts
runAgenticChat(
  agent: AgentId, key: ApiKey,
  params: Readonly<{
    model: string
    messages: readonly ChatMessage[]
    maxIterations?: number
    signal?: AbortSignal
    reasoning?: { effort?: 'low'|'medium'|'high'; max_tokens?: number }
    include_reasoning?: boolean
  }>,
): AsyncGenerator<AgenticEvent, void, void>
```

In the implementation of `runAgenticChat` in `useCases.ts` body, pass through the new fields to `runAgenticChatImpl` (the function from `application/runAgenticChat.ts`).

Then open `src/application/runAgenticChat.ts`. Extend `RunAgenticParams` to accept reasoning, and inside `runIteration`, merge into the `req`:

```ts
export type RunAgenticParams = Readonly<{
  model: string
  messages: readonly ChatMessage[]
  maxIterations?: number
  signal?: AbortSignal
  mode?: DispatchMode
  reasoning?: { effort?: 'low'|'medium'|'high'; max_tokens?: number }
  include_reasoning?: boolean
}>
```

In `runIteration`, when building `req: ChatCompletionRequest`:

```ts
const req: ChatCompletionRequest = {
  model: params.model,
  messages: messages as ChatCompletionRequest['messages'],
  stream: false,
  ...(mode === 'native' ? { tools: CHAT_TOOLS.map((t) => t.openai), tool_choice: 'auto' as const } : {}),
  ...(params.reasoning ? { reasoning: params.reasoning } : {}),
  ...(params.include_reasoning ? { include_reasoning: params.include_reasoning } : {}),
}
```

You'll need to thread `params` (currently only `model` and `signal` are passed to `runIteration`). Replace the `runIteration` signature and the call site:

```ts
async function runIteration(
  deps: RunAgenticDeps,
  params: { model: string; signal?: AbortSignal; reasoning?: ...; include_reasoning?: boolean },
  mode: DispatchMode,
  ...
)

// Call site in runAgenticChat:
const itParams: { model: string; signal?: AbortSignal; reasoning?: ...; include_reasoning?: boolean } = {
  model: params.model,
  ...(params.signal ? { signal: params.signal } : {}),
  ...(params.reasoning ? { reasoning: params.reasoning } : {}),
  ...(params.include_reasoning ? { include_reasoning: params.include_reasoning } : {}),
}
const { step, meta } = await runIteration(deps, itParams, mode, userConversation, toolHistory)
```

- [ ] **Step 12.5: Mount `EffortSelector` in the Chat topbar**

In `Chat.tsx`, find the topbar Card (around line 149). It currently has `ModelPicker`, `Tools` button, `ToolsViewer`, `CostBadge`, and `Clear`. Add `EffortSelector` between `ToolsViewer` and `CostBadge`:

```tsx
<ToolsViewer />
<EffortSelector model={model} value={effort} onChange={setEffort} />
<CostBadge meta={doneMeta} />
```

- [ ] **Step 12.6: Render `ReasoningBlock` in `Bubble`**

In `Chat.tsx`, find the `Bubble` component (around line 259). Add a `reasoning?: string` prop and an `isStreaming?: boolean` prop:

```tsx
function Bubble({ role, content, reasoning, streaming = false, t }: { role: Role; content: string; reasoning?: string; streaming?: boolean; t: TFn }): React.JSX.Element {
  const isUser = role === 'user'
  const isAssistant = role === 'assistant'
  // ... existing rendering ...
  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : ''}`}>
      <div className={...}>{isUser ? 'U' : isAssistant ? 'A' : 'S'}</div>
      <div className={`flex-1 min-w-0 ${isUser ? 'flex flex-col items-end' : ''}`}>
        <div className="text-[10px] text-muted-foreground mb-1">
          {roleLabel}{streaming ? ` · ${t('chat.streaming')}` : ''}
        </div>
        {isAssistant && (reasoning || streaming) ? (
          <ReasoningBlock reasoning={reasoning ?? ''} isStreaming={streaming} />
        ) : null}
        <div className={...}>
          {content || (streaming ? <span className="text-muted-foreground italic">{t('chat.thinking')}</span> : null)}
        </div>
      </div>
    </div>
  )
}
```

Update the call sites of `<Bubble ... />` to pass `reasoning`:

```tsx
{entries.map((e, i) => e.kind === 'msg'
  ? <Bubble key={i} role={e.role} content={e.content} reasoning={e.reasoning} t={t} />
  : <AgenticBlock key={i} steps={e.steps} finalText={e.finalText} t={t} />
)}

{stream.state.status === 'streaming' ? (
  <Bubble
    role="assistant"
    content={stream.state.partial}
    reasoning={stream.state.partialReasoning}
    streaming
    t={t}
  />
) : null}
```

- [ ] **Step 12.7: Render `ReasoningBlock` inside `AgenticBlock` for each step**

In `Chat.tsx`, find the `AgenticBlock` component (around line 294). For each step where `s.kind === 'assistant_text'` and `s.reasoning` is present, render `<ReasoningBlock>` BEFORE the existing text rendering:

```tsx
{steps.map((s, i) => {
  if (s.kind === 'tool') return <ToolStep key={i} step={s} t={t} />
  if (s.kind === 'mode_fallback') {
    return (
      <div key={i} className="rounded-xl border border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400 px-3 py-2 text-xs max-w-[85%]">
        ⚠ {t('chat.modeFallback', { from: s.from, to: s.to })} · {s.reason}
      </div>
    )
  }
  if (s.kind === 'assistant_text') {
    return (
      <div key={i}>
        {s.reasoning ? <ReasoningBlock reasoning={s.reasoning} isStreaming={false} /> : null}
        {s.text ? (
          <div className="rounded-xl px-3 py-2 text-sm bg-muted/40 text-foreground whitespace-pre-wrap break-words max-w-[85%]">
            {s.text}
          </div>
        ) : null}
      </div>
    )
  }
  return null
})}
```

(Replace the existing block that handles `s.text`, since the new handler covers it.)

- [ ] **Step 12.8: Run typecheck and tests**

Run: `npm run typecheck && npm run test:ci`
Expected: typecheck PASS, all tests pass (109+).

- [ ] **Step 12.9: Smoke check the dev server**

Run: `curl -sI http://localhost:4310/ | head -1`
Expected: `HTTP/1.1 200 OK`. (The server has been running from earlier sessions; if not, start it with `npm run dev -- --port 4310` in the background.)

- [ ] **Step 12.10: Commit**

```bash
git add src/presentation/routes/Chat.tsx src/presentation/hooks/useAgenticChat.ts src/application/useCases.ts src/application/runAgenticChat.ts
git commit -m "$(cat <<'EOF'
feat(reasoning): wire effort selector and reasoning block into Chat

Chat.tsx now reads effort from the per-agent store, mounts the
EffortSelector in the topbar (visible only for compatible models),
merges buildReasoningPayload(model, effort) into stream and agentic
requests, and renders ReasoningBlock above content in both Bubble
and AgenticBlock. Threaded reasoning through useAgenticChat.start →
useCases.runAgenticChat → runAgenticChat → runIteration so the
parameter reaches the underlying chat completion.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 13: Final verification

- [ ] **Step 13.1: Full test suite**

Run: `npm run test:ci`
Expected: 109+ tests pass (87 base + 14 reasoning + 4 transport + 3 chat-store + 1 agentic = 109 minimum).

- [ ] **Step 13.2: Typecheck**

Run: `npm run typecheck`
Expected: PASS, zero errors.

- [ ] **Step 13.3: Lint (no new errors)**

Run: `npm run lint 2>&1 | tail -25`
Expected: same baseline (8 warnings — 4 in `runAgenticChat.ts`, 2 in `McpClient.ts`, 1 in `useAgenticChat.ts`, 1 in `Transactions.tsx`). Zero new warnings or errors. If new warnings appear in `useChatStore.ts`, `Chat.tsx`, `useChatStream.ts`, `useAgenticChat.ts`, or any of the new components, fix them inline.

- [ ] **Step 13.4: Manual end-to-end smoke**

Walk through this checklist on `http://skywalker:4310`:

1. **No-reasoning model** (e.g., `google/gemini-2.5-flash-lite`): `/chat` topbar should NOT show the EffortSelector. Sending a message works exactly as before.
2. **Switch to `anthropic/claude-sonnet-4`**: EffortSelector appears with current value (default `'off'`). Tooltip says "Reasoning effort. Higher = more thinking tokens."
3. **Set effort to `high`, send "Why is 0.1 + 0.2 not exactly 0.3?"**: ReasoningBlock appears in the assistant bubble, expanded, with the live elapsed timer. Once content starts streaming, both reasoning and content render. When done, ReasoningBlock collapses automatically.
4. **Reload page**: the conversation reappears with the reasoning persisted (collapsed by default in history).
5. **Switch to `deepseek/deepseek-r1`**: EffortSelector still shows but tooltip says "This family treats levels as on/off." Send a message: include_reasoning is sent as `true`; reasoning text appears.
6. **Switch to `google/gemini-2.5-flash-thinking`**: tooltip says "Maps to a max_tokens budget: low=500, medium=2000, high=8000." Send: `reasoning.max_tokens=8000` is sent.
7. **CostBadge**: after a turn that returns `reasoning_tokens > 0`, the badge shows `(💭 N)` next to the regular tokens.
8. **Switch from a compatible to an incompatible model**: EffortSelector disappears; the persisted effort value remains. Switch back: selector reappears with the saved value.
9. **Effort = off + compatible model**: no reasoning is sent; ReasoningBlock not rendered.
10. **Stop button mid-stream**: cancels both content and reasoning streams; ReasoningBlock shows whatever was captured up to the abort.
11. **Agentic mode** (Tools on) with `claude-sonnet-4` and effort=high: each turn the model takes can have its own reasoning rendered above the assistant text in `AgenticBlock`.

If any step fails, file a bug + fix with a focused commit and re-run.

---

## Self-Review

**Spec coverage check (against `2026-04-29-reasoning-design.md`):**

- ✅ Hardcoded prefix list with family enum → Task 1.
- ✅ Unified `Off/Low/Medium/High` selector with per-family translation → Tasks 1 + 10.
- ✅ Reasoning block above content → Task 9 + 12.
- ✅ Default expanded during stream → collapsed when done → Task 9.
- ✅ Effort persists per-agent (not per-model) on model switch → Tasks 5 + 12.
- ✅ Schema extensions (request, message, response usage) → Tasks 2 + 4.
- ✅ Stream chunk variant `reasoning_delta` and `done.fullReasoning` → Tasks 2 + 4 + 6.
- ✅ Domain types extension (`ConversationEntry`, `AgenticStep`) → Task 3.
- ✅ Persistence with backward compat → Tasks 3 + 5.
- ✅ Transport: SSE parsing + non-stream usage extraction → Task 4.
- ✅ Agentic loop captures reasoning per iteration → Task 7.
- ✅ Hooks accumulate reasoning → Tasks 6 + 7.
- ✅ Components: ReasoningBlock + EffortSelector → Tasks 9 + 10.
- ✅ CostBadge segment → Task 11.
- ✅ Chat.tsx integration → Task 12.
- ✅ i18n (EN+ES) → Task 8.
- ✅ Tests for domain, transport, chat store, agentic → Tasks 1, 4, 5, 7.
- ✅ Manual smoke checklist → Task 13.

**Placeholder scan:** No "TBD"/"TODO"/vague instructions. Every code-changing step shows the exact code or names the exact transformation.

**Type consistency check:**
- `Effort` defined in Task 1, used consistently in Tasks 5, 6, 10, 12.
- `ReasoningFamily` defined in Task 1, used in Task 10 only.
- `buildReasoningPayload(model: string, effort: Effort): Record<string, unknown>` consistent across Tasks 1, 12.
- `ChatStreamChunk` variants (`delta`, `reasoning_delta`, `done`) consistent across Tasks 2, 4, 6.
- `ChatPersisted.effort: Effort` consistent across Tasks 5, 12.
- `ConversationEntry.reasoning?: string` and `AgenticStep.reasoning?: string` consistent across Tasks 3, 7, 12.
- `meta.reasoningTokens?: number` consistent across Tasks 2, 4, 11.
- `assistant_text` event has `text: string; reasoning?: string` consistent across Tasks 7 (definition) and 12 (consumption).

No inconsistencies found.

---

## Out of scope (deferred)

- Markdown rendering of reasoning text.
- Edit/highlight/copy of reasoning content.
- Cancel-mid-thinking as a dedicated UI action (existing Stop covers it).
- Auto-detection of reasoning support via API (hardcoded list updated manually).
- Effort memory per-model (one effort per agent regardless of which model).
- Cost preview ("if I set effort=high, this will likely cost ~$X").
