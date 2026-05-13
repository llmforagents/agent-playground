# Council Tools Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Council drafters access to `google_search`, `google_news`, and `fetch_html` MCP tools, gated per-plan via a `tools: { stages, maxCallsPerDrafter }` config that mirrors how `debateRounds` already works.

**Architecture:** Hexagonal layers stay intact. Domain gains a new config struct + 4 new `CouncilEvent` variants. Application gets a new helper `runDrafterTurnWithTools` that wraps `sdk.chat.conversation()` (analogous to `runAgenticChat`), and `runCouncilChat` branches per-stage: with tools = use the new helper; without tools = keep today's `ChatPort.completionStream`. Infrastructure is untouched. Presentation: the persisted snapshot already stores `events: CouncilEvent[]` (forward-compatible with the new variants — no migration needed). The reducer that turns events into per-slot UI buckets (`reduceEvents` in `CouncilStream.tsx`) is extended to accumulate `toolCalls` into `DraftBucket` / `DebateBucket`. `CouncilSetup` gets two new controls, `CouncilHistory` shows a count derived directly from `run.events`, and a new `CouncilToolPanel` component renders the per-bucket tool list.

**Tech Stack:** React 19, TypeScript 6 (strict), Zustand (persist), `@llmforagents/sdk` v2.3.2, Vitest 4, Radix UI Dialog, Tailwind v4.

**Reference spec:** [`docs/superpowers/specs/2026-05-13-council-tools-design.md`](../specs/2026-05-13-council-tools-design.md)

**Baseline verification commands** (run between every task):

```bash
npm run typecheck       # tsc --noEmit
npm run lint            # eslint src tests
npm run test:ci         # vitest run (137 tests baseline)
```

The plan keeps `test:ci` green at every commit. Commits use the repo convention: `feat(council):` / `test(council):` / `chore(council):`.

---

## Task 1: Domain — extend `council.ts` with tools config

**Files:**
- Modify: `src/domain/council.ts`

- [ ] **Step 1: Add the new types and constants near the top of the file**

Insert after `export const MAX_DEBATE_ROUNDS = 5 as const`:

```ts
export type CouncilStage = 'drafts' | 'debate'

export const COUNCIL_STAGE_ORDER: ReadonlyArray<CouncilStage> = ['drafts', 'debate'] as const

export const COUNCIL_TOOL_NAMES = ['google_search', 'google_news', 'fetch_html'] as const
export type CouncilToolName = (typeof COUNCIL_TOOL_NAMES)[number]

export const MIN_TOOL_CALLS_PER_DRAFTER = 0 as const
export const MAX_TOOL_CALLS_PER_DRAFTER = 5 as const

export type CouncilToolsConfig = Readonly<{
  stages: ReadonlyArray<CouncilStage>
  maxCallsPerDrafter: number
}>
```

- [ ] **Step 2: Extend the `CouncilConfig` type to include `tools`**

Replace the existing definition:

```ts
export type CouncilConfig = Readonly<{
  drafters: ReadonlyArray<Model>
  chairman: Model
  debateRounds: number
  tools: CouncilToolsConfig
}>
```

- [ ] **Step 3: Add `tools` to every entry in `COUNCIL_PLANS`**

Update the const so each plan now carries a `tools` block. Replace the existing object literal exactly:

```ts
export const COUNCIL_PLANS: Readonly<Record<CouncilPlan, CouncilConfig>> = {
  lite: {
    drafters: [
      Model('google/gemini-2.5-flash-lite'),
      Model('anthropic/claude-haiku-4.5'),
      Model('openai/gpt-5-mini'),
    ],
    chairman: Model('google/gemini-2.5-flash-lite'),
    debateRounds: PLAN_DEFAULT_ROUNDS.lite,
    tools: { stages: [], maxCallsPerDrafter: 0 },
  },
  pro: {
    drafters: [
      Model('deepseek/deepseek-v4-pro'),
      Model('z-ai/glm-5.1'),
      Model('moonshotai/kimi-k2.6'),
    ],
    chairman: Model('anthropic/claude-sonnet-4.6'),
    debateRounds: PLAN_DEFAULT_ROUNDS.pro,
    tools: { stages: ['drafts'], maxCallsPerDrafter: 3 },
  },
  power: {
    drafters: [
      Model('anthropic/claude-opus-4.7'),
      Model('openai/gpt-5.2'),
      Model('google/gemini-2.5-pro'),
    ],
    chairman: Model('anthropic/claude-opus-4.7'),
    debateRounds: PLAN_DEFAULT_ROUNDS.power,
    tools: { stages: ['drafts', 'debate'], maxCallsPerDrafter: 3 },
  },
}
```

- [ ] **Step 4: Extend `estimateCouncilCostCents` with the tools term**

Replace the entire function body keeping the existing premium / drafter / synthesis logic and adding a tools term at the end before `return`:

```ts
export function estimateCouncilCostCents(config: CouncilConfig): number {
  const isPremium = (m: Model): boolean => {
    const s = String(m).toLowerCase()
    return (
      s.includes('opus') ||
      s.includes('sonnet') ||
      /gpt-5\.\d/.test(s) ||
      /gemini.*-pro/.test(s) ||
      /o3(-pro)?$/.test(s)
    )
  }
  const drafterUnit = (m: Model): number => (isPremium(m) ? 8 : 1)
  const drafterTotal = config.drafters.reduce((sum, m) => sum + drafterUnit(m), 0)
  const callsPerDrafterStage = Math.max(1, config.debateRounds)
  const draftAndDebateCost = drafterTotal * callsPerDrafterStage
  const synthesisCost = isPremium(config.chairman) ? 15 : 2

  // Tools term: each tool call ~ $0.0012 (0.12¢).
  // 'drafts' adds 1 stage of calls per drafter. 'debate' adds debateRounds stages.
  const draftsMultiplier = config.tools.stages.includes('drafts') ? 1 : 0
  const debateMultiplier = config.tools.stages.includes('debate') ? config.debateRounds : 0
  const totalToolCalls =
    config.drafters.length * config.tools.maxCallsPerDrafter * (draftsMultiplier + debateMultiplier)
  const toolsCostCents = Math.round(totalToolCalls * 0.12)

  return draftAndDebateCost + synthesisCost + toolsCostCents
}
```

- [ ] **Step 5: Run typecheck to verify the file compiles**

Run: `npm run typecheck`
Expected: **PASS** (no errors). If anything fails, callers of `CouncilConfig` exist that construct it without `tools` — these will be fixed in later tasks. If typecheck fails outside of test files, stop and report.

- [ ] **Step 6: Commit**

```bash
git add src/domain/council.ts
git commit -m "$(cat <<'EOF'
feat(council): add tools config to CouncilConfig and presets

Adds CouncilStage, CouncilToolsConfig, COUNCIL_TOOL_NAMES, and tools
defaults per plan (lite=off, pro=drafts/3, power=drafts+debate/3).
estimateCouncilCostCents now accounts for tool-call cost.
EOF
)"
```

---

## Task 2: Domain — extend `councilEvents.ts` with four new variants

**Files:**
- Modify: `src/domain/councilEvents.ts`

- [ ] **Step 1: Update the JSDoc event-flow comment to mention tool events**

Replace the top JSDoc block exactly:

```ts
/**
 * Event flow per run (success):
 *   council_started
 *   - draft_started ×N (parallel)
 *   - draft_delta × many (per slot, streamed)
 *   - draft_tool_call / draft_tool_result × maxCallsPerDrafter (when tools enabled)
 *   - draft_done ×N
 *   - debate_round_started (round=1, round=2, …)
 *     - debate_started ×N
 *     - debate_delta × many
 *     - debate_tool_call / debate_tool_result × maxCallsPerDrafter
 *     - debate_done ×N
 *   - synthesis_started
 *   - synthesis_delta × many
 *   - synthesis_done
 *   - council_done
 *
 * Each *_tool_call has a matching *_tool_result correlated by `callId`.
 * round numbers are 1-indexed for user-facing display.
 */
```

- [ ] **Step 2: Add a top-level import for the new type**

Add this import at the top (under the existing imports):

```ts
import type { CouncilToolName } from './council'
```

- [ ] **Step 3: Add the four new event variants to the `CouncilEvent` union**

Insert these four variants immediately after the existing `draft_failed` variant (before the `// --- debate (multi-round) ---` comment for the first two, and after the existing `debate_failed` variant for the last two — keep grouping):

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
```

And after `debate_failed`:

```ts
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

- [ ] **Step 4: Run typecheck**

Run: `npm run typecheck`
Expected: **PASS**.

- [ ] **Step 5: Commit**

```bash
git add src/domain/councilEvents.ts
git commit -m "feat(council): add tool_call/tool_result event variants for drafts and debate"
```

---

## Task 3: Domain — extend `i18n.ts` with 7 new keys × EN+ES

**Files:**
- Modify: `src/domain/i18n.ts`

- [ ] **Step 1: Find the EN council section**

Run: `grep -n "'council.expensiveConfirm'" src/domain/i18n.ts`
Expected output: two lines (one EN, one ES). Note the line numbers — both blocks need the same set of new keys.

- [ ] **Step 2: Add the new keys to the EN council block**

In the EN block (around line ~440-480), add these keys (placement: anywhere within the council group, but together; pick a spot right after `'council.expensiveConfirm'`):

```ts
  'council.toolsLabel': 'Tools (research)',
  'council.toolsStagesLabel': 'Enable on',
  'council.toolsStageDrafts': 'Drafts',
  'council.toolsStageDebate': 'Debate',
  'council.toolsMaxCallsLabel': 'Max calls per drafter',
  'council.toolsAvailable': 'Available: google_search, google_news, fetch_html',
  'council.toolsNoStages': 'No stages enabled — slider has no effect',
  'council.toolsCounter': '{search} search · {news} news · {fetch} fetch',
```

- [ ] **Step 3: Add the matching ES translations**

In the ES block (around line ~915-955), at the equivalent position:

```ts
  'council.toolsLabel': 'Tools (investigación)',
  'council.toolsStagesLabel': 'Habilitar en',
  'council.toolsStageDrafts': 'Drafts',
  'council.toolsStageDebate': 'Debate',
  'council.toolsMaxCallsLabel': 'Llamadas máx por agente',
  'council.toolsAvailable': 'Disponibles: google_search, google_news, fetch_html',
  'council.toolsNoStages': 'Sin etapas habilitadas — el slider no surte efecto',
  'council.toolsCounter': '{search} search · {news} news · {fetch} fetch',
```

- [ ] **Step 4: Run typecheck — the `MessageKey` type auto-derives from the EN catalog**

Run: `npm run typecheck`
Expected: **PASS**. If the EN and ES catalogs disagree on keys, typecheck fails — fix any typos.

- [ ] **Step 5: Commit**

```bash
git add src/domain/i18n.ts
git commit -m "feat(council): add i18n keys for tools UI (EN + ES)"
```

---

## Task 4: Domain — tests for council config and cost estimate

**Files:**
- Create: `tests/domain/council-tools.test.ts`
- Modify: `tests/domain/council.test.ts`

- [ ] **Step 1: Create the new test file for `COUNCIL_TOOL_NAMES`**

Write `tests/domain/council-tools.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  COUNCIL_TOOL_NAMES,
  MIN_TOOL_CALLS_PER_DRAFTER,
  MAX_TOOL_CALLS_PER_DRAFTER,
  COUNCIL_PLANS,
} from '@/domain/council'

describe('council tools constants', () => {
  it('exposes exactly the three research tools, in order', () => {
    expect([...COUNCIL_TOOL_NAMES]).toEqual([
      'google_search',
      'google_news',
      'fetch_html',
    ])
  })

  it('caps tool calls per drafter between 0 and 5', () => {
    expect(MIN_TOOL_CALLS_PER_DRAFTER).toBe(0)
    expect(MAX_TOOL_CALLS_PER_DRAFTER).toBe(5)
  })

  it('lite plan disables tools by default', () => {
    expect(COUNCIL_PLANS.lite.tools).toEqual({ stages: [], maxCallsPerDrafter: 0 })
  })

  it('pro plan enables tools in drafts only with cap 3', () => {
    expect(COUNCIL_PLANS.pro.tools.stages).toEqual(['drafts'])
    expect(COUNCIL_PLANS.pro.tools.maxCallsPerDrafter).toBe(3)
  })

  it('power plan enables tools in drafts and debate with cap 3', () => {
    expect([...COUNCIL_PLANS.power.tools.stages]).toEqual(['drafts', 'debate'])
    expect(COUNCIL_PLANS.power.tools.maxCallsPerDrafter).toBe(3)
  })
})
```

- [ ] **Step 2: Run the new test file**

Run: `npm run test:ci -- tests/domain/council-tools.test.ts`
Expected: **PASS** (5 passing tests).

- [ ] **Step 3: Extend `tests/domain/council.test.ts` with cost-estimate cases**

Open `tests/domain/council.test.ts`, find the existing describe block for `estimateCouncilCostCents`, and add these `it()` blocks inside it. (If the describe is named differently, add them at the bottom of the file inside any `describe('council', ...)`.)

```ts
  it('tools cost is zero when no stages are enabled', () => {
    const base = COUNCIL_PLANS.lite
    expect(estimateCouncilCostCents(base)).toBeGreaterThan(0)
    // Lite has stages=[], so the tools term contributes 0.
    const withoutTools = { ...base, tools: { stages: [], maxCallsPerDrafter: 0 } }
    expect(estimateCouncilCostCents(withoutTools)).toBe(estimateCouncilCostCents(base))
  })

  it('tools cost scales with stages and maxCallsPerDrafter', () => {
    const draftsOnly = {
      ...COUNCIL_PLANS.lite,
      tools: { stages: ['drafts'] as const, maxCallsPerDrafter: 3 },
    }
    const draftsAndDebate = {
      ...COUNCIL_PLANS.lite,
      tools: { stages: ['drafts', 'debate'] as const, maxCallsPerDrafter: 3 },
    }
    const liteRounds = COUNCIL_PLANS.lite.debateRounds
    const drafters = COUNCIL_PLANS.lite.drafters.length

    const expectedDraftsOnly = Math.round(drafters * 3 * 1 * 0.12)
    const expectedBoth = Math.round(drafters * 3 * (1 + liteRounds) * 0.12)

    expect(estimateCouncilCostCents(draftsAndDebate) - estimateCouncilCostCents(draftsOnly))
      .toBe(expectedBoth - expectedDraftsOnly)
  })

  it('power preset full-tools run adds at most ~5¢ over a tools-disabled version', () => {
    const withTools = COUNCIL_PLANS.power
    const withoutTools = { ...withTools, tools: { stages: [], maxCallsPerDrafter: 0 } }
    const delta = estimateCouncilCostCents(withTools) - estimateCouncilCostCents(withoutTools)
    expect(delta).toBeGreaterThan(0)
    expect(delta).toBeLessThanOrEqual(8) // 4 stages × 3 drafters × 3 calls × 0.12 = 4.32¢, rounded
  })
```

- [ ] **Step 4: Run the extended test file**

Run: `npm run test:ci -- tests/domain/council.test.ts`
Expected: **PASS** (all existing tests + the 3 new ones).

- [ ] **Step 5: Commit**

```bash
git add tests/domain/council-tools.test.ts tests/domain/council.test.ts
git commit -m "test(council): cover tools constants, plan defaults, and cost estimate"
```

---

## Task 5: Application — extend `buildCouncilPrompts.ts` with `*WithTools` variants

**Files:**
- Modify: `src/application/buildCouncilPrompts.ts`
- Modify: `tests/application/buildCouncilPrompts.test.ts`

- [ ] **Step 1: Add the imports for the new types**

At the top of `src/application/buildCouncilPrompts.ts`, add:

```ts
import type { CouncilToolName } from '@/domain/council'
```

- [ ] **Step 2: Define the tools instructions block as a top-level constant**

Add this near the existing `LANGUAGE_DIRECTIVE`, immediately after it:

```ts
function buildToolsBlock(allowedTools: ReadonlyArray<CouncilToolName>, maxCalls: number): string {
  const toolDescriptions: Record<CouncilToolName, string> = {
    google_search: 'google_search: Google web search for facts, dates, prices, or finding URLs',
    google_news: 'google_news: recent news articles with date and source',
    fetch_html: 'fetch_html: full HTML of a URL when you need raw content (set auto_fallback:true on blocked sites)',
  }
  const list = allowedTools.map((t) => `- ${toolDescriptions[t]}`).join('\n')
  return `You have access to these tools to research the question:
${list}

USE TOOLS WHEN:
- The task mentions current events, dates, prices, or anything time-sensitive
- You need to verify a specific URL or quote
- You'd otherwise hallucinate facts

DO NOT use tools when the task is purely opinion, analysis, or code that doesn't need fresh data.

Budget: max ${maxCalls} tool calls. Each one costs money. Prefer one good query over several.`
}
```

- [ ] **Step 3: Add `buildDrafterMessagesWithTools`**

Append to the bottom of the file:

```ts
export function buildDrafterMessagesWithTools(
  userTask: string,
  allowedTools: ReadonlyArray<CouncilToolName>,
  maxCalls: number,
): ReadonlyArray<ChatMessage> {
  const system = `${DRAFTER_SYSTEM}

${buildToolsBlock(allowedTools, maxCalls)}`
  return [
    { role: 'system', content: system },
    { role: 'user', content: userTask },
  ]
}
```

Note: `DRAFTER_SYSTEM` is the existing const. The new function reuses it and appends the tools block. The original `buildDrafterMessages` stays unchanged (regression-safe path).

- [ ] **Step 4: Add `buildDebateMessagesWithTools`**

Append:

```ts
export function buildDebateMessagesWithTools(args: {
  userTask: string
  myDraft: string
  myPreviousDebate: string | null
  othersLatest: ReadonlyArray<{ label: string; content: string }>
  round: number
  totalRounds: number
  allowedTools: ReadonlyArray<CouncilToolName>
  maxCalls: number
}): ReadonlyArray<ChatMessage> {
  const base = buildDebateMessages({
    userTask: args.userTask,
    myDraft: args.myDraft,
    myPreviousDebate: args.myPreviousDebate,
    othersLatest: args.othersLatest,
    round: args.round,
    totalRounds: args.totalRounds,
  })
  const originalSystem = base[0]
  const userMessage = base[1]
  if (!originalSystem || !userMessage || originalSystem.role !== 'system') {
    return base
  }
  const systemWithTools = `${originalSystem.content}

${buildToolsBlock(args.allowedTools, args.maxCalls)}`
  return [
    { role: 'system', content: systemWithTools },
    userMessage,
  ]
}
```

- [ ] **Step 5: Add tests in `tests/application/buildCouncilPrompts.test.ts`**

Open the file. The existing import block at the top is:

```ts
import {
  buildDrafterMessages,
  buildDebateMessages,
  buildSynthesisMessages,
  anonymizeOthers,
} from '@/application/buildCouncilPrompts'
```

Extend it (do NOT add a second import block — TS would flag the duplicate) so it reads:

```ts
import {
  buildDrafterMessages,
  buildDrafterMessagesWithTools,
  buildDebateMessages,
  buildDebateMessagesWithTools,
  buildSynthesisMessages,
  anonymizeOthers,
} from '@/application/buildCouncilPrompts'

describe('buildDrafterMessagesWithTools', () => {
  it('includes all three tool names in the system prompt', () => {
    const msgs = buildDrafterMessagesWithTools(
      'task',
      ['google_search', 'google_news', 'fetch_html'],
      3,
    )
    const system = msgs[0]
    expect(system?.role).toBe('system')
    expect(system?.content).toContain('google_search')
    expect(system?.content).toContain('google_news')
    expect(system?.content).toContain('fetch_html')
  })

  it('interpolates maxCalls into the budget directive', () => {
    const msgs = buildDrafterMessagesWithTools('task', ['google_search'], 4)
    expect(msgs[0]?.content).toContain('max 4 tool calls')
  })

  it('only lists the allowed subset of tools', () => {
    const msgs = buildDrafterMessagesWithTools('task', ['google_search'], 3)
    const system = msgs[0]?.content ?? ''
    expect(system).toContain('google_search')
    expect(system).not.toContain('google_news:')
    expect(system).not.toContain('fetch_html:')
  })
})

describe('buildDebateMessagesWithTools', () => {
  it('appends the tools block to the base debate system prompt', () => {
    const args = {
      userTask: 'task',
      myDraft: 'draft',
      myPreviousDebate: null,
      othersLatest: [],
      round: 1,
      totalRounds: 2,
      allowedTools: ['google_search', 'fetch_html'] as const,
      maxCalls: 2,
    }
    const msgs = buildDebateMessagesWithTools(args)
    expect(msgs[0]?.content).toContain('debate round (1/2)') // from base
    expect(msgs[0]?.content).toContain('max 2 tool calls')    // appended
  })
})

describe('buildDrafterMessages (regression)', () => {
  it('does not mention tools', () => {
    const msgs = buildDrafterMessages('task')
    expect(msgs[0]?.content).not.toContain('google_search')
    expect(msgs[0]?.content).not.toContain('tool calls')
  })
})

describe('buildDebateMessages (regression)', () => {
  it('does not mention tools', () => {
    const msgs = buildDebateMessages({
      userTask: 'task',
      myDraft: 'draft',
      myPreviousDebate: null,
      othersLatest: [],
      round: 1,
      totalRounds: 2,
    })
    expect(msgs[0]?.content).not.toContain('google_search')
    expect(msgs[0]?.content).not.toContain('tool calls')
  })
})
```

- [ ] **Step 6: Run the prompt tests**

Run: `npm run test:ci -- tests/application/buildCouncilPrompts.test.ts`
Expected: **PASS** (existing + new tests).

- [ ] **Step 7: Commit**

```bash
git add src/application/buildCouncilPrompts.ts tests/application/buildCouncilPrompts.test.ts
git commit -m "feat(council): prompt builders with tools instructions"
```

---

## Task 6: Application — new `runCouncilTurn.ts` helper

**Files:**
- Create: `src/application/runCouncilTurn.ts`
- Create: `tests/application/runCouncilTurn.test.ts`

- [ ] **Step 1: Write the failing test (TDD red)**

Create `tests/application/runCouncilTurn.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { Model, ApiKey } from '@/domain/branded'
import { runDrafterTurnWithTools } from '@/application/runCouncilTurn'

// We mock the SDK module so the helper doesn't try to instantiate a real client.
// The mock factory returns a `sdk` whose `chat.conversation(opts).stream(msg)` is a
// configurable async iterable. Tests assign `mockStream` and `mockTools` per case.
let mockStream: AsyncIterable<unknown> = (async function* () {})()
let onToolCallCaptured: ((name: string, args: object) => boolean | Promise<boolean>) | undefined

vi.mock('@/infrastructure/sdk/sdkClient', () => ({
  createSdkClient: () => ({
    tools: {},
    chat: {
      conversation: (opts: { onToolCall?: typeof onToolCallCaptured }) => {
        onToolCallCaptured = opts.onToolCall
        return {
          stream: () => mockStream,
        }
      },
    },
  }),
}))

const baseDeps = { key: 'k_test' as unknown as ApiKey }
const baseParams = {
  model: 'gpt-x' as unknown as Model,
  systemPrompt: 'sys',
  history: [],
  userMessage: 'hello',
  allowedTools: ['google_search'] as const,
  maxToolCalls: 3,
}

describe('runDrafterTurnWithTools', () => {
  it('yields delta → tool_call → tool_result → delta and returns final content', async () => {
    mockStream = (async function* () {
      yield { type: 'text', content: 'hi ' }
      yield {
        type: 'tool_start',
        name: 'google_search',
        args: { q: 'foo' },
      }
      yield {
        type: 'tool_end',
        name: 'google_search',
        result: { content: [{ type: 'text', text: '3 results' }], isError: false },
        durationMs: 100,
      }
      yield { type: 'text', content: 'there' }
      yield {
        type: 'done',
        response: { content: 'hi there', toolCalls: [], usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 } },
      }
    })()

    const events: unknown[] = []
    const gen = runDrafterTurnWithTools(baseDeps, baseParams)
    let finalResult: { content: string; costCents: number } | undefined
    for (;;) {
      const r = await gen.next()
      if (r.done) {
        finalResult = r.value
        break
      }
      events.push(r.value)
    }

    expect(events.map((e) => (e as { kind: string }).kind)).toEqual([
      'delta',
      'tool_call',
      'tool_result',
      'delta',
    ])
    expect(finalResult?.content).toBe('hi there')
  })

  it('onToolCall rejects tools outside the allowed whitelist', async () => {
    mockStream = (async function* () {
      yield { type: 'done', response: { content: '', toolCalls: [], usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 } } }
    })()
    const gen = runDrafterTurnWithTools(baseDeps, baseParams)
    for await (const _ev of gen) { /* drain */ }

    // After the run, the captured onToolCall must reject tools not in allowed list.
    expect(onToolCallCaptured).toBeDefined()
    expect(await onToolCallCaptured!('generate_image', {})).toBe(false)
    expect(await onToolCallCaptured!('google_search', {})).toBe(true)
  })

  it('onToolCall rejects after maxToolCalls is reached', async () => {
    mockStream = (async function* () {
      yield { type: 'done', response: { content: '', toolCalls: [], usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 } } }
    })()
    const gen = runDrafterTurnWithTools(baseDeps, { ...baseParams, maxToolCalls: 2 })
    for await (const _ev of gen) { /* drain */ }

    expect(await onToolCallCaptured!('google_search', {})).toBe(true)  // 1
    expect(await onToolCallCaptured!('google_search', {})).toBe(true)  // 2
    expect(await onToolCallCaptured!('google_search', {})).toBe(false) // 3 → blocked
  })

  it('emits tool_result with ok=false when the tool returns isError:true', async () => {
    mockStream = (async function* () {
      yield {
        type: 'tool_start',
        name: 'google_search',
        args: { q: 'foo' },
      }
      yield {
        type: 'tool_end',
        name: 'google_search',
        result: { content: [{ type: 'text', text: 'service down' }], isError: true },
        durationMs: 50,
      }
      yield { type: 'done', response: { content: 'sorry', toolCalls: [], usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 } } }
    })()
    const events: unknown[] = []
    const gen = runDrafterTurnWithTools(baseDeps, baseParams)
    for await (const ev of gen) events.push(ev)

    const result = events.find((e) => (e as { kind: string }).kind === 'tool_result') as { ok: boolean; summary: string }
    expect(result.ok).toBe(false)
    expect(result.summary).toContain('service down')
  })

  it('correlates tool_call and tool_result via the same callId', async () => {
    mockStream = (async function* () {
      yield { type: 'tool_start', name: 'google_search', args: {} }
      yield { type: 'tool_end', name: 'google_search', result: { content: [{ type: 'text', text: 'r' }], isError: false }, durationMs: 1 }
      yield { type: 'done', response: { content: '', toolCalls: [], usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 } } }
    })()
    const events: { kind: string; callId?: string }[] = []
    for await (const ev of runDrafterTurnWithTools(baseDeps, baseParams)) {
      events.push(ev as { kind: string; callId?: string })
    }
    const callEv = events.find((e) => e.kind === 'tool_call')!
    const resultEv = events.find((e) => e.kind === 'tool_result')!
    expect(callEv.callId).toBeDefined()
    expect(callEv.callId).toBe(resultEv.callId)
  })
})
```

- [ ] **Step 2: Run the test to confirm it fails (file doesn't exist yet)**

Run: `npm run test:ci -- tests/application/runCouncilTurn.test.ts`
Expected: **FAIL** with `Cannot find module '@/application/runCouncilTurn'` or similar resolution error.

- [ ] **Step 3: Create the implementation**

Write `src/application/runCouncilTurn.ts`:

```ts
import { LLM4AgentsError } from '@llmforagents/sdk'
import type { ApiKey, Model } from '@/domain/branded'
import type { CouncilToolName } from '@/domain/council'
import { COUNCIL_TOOL_NAMES } from '@/domain/council'
import type { AppError } from '@/domain/errors'
import { coerceToAppError } from '@/domain/errors'
import { createSdkClient, type SdkConfig } from '@/infrastructure/sdk/sdkClient'
import { translateSdkError } from '@/infrastructure/sdk/translateSdkError'

export type DrafterTurnEvent =
  | Readonly<{ kind: 'delta'; text: string }>
  | Readonly<{ kind: 'tool_call'; callId: string; toolName: CouncilToolName; args: unknown }>
  | Readonly<{ kind: 'tool_result'; callId: string; ok: boolean; summary: string }>

export type RunDrafterTurnDeps = Readonly<{
  key: ApiKey
  sdkConfig?: SdkConfig
}>

export type RunDrafterTurnParams = Readonly<{
  model: Model
  systemPrompt: string
  history: ReadonlyArray<Readonly<{ role: 'system' | 'user' | 'assistant'; content: string }>>
  userMessage: string
  allowedTools: ReadonlyArray<CouncilToolName>
  maxToolCalls: number
  signal?: AbortSignal
}>

export type RunDrafterTurnResult = Readonly<{
  content: string
  costCents: number
}>

function isAllowedTool(name: string, allowed: ReadonlyArray<CouncilToolName>): name is CouncilToolName {
  return (COUNCIL_TOOL_NAMES as ReadonlyArray<string>).includes(name) &&
    (allowed as ReadonlyArray<string>).includes(name)
}

function summarizeToolResult(result: unknown): { ok: boolean; summary: string } {
  if (!result || typeof result !== 'object') return { ok: false, summary: '(no result)' }
  const r = result as { isError?: boolean; content?: ReadonlyArray<unknown> }
  const ok = r.isError !== true
  const first = r.content?.[0] as { type?: string; text?: string; mimeType?: string } | undefined
  if (!first) return { ok, summary: ok ? '(empty result)' : 'tool returned isError without content' }
  if (first.type === 'text' && typeof first.text === 'string') {
    const t = first.text
    return { ok, summary: t.length > 120 ? `${t.slice(0, 120)}…` : t }
  }
  if (first.type === 'image' && typeof first.mimeType === 'string') {
    return { ok, summary: `Image (${first.mimeType})` }
  }
  return { ok, summary: `${first.type ?? 'unknown'} result` }
}

type SdkConversationStreamEvent =
  | { type: 'text'; content: string }
  | { type: 'reasoning'; content: string }
  | { type: 'meta'; meta: { costUsdCents?: number } }
  | { type: 'tool_start'; name: string; args: Readonly<Record<string, unknown>> }
  | { type: 'tool_end'; name: string; result: unknown; durationMs: number }
  | { type: 'fallback'; reason: string; model: string }
  | { type: 'done'; response: { content: string } }

export async function* runDrafterTurnWithTools(
  deps: RunDrafterTurnDeps,
  params: RunDrafterTurnParams,
): AsyncGenerator<DrafterTurnEvent, RunDrafterTurnResult, void> {
  const sdk = createSdkClient(deps.key, deps.sdkConfig)

  let callsUsed = 0
  let costCents = 0
  let callCounter = 0
  const inFlightCalls = new Map<string, string>() // name → callId (FIFO order matches tool_start/tool_end)
  const callIdStack: string[] = []

  const onToolCall = (name: string): boolean => {
    if (!isAllowedTool(name, params.allowedTools)) return false
    if (callsUsed >= params.maxToolCalls) return false
    callsUsed += 1
    return true
  }

  const conv = sdk.chat.conversation({
    model: String(params.model),
    system: params.systemPrompt,
    tools: sdk.tools,
    history: params.history.map((m) => ({ role: m.role, content: m.content })),
    onToolCall,
    onRoundMeta: (m: { costUsdCents?: number }) => {
      if (typeof m.costUsdCents === 'number') costCents += m.costUsdCents
    },
    enablePromptToolFallback: true,
    maxToolRounds: Math.max(1, params.maxToolCalls),
    ...(params.signal ? { signal: params.signal } : {}),
  })

  let finalContent = ''
  try {
    for await (const raw of conv.stream(params.userMessage)) {
      const ev = raw as SdkConversationStreamEvent
      switch (ev.type) {
        case 'text':
          yield { kind: 'delta', text: ev.content }
          finalContent += ev.content
          break
        case 'tool_start': {
          if (!isAllowedTool(ev.name, params.allowedTools)) break
          callCounter += 1
          const callId = `call_${callCounter}`
          inFlightCalls.set(ev.name, callId)
          callIdStack.push(callId)
          yield {
            kind: 'tool_call',
            callId,
            toolName: ev.name,
            args: ev.args,
          }
          break
        }
        case 'tool_end': {
          const callId = callIdStack.shift() ?? `call_${callCounter}`
          inFlightCalls.delete(ev.name)
          const { ok, summary } = summarizeToolResult(ev.result)
          yield { kind: 'tool_result', callId, ok, summary }
          break
        }
        case 'done':
          if (ev.response.content) finalContent = ev.response.content
          break
        // 'reasoning', 'meta', 'fallback' are intentionally ignored here;
        // meta is consumed by onRoundMeta above.
      }
    }
  } catch (e) {
    if (e instanceof LLM4AgentsError) {
      if (e.code === 'tool_loop_limit') {
        // Non-fatal: the loop ended naturally. Return whatever content we accumulated.
        return { content: finalContent, costCents }
      }
      // Translate and rethrow as AppError so runCouncilChat's try/catch can classify
      // it as a drafter failure.
      throw translateSdkError(e) satisfies AppError
    }
    throw coerceToAppError(e)
  }
  return { content: finalContent, costCents }
}
```

- [ ] **Step 4: Run the tests to confirm they pass (TDD green)**

Run: `npm run test:ci -- tests/application/runCouncilTurn.test.ts`
Expected: **PASS** (5 passing tests).

- [ ] **Step 5: Run typecheck and full suite**

```bash
npm run typecheck
npm run test:ci
```

Expected: **PASS** on both (137 baseline + new tests).

- [ ] **Step 6: Commit**

```bash
git add src/application/runCouncilTurn.ts tests/application/runCouncilTurn.test.ts
git commit -m "feat(council): add runDrafterTurnWithTools helper

Wraps sdk.chat.conversation with an onToolCall whitelist + per-turn cap.
Yields {delta, tool_call, tool_result} events; returns {content, costCents}.
Non-fatal handling of tool_loop_limit."
```

---

## Task 7: Application — integrate tools into `runCouncilChat.ts`

**Files:**
- Modify: `src/application/runCouncilChat.ts`
- Modify: `tests/application/runCouncilChat.test.ts`

- [ ] **Step 1: Add imports for new types and helper**

At the top of `src/application/runCouncilChat.ts`, add these imports (merge with existing):

```ts
import { COUNCIL_TOOL_NAMES } from '@/domain/council'
import type { CouncilStage } from '@/domain/council'
import {
  runDrafterTurnWithTools,
  type DrafterTurnEvent,
} from './runCouncilTurn'
import {
  buildDrafterMessagesWithTools,
  buildDebateMessagesWithTools,
} from './buildCouncilPrompts'
```

- [ ] **Step 2: Extend `RunCouncilDeps` to accept the API key for tool turns**

Tools need the `ApiKey` for `runDrafterTurnWithTools`. Extend `RunCouncilDeps`:

```ts
export type RunCouncilDeps = Readonly<{
  chat: ChatPort
  getBalanceCents?: () => Promise<number | null>
  /** Required when any plan stage in config.tools.stages is non-empty. */
  apiKey?: ApiKey
  /** Optional SDK config forwarded to runDrafterTurnWithTools. */
  sdkConfig?: import('@/infrastructure/sdk/sdkClient').SdkConfig
}>
```

- [ ] **Step 3: Add a local helper that streams a turn with tools and pushes to outer queues**

Right above the `runCouncilChat` function, add:

```ts
type ToolEventForDrafter =
  | Readonly<{ kind: 'tool_call'; slot: DrafterSlot; callId: string; toolName: import('@/domain/council').CouncilToolName; args: unknown }>
  | Readonly<{ kind: 'tool_result'; slot: DrafterSlot; callId: string; ok: boolean; summary: string }>

async function streamDrafterTurnInto(args: {
  apiKey: ApiKey
  sdkConfig?: import('@/infrastructure/sdk/sdkClient').SdkConfig
  model: Model
  systemPrompt: string
  history: ReadonlyArray<ChatMessage>
  userMessage: string
  maxToolCalls: number
  signal?: AbortSignal
  slot: DrafterSlot
  deltaQueue: Array<Readonly<{ slot: DrafterSlot; text: string }>>
  toolQueue: ToolEventForDrafter[]
}): Promise<{ content: string; costCents: number }> {
  const gen = runDrafterTurnWithTools(
    args.sdkConfig !== undefined
      ? { key: args.apiKey, sdkConfig: args.sdkConfig }
      : { key: args.apiKey },
    {
      model: args.model,
      systemPrompt: args.systemPrompt,
      history: args.history,
      userMessage: args.userMessage,
      allowedTools: COUNCIL_TOOL_NAMES,
      maxToolCalls: args.maxToolCalls,
      ...(args.signal ? { signal: args.signal } : {}),
    },
  )
  let content = ''
  let costCents = 0
  for (;;) {
    const r = await gen.next()
    if (r.done) {
      content = r.value.content
      costCents = r.value.costCents
      break
    }
    const ev: DrafterTurnEvent = r.value
    if (ev.kind === 'delta') {
      args.deltaQueue.push({ slot: args.slot, text: ev.text })
    } else if (ev.kind === 'tool_call') {
      args.toolQueue.push({
        kind: 'tool_call',
        slot: args.slot,
        callId: ev.callId,
        toolName: ev.toolName,
        args: ev.args,
      })
    } else if (ev.kind === 'tool_result') {
      args.toolQueue.push({
        kind: 'tool_result',
        slot: args.slot,
        callId: ev.callId,
        ok: ev.ok,
        summary: ev.summary,
      })
    }
  }
  return { content, costCents }
}
```

Note: `ChatMessage` and `Model` are already in scope from the existing imports/types.

- [ ] **Step 4: Update the drafter loop to branch on `config.tools.stages.includes('drafts')`**

Inside `runCouncilChat`, locate the `draftPromises = draftSlots.map(async ({ slot, model }) => {` block. Add a tool queue and split the body:

Replace the entire `draftPromises = …` block with:

```ts
  type DraftToolEv = ToolEventForDrafter
  const draftToolQueue: DraftToolEv[] = []
  const useToolsInDrafts = config.tools.stages.includes('drafts') &&
    config.tools.maxCallsPerDrafter > 0

  const draftPromises = draftSlots.map(async ({ slot, model }) => {
    const t0 = Date.now()
    try {
      if (useToolsInDrafts) {
        if (!deps.apiKey) {
          throw new Error('runCouncilChat: tools enabled but apiKey not provided in deps')
        }
        const systemMsg = buildDrafterMessagesWithTools(
          userTask,
          COUNCIL_TOOL_NAMES,
          config.tools.maxCallsPerDrafter,
        )[0]
        const final = await streamDrafterTurnInto({
          apiKey: deps.apiKey,
          ...(deps.sdkConfig !== undefined ? { sdkConfig: deps.sdkConfig } : {}),
          model,
          systemPrompt: systemMsg?.content ?? '',
          history: [],
          userMessage: userTask,
          maxToolCalls: config.tools.maxCallsPerDrafter,
          ...(signal !== undefined ? { signal } : {}),
          slot,
          deltaQueue: draftDeltaQueue,
          toolQueue: draftToolQueue,
        })
        return {
          kind: 'ok' as const,
          slot,
          model,
          content: final.content,
          costCents: final.costCents,
          durationMs: Date.now() - t0,
        }
      } else {
        const messages = buildDrafterMessages(userTask)
        const final = await streamOne(
          chat,
          signal !== undefined ? { model, messages, signal } : { model, messages },
          (text) => {
            draftDeltaQueue.push({ slot, text })
          },
        )
        return {
          kind: 'ok' as const,
          slot,
          model,
          content: final.content,
          costCents: final.costCents,
          durationMs: Date.now() - t0,
        }
      }
    } catch (e) {
      return { kind: 'failed' as const, slot, model, error: coerceToAppError(e) }
    } finally {
      draftDoneCount++
    }
  })
```

- [ ] **Step 5: Drain the new `draftToolQueue` alongside the delta queue**

Replace the existing drain loop (the `while (draftDoneCount < draftSlots.length)` and the tail flush) with:

```ts
  while (draftDoneCount < draftSlots.length) {
    if (draftDeltaQueue.length === 0 && draftToolQueue.length === 0) {
      await new Promise((r) => setTimeout(r, 50))
      continue
    }
    while (draftDeltaQueue.length > 0) {
      const item = draftDeltaQueue.shift()
      if (item) yield { kind: 'draft_delta', slot: item.slot, text: item.text }
    }
    while (draftToolQueue.length > 0) {
      const item = draftToolQueue.shift()
      if (!item) continue
      if (item.kind === 'tool_call') {
        yield {
          kind: 'draft_tool_call',
          slot: item.slot,
          callId: item.callId,
          toolName: item.toolName,
          args: item.args,
        }
      } else {
        yield {
          kind: 'draft_tool_result',
          slot: item.slot,
          callId: item.callId,
          ok: item.ok,
          summary: item.summary,
        }
      }
    }
  }
  // Tail flush after all drafters finished
  while (draftDeltaQueue.length > 0) {
    const item = draftDeltaQueue.shift()
    if (item) yield { kind: 'draft_delta', slot: item.slot, text: item.text }
  }
  while (draftToolQueue.length > 0) {
    const item = draftToolQueue.shift()
    if (!item) continue
    if (item.kind === 'tool_call') {
      yield {
        kind: 'draft_tool_call',
        slot: item.slot,
        callId: item.callId,
        toolName: item.toolName,
        args: item.args,
      }
    } else {
      yield {
        kind: 'draft_tool_result',
        slot: item.slot,
        callId: item.callId,
        ok: item.ok,
        summary: item.summary,
      }
    }
  }
```

- [ ] **Step 6: Mirror the same branching + drain logic in the debate loop**

Inside the `for (let round = 1; round <= debateRounds; round++) {` block, repeat the same shape. Locate the `debatePromises = liveDrafts.map(async (draft) => {` block and replace with:

```ts
    type DebateToolEv =
      | Readonly<{ kind: 'tool_call'; round: number; slot: DrafterSlot; callId: string; toolName: import('@/domain/council').CouncilToolName; args: unknown }>
      | Readonly<{ kind: 'tool_result'; round: number; slot: DrafterSlot; callId: string; ok: boolean; summary: string }>
    const debateToolQueue: DebateToolEv[] = []
    const useToolsInDebate = config.tools.stages.includes('debate') &&
      config.tools.maxCallsPerDrafter > 0

    const debatePromises = liveDrafts.map(async (draft) => {
      const t0 = Date.now()
      try {
        const others = anonymizeOthers(latestPerSlot, draft.slot)
        if (useToolsInDebate) {
          if (!deps.apiKey) {
            throw new Error('runCouncilChat: tools enabled but apiKey not provided in deps')
          }
          const baseMsgs = buildDebateMessagesWithTools({
            userTask,
            myDraft: draft.content,
            myPreviousDebate: previousDebatePerSlot.get(draft.slot) ?? null,
            othersLatest: others,
            round,
            totalRounds: debateRounds,
            allowedTools: COUNCIL_TOOL_NAMES,
            maxCalls: config.tools.maxCallsPerDrafter,
          })
          const systemMsg = baseMsgs[0]
          const userMsg = baseMsgs[1]
          const slotInner = draft.slot
          const gen = runDrafterTurnWithTools(
            deps.sdkConfig !== undefined
              ? { key: deps.apiKey, sdkConfig: deps.sdkConfig }
              : { key: deps.apiKey },
            {
              model: draft.model,
              systemPrompt: systemMsg?.content ?? '',
              history: [],
              userMessage: userMsg?.content ?? '',
              allowedTools: COUNCIL_TOOL_NAMES,
              maxToolCalls: config.tools.maxCallsPerDrafter,
              ...(signal !== undefined ? { signal } : {}),
            },
          )
          let content = ''
          let costCents = 0
          for (;;) {
            const r = await gen.next()
            if (r.done) {
              content = r.value.content
              costCents = r.value.costCents
              break
            }
            const ev = r.value
            if (ev.kind === 'delta') {
              debateDeltaQueue.push({ round, slot: slotInner, text: ev.text })
            } else if (ev.kind === 'tool_call') {
              debateToolQueue.push({
                kind: 'tool_call',
                round,
                slot: slotInner,
                callId: ev.callId,
                toolName: ev.toolName,
                args: ev.args,
              })
            } else if (ev.kind === 'tool_result') {
              debateToolQueue.push({
                kind: 'tool_result',
                round,
                slot: slotInner,
                callId: ev.callId,
                ok: ev.ok,
                summary: ev.summary,
              })
            }
          }
          return {
            kind: 'ok' as const,
            slot: draft.slot,
            model: draft.model,
            content,
            costCents,
            durationMs: Date.now() - t0,
          }
        } else {
          const messages = buildDebateMessages({
            userTask,
            myDraft: draft.content,
            myPreviousDebate: previousDebatePerSlot.get(draft.slot) ?? null,
            othersLatest: others,
            round,
            totalRounds: debateRounds,
          })
          const final = await streamOne(
            chat,
            signal !== undefined ? { model: draft.model, messages, signal } : { model: draft.model, messages },
            (text) => {
              debateDeltaQueue.push({ round, slot: draft.slot, text })
            },
          )
          return {
            kind: 'ok' as const,
            slot: draft.slot,
            model: draft.model,
            content: final.content,
            costCents: final.costCents,
            durationMs: Date.now() - t0,
          }
        }
      } catch (e) {
        return {
          kind: 'failed' as const,
          slot: draft.slot,
          model: draft.model,
          error: coerceToAppError(e),
        }
      } finally {
        debateDoneCount++
      }
    })
```

Then extend the debate drainer in the same way as drafts, draining both `debateDeltaQueue` and `debateToolQueue` (yielding `debate_tool_call` / `debate_tool_result` from the tool queue). Replace the existing debate drain block with:

```ts
    while (debateDoneCount < liveDrafts.length) {
      if (debateDeltaQueue.length === 0 && debateToolQueue.length === 0) {
        await new Promise((r) => setTimeout(r, 50))
        continue
      }
      while (debateDeltaQueue.length > 0) {
        const item = debateDeltaQueue.shift()
        if (item) yield { kind: 'debate_delta', round: item.round, slot: item.slot, text: item.text }
      }
      while (debateToolQueue.length > 0) {
        const item = debateToolQueue.shift()
        if (!item) continue
        if (item.kind === 'tool_call') {
          yield {
            kind: 'debate_tool_call',
            round: item.round,
            slot: item.slot,
            callId: item.callId,
            toolName: item.toolName,
            args: item.args,
          }
        } else {
          yield {
            kind: 'debate_tool_result',
            round: item.round,
            slot: item.slot,
            callId: item.callId,
            ok: item.ok,
            summary: item.summary,
          }
        }
      }
    }
    while (debateDeltaQueue.length > 0) {
      const item = debateDeltaQueue.shift()
      if (item) yield { kind: 'debate_delta', round: item.round, slot: item.slot, text: item.text }
    }
    while (debateToolQueue.length > 0) {
      const item = debateToolQueue.shift()
      if (!item) continue
      if (item.kind === 'tool_call') {
        yield {
          kind: 'debate_tool_call',
          round: item.round,
          slot: item.slot,
          callId: item.callId,
          toolName: item.toolName,
          args: item.args,
        }
      } else {
        yield {
          kind: 'debate_tool_result',
          round: item.round,
          slot: item.slot,
          callId: item.callId,
          ok: item.ok,
          summary: item.summary,
        }
      }
    }
```

- [ ] **Step 7: Run typecheck and existing council tests**

```bash
npm run typecheck
npm run test:ci -- tests/application/runCouncilChat.test.ts
```

Expected: **PASS** on both — existing tests pass because they all use plans with `tools.stages = []` by reference to the legacy `COUNCIL_PLANS` fixtures. If a test fails because it constructs a bare `CouncilConfig`, locate it and fix the fixture to include `tools: { stages: [], maxCallsPerDrafter: 0 }`.

- [ ] **Step 8: Add new test cases**

Open `tests/application/runCouncilChat.test.ts`. The file already imports `COUNCIL_PLANS` at the top — do NOT add a duplicate import. The existing tests construct `{ chat }` deps without `apiKey`; since `apiKey` is optional and `tools.stages=[]` in `COUNCIL_PLANS.lite` (after Task 1) the new tools path is never entered for existing tests, so they keep passing untouched. Add a new describe block at the bottom of the file:

```ts
describe('runCouncilChat — tools branch', () => {
  it('with tools.stages=[] uses ChatPort.completionStream for drafts (no SDK conversation)', async () => {
    const chatStub = makeChatStub(/* ... uses existing helper from this test file ... */)
    const config = {
      ...COUNCIL_PLANS.lite,
      tools: { stages: [], maxCallsPerDrafter: 0 } as const,
    }
    // Run the council; verify chatStub was called for every drafter and debate slot.
    // (Use existing test scaffolding pattern in this file; the assertion is "no tool events emitted".)
    const events: string[] = []
    for await (const ev of /* runCouncilChat invocation existing in this file */) {
      events.push(ev.kind)
    }
    expect(events).not.toContain('draft_tool_call')
    expect(events).not.toContain('debate_tool_call')
  })
})
```

**Note for the implementing engineer**: the existing `runCouncilChat.test.ts` already has stubs and helpers. Reuse them rather than reinventing. The above is a sketch — fill the `runCouncilChat(...)` invocation with the same pattern used by existing tests in that file. If the existing tests do not yet pass `apiKey` to `deps`, add the field with `'k_test' as unknown as ApiKey` to keep them compiling.

Add three more cases following the same scaffold:

1. **"with tools.stages=['drafts'] invokes runDrafterTurnWithTools for drafts"** — mock the SDK module (same approach as `runCouncilTurn.test.ts`) and assert that `draft_tool_call` events appear in the stream. Use `vi.mock('@/infrastructure/sdk/sdkClient', …)` at the top of the test file (or in a per-suite `beforeEach`).
2. **"each draft_tool_call has a matching draft_tool_result with the same callId"** — collect events, group by `callId`, verify each `tool_call` has a `tool_result` later in the stream.
3. **"tool failure (isError:true) does not abort the run"** — mock the SDK to yield a `tool_end` with `isError: true`, then `done`. Assert `council_done` is emitted (no `draft_failed`).

- [ ] **Step 9: Run the full test suite**

```bash
npm run test:ci
```

Expected: **PASS** (all baseline + new).

- [ ] **Step 10: Commit**

```bash
git add src/application/runCouncilChat.ts tests/application/runCouncilChat.test.ts
git commit -m "$(cat <<'EOF'
feat(council): branch drafts and debate per stage when tools enabled

Stages without tools keep using ChatPort.completionStream (no change).
Stages with tools route through runDrafterTurnWithTools and emit
draft_tool_call / debate_tool_call / *_tool_result events drained in
the same out-of-order queue pattern as deltas.
EOF
)"
```

---

## Task 8: Composition — wire `apiKey` and `sdkConfig` into `runCouncilChat` deps

**Files:**
- Modify: `src/application/useCases.ts`

- [ ] **Step 1: Locate the existing `runCouncilChat` call site in `useCases.ts`**

Run: `grep -n "runCouncilChat({ chat" src/application/useCases.ts`
Expected: one match around line 294 reading:

```ts
        for await (const event of runCouncilChat({ chat, getBalanceCents }, params)) {
```

- [ ] **Step 2: Add `apiKey` and `sdkConfig` to the deps literal**

Replace that line with:

```ts
        for await (const event of runCouncilChat(
          {
            chat,
            getBalanceCents,
            apiKey: key,
            ...(deps.sdkConfig !== undefined ? { sdkConfig: deps.sdkConfig } : {}),
          },
          params,
        )) {
```

`deps.sdkConfig` is the outer-scope `Deps` object passed to `makeUseCases(deps)` — it's already in scope here (the same pattern is used at line 275 for `runAgenticChat`). `key` is the `ApiKey` argument of the `runCouncilChat` use case (the `key` parameter on line 281 of the wrapper `async *runCouncilChat(agent, key, params)`).

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck`
Expected: **PASS**. If a callsite somewhere else builds `RunCouncilDeps` and now lacks `apiKey`, TS will catch it (the field is optional, so it should compile — but if you tightened it to required, fix the callsite).

- [ ] **Step 4: Run the full test suite**

Run: `npm run test:ci`
Expected: **PASS**.

- [ ] **Step 5: Commit**

```bash
git add src/application/useCases.ts
git commit -m "feat(council): thread apiKey and sdkConfig into runCouncilChat deps"
```

---

## Task 9: Presentation — verify snapshot storage is forward-compatible (no migration needed)

**Context:** The persisted `CouncilSnapshot` shape is `{ id, timestamp, plan, userTask, events: CouncilEvent[], finalAnswer, totalCostCents, error }`. Tool events (`draft_tool_call`, etc.) are part of `CouncilEvent` after Task 2, so they ride inside the existing `events[]` array. No store-level fields change. The filter at `useCouncilStream.ts:163` only excludes `*_delta` events; tool events are preserved automatically.

**Files:**
- Modify: `tests/presentation/council-store.test.ts` (additive test only)

- [ ] **Step 1: Inspect the current snapshot filter to confirm**

Run: `grep -nA 6 "persistableEvents" src/presentation/hooks/useCouncilStream.ts`
Confirm the filter drops only `draft_delta`, `debate_delta`, `synthesis_delta`. Tool events are not in that exclusion list, so they persist unchanged. **No production code change is needed for Task 9.**

- [ ] **Step 2: Add a regression test asserting a snapshot with tool events round-trips**

Open `tests/presentation/council-store.test.ts`. Add at the bottom of the file (inside the existing `describe('useCouncilStore', …)` or as a new describe block):

```ts
describe('useCouncilStore — tool events persistence', () => {
  it('preserves draft_tool_call and draft_tool_result events through JSON roundtrip', () => {
    const snap: CouncilSnapshot = {
      id: 'r1',
      timestamp: new Date().toISOString(),
      plan: 'pro',
      userTask: 't',
      events: [
        { kind: 'council_started', totalDrafters: 3, chairman: 'm' as never, debateRounds: 2 },
        {
          kind: 'draft_tool_call',
          slot: 'A',
          callId: 'call_1',
          toolName: 'google_search',
          args: { q: 'foo' },
        },
        {
          kind: 'draft_tool_result',
          slot: 'A',
          callId: 'call_1',
          ok: true,
          summary: '3 results',
        },
      ],
      finalAnswer: null,
      totalCostCents: 0,
      error: null,
    }
    const json = JSON.parse(JSON.stringify(snap)) as CouncilSnapshot
    expect(json.events).toHaveLength(3)
    const toolCall = json.events[1] as Extract<typeof json.events[number], { kind: 'draft_tool_call' }>
    expect(toolCall.callId).toBe('call_1')
    expect(toolCall.toolName).toBe('google_search')
    const toolResult = json.events[2] as Extract<typeof json.events[number], { kind: 'draft_tool_result' }>
    expect(toolResult.ok).toBe(true)
  })
})
```

- [ ] **Step 3: Run the council-store tests**

Run: `npm run test:ci -- tests/presentation/council-store.test.ts`
Expected: **PASS**.

- [ ] **Step 4: Commit**

```bash
git add tests/presentation/council-store.test.ts
git commit -m "test(council): assert tool events round-trip through snapshot persistence"
```

---

## Task 10: Presentation — extend `reduceEvents` in `CouncilStream.tsx`

**Context:** The actual reducer that converts `events: CouncilEvent[]` into per-slot UI state lives in `src/presentation/components/council/CouncilStream.tsx` (the `reduceEvents` function). It builds `DraftBucket` and `DebateBucket` records keyed by `slot` / `round-slot`. This task extends the buckets with `toolCalls` and adds cases for the four new events.

**Files:**
- Modify: `src/presentation/components/council/CouncilStream.tsx`

- [ ] **Step 1: Add the `ToolCallRecord` type at the top of the file**

After the existing imports, add:

```ts
import type { CouncilToolName } from '@/domain/council'

export type ToolCallRecord = Readonly<{
  callId: string
  toolName: CouncilToolName
  args: unknown
  result: Readonly<{ ok: boolean; summary: string }> | null
}>
```

(Export so `CouncilToolPanel` in Task 12 can import it.)

- [ ] **Step 2: Extend `DraftBucket` and `DebateBucket`**

Inside the existing type declarations near the top, add a `toolCalls` field to both:

```ts
type DraftBucket = {
  slot: DrafterSlot
  model: string | null
  text: string
  done: boolean
  failed: boolean
  failureReason: string | null
  costCents: number | null
  durationMs: number | null
  toolCalls: ToolCallRecord[]   // ← new
}

type DebateBucket = {
  round: number
  slot: DrafterSlot
  model: string | null
  text: string
  done: boolean
  failed: boolean
  failureReason: string | null
  costCents: number | null
  durationMs: number | null
  toolCalls: ToolCallRecord[]   // ← new
}
```

- [ ] **Step 3: Initialize `toolCalls: []` in both `ensureDraft` and `ensureDebate`**

In the `ensureDraft` factory, add `toolCalls: []` to the object literal. Same in `ensureDebate`. The full updated factories:

```ts
const ensureDraft = (slot: DrafterSlot): DraftBucket => {
  let b = r.drafts.get(slot)
  if (!b) {
    b = {
      slot,
      model: null,
      text: '',
      done: false,
      failed: false,
      failureReason: null,
      costCents: null,
      durationMs: null,
      toolCalls: [],
    }
    r.drafts.set(slot, b)
  }
  return b
}

const ensureDebate = (round: number, slot: DrafterSlot): DebateBucket => {
  const key = debateKey(round, slot)
  let b = r.debates.get(key)
  if (!b) {
    b = {
      round,
      slot,
      model: null,
      text: '',
      done: false,
      failed: false,
      failureReason: null,
      costCents: null,
      durationMs: null,
      toolCalls: [],
    }
    r.debates.set(key, b)
  }
  return b
}
```

- [ ] **Step 4: Add four new `case` branches in the `switch (e.kind)` block of `reduceEvents`**

Insert these cases anywhere within the switch (recommended: right after the existing `draft_failed` for the draft pair, and right after `debate_failed` for the debate pair, to keep them grouped):

```ts
case 'draft_tool_call': {
  const b = ensureDraft(e.slot)
  b.toolCalls.push({
    callId: e.callId,
    toolName: e.toolName,
    args: e.args,
    result: null,
  })
  break
}
case 'draft_tool_result': {
  const b = ensureDraft(e.slot)
  b.toolCalls = b.toolCalls.map((tc) =>
    tc.callId === e.callId
      ? { ...tc, result: { ok: e.ok, summary: e.summary } }
      : tc,
  )
  break
}
case 'debate_tool_call': {
  const b = ensureDebate(e.round, e.slot)
  b.toolCalls.push({
    callId: e.callId,
    toolName: e.toolName,
    args: e.args,
    result: null,
  })
  break
}
case 'debate_tool_result': {
  const b = ensureDebate(e.round, e.slot)
  b.toolCalls = b.toolCalls.map((tc) =>
    tc.callId === e.callId
      ? { ...tc, result: { ok: e.ok, summary: e.summary } }
      : tc,
  )
  break
}
```

- [ ] **Step 5: Run typecheck**

Run: `npm run typecheck`
Expected: **PASS**. The TS compiler exhaustiveness check on the discriminated union ensures all four new variants are handled.

- [ ] **Step 6: Run the full test suite**

Run: `npm run test:ci`
Expected: **PASS** (no test directly covers `reduceEvents`, but everything that consumes its output keeps compiling).

- [ ] **Step 7: Commit**

```bash
git add src/presentation/components/council/CouncilStream.tsx
git commit -m "feat(council): accumulate toolCalls into draft/debate buckets in reduceEvents"
```

---

## Task 11: Presentation — UI for tools in `CouncilSetup.tsx`

**Files:**
- Modify: `src/presentation/components/council/CouncilSetup.tsx`

- [ ] **Step 1: Add imports for new constants**

Add to the existing imports from `@/domain/council`:

```ts
import {
  /* ... existing ... */
  MIN_TOOL_CALLS_PER_DRAFTER,
  MAX_TOOL_CALLS_PER_DRAFTER,
  type CouncilStage,
  COUNCIL_STAGE_ORDER,
} from '@/domain/council'
```

- [ ] **Step 2: Add the tools section update helpers**

Inside the `CouncilSetup` component, add two callbacks near the existing `updateRounds`:

```ts
  const toggleToolStage = (stage: CouncilStage): void => {
    const current = config.tools.stages
    const next = current.includes(stage)
      ? current.filter((s) => s !== stage)
      : [...current, stage]
    setConfig({ ...config, tools: { ...config.tools, stages: next } })
  }

  const updateToolMaxCalls = (n: number): void => {
    const clamped = Math.max(MIN_TOOL_CALLS_PER_DRAFTER, Math.min(MAX_TOOL_CALLS_PER_DRAFTER, n))
    setConfig({ ...config, tools: { ...config.tools, maxCallsPerDrafter: clamped } })
  }
```

- [ ] **Step 3: Add the JSX tools section**

Insert this block **before** the chairman section in the existing JSX (i.e. after the rounds slider block, before `<Label>{t('council.chairmanLabel')}</Label>`):

```tsx
      <div className="space-y-2 rounded-lg border border-border bg-muted/10 p-3">
        <Label>{t('council.toolsLabel')}</Label>
        <div className="text-[11px] text-muted-foreground">{t('council.toolsAvailable')}</div>

        <div className="flex items-center gap-4 pt-1">
          <span className="text-xs text-muted-foreground">{t('council.toolsStagesLabel')}</span>
          {COUNCIL_STAGE_ORDER.map((stage) => {
            const checked = config.tools.stages.includes(stage)
            const labelKey = stage === 'drafts' ? 'council.toolsStageDrafts' : 'council.toolsStageDebate'
            return (
              <label key={stage} className="flex items-center gap-1.5 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleToolStage(stage)}
                  disabled={disabled}
                  className="accent-foreground"
                />
                <span>{t(labelKey)}</span>
              </label>
            )
          })}
        </div>

        <div className="space-y-1 pt-1">
          <Label>
            {t('council.toolsMaxCallsLabel')}{' '}
            <span className="font-mono text-muted-foreground">({config.tools.maxCallsPerDrafter})</span>
          </Label>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={MIN_TOOL_CALLS_PER_DRAFTER}
              max={MAX_TOOL_CALLS_PER_DRAFTER}
              step={1}
              value={config.tools.maxCallsPerDrafter}
              onChange={(e) => updateToolMaxCalls(Number(e.target.value))}
              disabled={disabled}
              className="flex-1 accent-foreground"
              aria-label={t('council.toolsMaxCallsLabel')}
            />
            <span className="text-xs text-muted-foreground font-mono whitespace-nowrap">
              {MIN_TOOL_CALLS_PER_DRAFTER}–{MAX_TOOL_CALLS_PER_DRAFTER}
            </span>
          </div>
        </div>

        {config.tools.maxCallsPerDrafter > 0 && config.tools.stages.length === 0 ? (
          <p className="text-[11px] text-destructive">{t('council.toolsNoStages')}</p>
        ) : null}
      </div>
```

- [ ] **Step 4: Run typecheck**

Run: `npm run typecheck`
Expected: **PASS**.

- [ ] **Step 5: Run lint**

Run: `npm run lint`
Expected: 0 errors (existing warnings are fine).

- [ ] **Step 6: Visual verification — manual**

```bash
npm run build && systemctl --user restart llm4agents-dashboard.service
```

Open `http://localhost:4310/council` in a browser. Confirm:
- The new "Tools (research)" section appears between rounds and chairman.
- Selecting plan `lite` shows: both checkboxes off, slider at 0.
- Selecting `pro` shows: drafts checked, debate unchecked, slider at 3.
- Selecting `power` shows: both checked, slider at 3.
- Manually changing checkboxes or slider after a plan is picked does NOT reset other fields.
- Setting `maxCallsPerDrafter > 0` with zero stages selected shows the red "No stages enabled" hint.

If a check fails, fix and rebuild before continuing.

- [ ] **Step 7: Commit**

```bash
git add src/presentation/components/council/CouncilSetup.tsx
git commit -m "feat(council): add tools stages + max-calls UI controls to setup"
```

---

## Task 12: Presentation — new `CouncilToolPanel.tsx`

**Files:**
- Create: `src/presentation/components/council/CouncilToolPanel.tsx`

- [ ] **Step 1: Write the component**

```tsx
import { useState } from 'react'
import type { CouncilToolName } from '@/domain/council'
import type { ToolCallRecord } from './CouncilStream'
import { useT } from '@/presentation/hooks/useT'
import { ChevronRightIcon, ChevronDownIcon, SearchIcon, NewspaperIcon, FileIcon } from 'lucide-react'

type Props = Readonly<{
  toolCalls: ReadonlyArray<ToolCallRecord>
}>

// Return type inferred — TS6 + react-jsx infers JSX implicitly. Annotating with
// JSX.Element can break under verbatimModuleSyntax in some configs.
function iconFor(name: CouncilToolName) {
  if (name === 'google_search') return <SearchIcon className="size-3.5" />
  if (name === 'google_news') return <NewspaperIcon className="size-3.5" />
  return <FileIcon className="size-3.5" />
}

function countByTool(calls: ReadonlyArray<ToolCallRecord>): {
  search: number; news: number; fetch: number
} {
  let search = 0, news = 0, fetch = 0
  for (const c of calls) {
    if (c.toolName === 'google_search') search++
    else if (c.toolName === 'google_news') news++
    else if (c.toolName === 'fetch_html') fetch++
  }
  return { search, news, fetch }
}

function previewArgs(args: unknown): string {
  if (!args || typeof args !== 'object') return ''
  const a = args as Record<string, unknown>
  const primary =
    typeof a['q'] === 'string' ? a['q'] :
    typeof a['url'] === 'string' ? a['url'] :
    ''
  const s = String(primary)
  return s.length > 60 ? `${s.slice(0, 60)}…` : s
}

export function CouncilToolPanel({ toolCalls }: Props) {
  const t = useT()
  const [open, setOpen] = useState(false)

  if (toolCalls.length === 0) return null

  const { search, news, fetch } = countByTool(toolCalls)
  const counterText = t('council.toolsCounter', {
    search: String(search),
    news: String(news),
    fetch: String(fetch),
  })

  return (
    <div className="text-xs">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
        aria-expanded={open}
      >
        {open ? <ChevronDownIcon className="size-3" /> : <ChevronRightIcon className="size-3" />}
        <span>🔎 {counterText}</span>
      </button>
      {open ? (
        <ul className="mt-1 space-y-0.5 border-l border-border pl-2">
          {toolCalls.map((tc) => (
            <li key={tc.callId} className="flex items-center gap-2 text-[11px]">
              {iconFor(tc.toolName)}
              <span className="font-mono text-muted-foreground truncate">
                {tc.toolName}("{previewArgs(tc.args)}")
              </span>
              {tc.result === null ? (
                <span className="text-muted-foreground">…</span>
              ) : tc.result.ok ? (
                <span className="text-emerald-600">✓</span>
              ) : (
                <span className="text-destructive">✗</span>
              )}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
```

Note: `ToolCallRecord` is imported from `./CouncilStream` where it was defined and exported in Task 10.

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: **PASS**.

- [ ] **Step 3: Commit**

```bash
git add src/presentation/components/council/CouncilToolPanel.tsx
git commit -m "feat(council): add CouncilToolPanel component for tool-call display"
```

---

## Task 13: Presentation — render `CouncilToolPanel` in each bucket card

**Context:** In `CouncilStream.tsx`, the JSX iterates `draftsList.map((b) => …)` for the drafts grid and `list.map((b) => …)` inside each debate round, where `b` is a `DraftBucket` / `DebateBucket` (now carrying `toolCalls: ToolCallRecord[]` after Task 10). Insert the panel below the slot's header in each card.

**Files:**
- Modify: `src/presentation/components/council/CouncilStream.tsx`

- [ ] **Step 1: Import the new component**

Add to the existing imports at the top of `CouncilStream.tsx`:

```ts
import { CouncilToolPanel } from './CouncilToolPanel'
```

- [ ] **Step 2: Insert the panel in the drafts grid**

Locate the drafts card JSX (search for `{t('council.drafter')} {b.slot}` inside `draftsList.map`). Right after the closing `</div>` of the header line (the `font-mono text-xs text-muted-foreground mb-2 flex items-center justify-between gap-2` div), insert:

```tsx
                <CouncilToolPanel toolCalls={b.toolCalls} />
```

The exact insertion: the existing JSX for each draft card is

```tsx
<Card key={b.slot} className="p-3 text-sm">
  <div className="font-mono text-xs text-muted-foreground mb-2 flex items-center justify-between gap-2">
    {/* slot/model + ✓/✗ */}
  </div>
  {/* failed | text | placeholder */}
  {/* cost / duration footer */}
</Card>
```

Becomes:

```tsx
<Card key={b.slot} className="p-3 text-sm">
  <div className="font-mono text-xs text-muted-foreground mb-2 flex items-center justify-between gap-2">
    {/* slot/model + ✓/✗ */}
  </div>
  <CouncilToolPanel toolCalls={b.toolCalls} />
  {/* failed | text | placeholder */}
  {/* cost / duration footer */}
</Card>
```

The component's own `if (toolCalls.length === 0) return null` guard means cards without tools render exactly as today.

- [ ] **Step 3: Insert the panel in the debate cards**

Locate the debate round JSX (search for `<details` inside `list.map`). Insert `<CouncilToolPanel toolCalls={b.toolCalls} />` immediately after the closing `</summary>` of each debate `<details>` block, before the `{b.failed ? … : b.text ? … : …}` ternary.

Concretely, change:

```tsx
<details key={...} className="rounded-lg border border-border bg-card p-3 text-sm" open>
  <summary className="cursor-pointer font-medium flex items-center gap-2">
    {/* … */}
  </summary>
  {b.failed ? (...) : b.text ? (...) : (...)}
</details>
```

To:

```tsx
<details key={...} className="rounded-lg border border-border bg-card p-3 text-sm" open>
  <summary className="cursor-pointer font-medium flex items-center gap-2">
    {/* … */}
  </summary>
  <div className="mt-2"><CouncilToolPanel toolCalls={b.toolCalls} /></div>
  {b.failed ? (...) : b.text ? (...) : (...)}
</details>
```

- [ ] **Step 4: Run typecheck**

Run: `npm run typecheck`
Expected: **PASS**.

- [ ] **Step 5: Visual verification**

```bash
npm run build && systemctl --user restart llm4agents-dashboard.service
```

Open `http://localhost:4310/council`:
- Run a `pro` plan task likely to trigger search (e.g. "What is the latest news about OpenAI?"). Wait until drafters start.
- Verify each drafter card shows the chip "🔎 N search · M news · P fetch".
- Click the chip — verify the inline panel expands listing each tool call with icon, args preview, and ✓/✗ marker.
- Verify cards from a `lite` run (no tools) show no chip (because `toolCalls.length === 0`).

- [ ] **Step 6: Commit**

```bash
git add src/presentation/components/council/CouncilStream.tsx
git commit -m "feat(council): show tool counter + expandable panel per drafter card"
```

---

## Task 14: Presentation — tool count chip in `CouncilHistory.tsx`

**Context:** `CouncilSnapshot.events` is `ReadonlyArray<CouncilEvent>`. Count tool calls by filtering for the two `*_tool_call` variants. Legacy runs (without tool events) naturally yield 0 and render no chip.

**Files:**
- Modify: `src/presentation/components/council/CouncilHistory.tsx`

- [ ] **Step 1: Add a helper that counts tool calls in a run's event log**

Near the top of `CouncilHistory.tsx`, after the existing `formatRunTimestamp` function, add:

```ts
function countToolsInRun(run: CouncilSnapshot): number {
  let n = 0
  for (const e of run.events) {
    if (e.kind === 'draft_tool_call' || e.kind === 'debate_tool_call') n++
  }
  return n
}
```

- [ ] **Step 2: Render the chip in each run item**

Locate the inner button that renders run metadata (the `<button type="button" onClick={() => onSelect(run.id)}` block, around lines 93-111). Insert the chip immediately before the cost span (the line `${(run.totalCostCents / 100).toFixed(4)}`).

Replace:

```tsx
<span className="font-mono text-muted-foreground flex-shrink-0">
  ${(run.totalCostCents / 100).toFixed(4)}
</span>
```

With:

```tsx
{(() => {
  const n = countToolsInRun(run)
  return n > 0 ? (
    <span className="text-muted-foreground flex-shrink-0 font-mono" title={`${n} tool calls`}>
      🔎 {n}
    </span>
  ) : null
})()}
<span className="font-mono text-muted-foreground flex-shrink-0">
  ${(run.totalCostCents / 100).toFixed(4)}
</span>
```

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck`
Expected: **PASS**.

- [ ] **Step 4: Visual verification**

```bash
npm run build && systemctl --user restart llm4agents-dashboard.service
```

Open `http://localhost:4310/council`:
- Verify the history list shows `🔎 N` chips next to runs that used tools.
- Verify legacy runs (saved before this feature) show no chip (zero tool events → guard).

- [ ] **Step 5: Commit**

```bash
git add src/presentation/components/council/CouncilHistory.tsx
git commit -m "feat(council): show tool count chip on history items"
```

---

## Task 15: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Run full typecheck**

Run: `npm run typecheck`
Expected: **PASS** (0 errors).

- [ ] **Step 2: Run lint**

Run: `npm run lint`
Expected: **0 errors**. Warnings are acceptable if they pre-existed before this plan started. New warnings introduced by this feature should be fixed.

- [ ] **Step 3: Run full test suite**

Run: `npm run test:ci`
Expected: **PASS** (>= 137 baseline tests + ~12 new = ~149 tests).

- [ ] **Step 4: Build production bundle**

Run: `npm run build`
Expected: build completes, produces `dist/` with new asset hashes. Bundle size grew by less than ~15 KB gzipped (the new component + reducer cases are small).

- [ ] **Step 5: Restart the systemd preview service**

Run: `systemctl --user restart llm4agents-dashboard.service`
Then: `curl -sS -o /dev/null -w "HTTP %{http_code}\n" http://localhost:4310/`
Expected: `HTTP 200`.

- [ ] **Step 6: Manual end-to-end check**

Open `http://localhost:4310/council`. Run each of these verifications:

| # | Action | Pass criteria |
|---|---|---|
| 1 | Pick `lite`, task "Explain hexagonal architecture", start. | No tool chips appear. Run completes normally. |
| 2 | Pick `pro`, task "What are the top 3 OpenAI announcements this month?", start. | Each drafter card shows `🔎 N` chip. Expanding shows tool calls with args preview + ✓/✗. |
| 3 | Pick `power`, task "Compare prices of GPT-5.2 vs Claude Opus 4.7 vs Gemini 2.5 Pro for 1M tokens", start. | Tool calls appear in both drafts and debate rounds. Counter accumulates per round. |
| 4 | After (3) finishes, compare estimated cost vs actual billed (`balanceBefore - balanceAfter`). | Diff ≤ 1.5× (manual mental math). |
| 5 | Refresh page (F5). | History items render correctly. Legacy runs (from before this feature) render without errors and show no `🔎` chip. New runs preserve `toolCalls`. |
| 6 | Start a run, then click Stop within the first tool call. | Stream terminates cleanly, no orphan "running" states, the in-flight tool call's `result` stays `null` in the persisted snapshot. |

If any of (1)–(6) fails, file the issue back at the corresponding task and fix before declaring done.

- [ ] **Step 7: Final commit (if any leftover edits)**

```bash
git status
# If clean: skip.
# If dirty: review the diff. If it's a typo or formatting fix, commit as:
git commit -am "chore(council): post-verification fixups"
```

- [ ] **Step 8: Done**

The feature is complete when steps 1–6 of the manual check all pass and the working tree is clean. The implementation does not commit upstream; the user decides when/how to push or PR.
