# Chat Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist the chat conversation per agent in localStorage (entries + selected model + tools toggle) so the user does not lose progress on reload.

**Architecture:** New Zustand store `useChatStore` with `persist` middleware, indexed by `AgentId`. The Chat route reads/writes through it instead of local `useState`. A safe-storage wrapper traps `QuotaExceededError` and shows a toast without crashing. Domain types (`ConversationEntry`, `AgenticStep`, `DispatchMode`) move to `domain/chat.ts` so the store does not import from presentation/application.

**Tech Stack:** TypeScript (strict), Zustand 5 + `zustand/middleware` `persist`, sonner (toast), Vitest + jsdom (tests).

**Spec:** `docs/superpowers/specs/2026-04-29-chat-persistence-design.md`

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `src/domain/chat.ts` | Modify | Add `DispatchMode`, `AgenticStep`, `ConversationEntry`, `DEFAULT_CHAT` constant |
| `src/application/runAgenticChat.ts` | Modify | Re-export `DispatchMode` from `@/domain/chat` (was a local export) |
| `src/presentation/hooks/useAgenticChat.ts` | Modify | Re-export `AgenticStep` from `@/domain/chat` (BC for `Chat.tsx` import) |
| `src/presentation/hooks/useChatStore.ts` | Create | Zustand persist store, `byAgent: Record<AgentId, ChatPersisted>` + safe-storage |
| `src/presentation/routes/Chat.tsx` | Modify | Replace 3 local `useState` with reads/writes to `useChatStore`; remove inline `ConversationEntry` |
| `src/presentation/hooks/useAgents.ts` | Modify | `remove.onSuccess`: also call `useChatStore.getState().clearChat(id)` |
| `src/domain/i18n.ts` | Modify | Add `chat.persistFull` (EN + ES) |
| `tests/presentation/chat-store.test.ts` | Create | Unit tests: set/clear/isolation/persistence/quota |

---

## Task 1: Move shared types into `domain/chat.ts`

**Files:**
- Modify: `src/domain/chat.ts`
- Modify: `src/application/runAgenticChat.ts:26` (remove local `DispatchMode` export, import from domain)
- Modify: `src/presentation/hooks/useAgenticChat.ts:8,11-14` (import `DispatchMode` and `AgenticStep` from domain, re-export `AgenticStep`)

- [ ] **Step 1.1: Read current `src/domain/chat.ts` to know what's already there**

Run: `cat src/domain/chat.ts`
Expected: shows the existing `ChatMessage` and related types so the new ones don't collide with names.

- [ ] **Step 1.2: Append the new types to `src/domain/chat.ts`**

Append at the bottom of the file:

```ts
/** Native vs prompt-based tool dispatch — see runAgenticChat.ts. */
export type DispatchMode = 'native' | 'prompt'

/** A single step in an agentic run, persisted across reloads. */
export type AgenticStep =
  | { readonly kind: 'assistant_text'; readonly text: string }
  | { readonly kind: 'mode_fallback'; readonly from: DispatchMode; readonly to: DispatchMode; readonly reason: string }
  | { readonly kind: 'tool'; readonly callId: string; readonly toolName: string; readonly args: unknown; readonly status: 'running' | 'ok' | 'error'; readonly summary?: string; readonly raw?: unknown }

/** A turn in the conversation: a plain user/assistant message or a multi-step agentic block. */
export type ConversationEntry =
  | { readonly kind: 'msg'; readonly role: ChatMessage['role']; readonly content: string }
  | { readonly kind: 'agentic'; readonly steps: readonly AgenticStep[]; readonly finalText: string }
```

- [ ] **Step 1.3: Update `src/application/runAgenticChat.ts` to import `DispatchMode` from domain**

Find the line `export type DispatchMode = 'native' | 'prompt'` (around line 26). Replace it with:

```ts
import type { DispatchMode } from '@/domain/chat'
export type { DispatchMode }
```

The `import type` line goes near the top of the file (after the other `import type` lines from `@/domain/...`). The `export type { DispatchMode }` keeps backward compatibility for any external consumer that imports `DispatchMode` from this module.

Verify no other line in this file declares `DispatchMode`:

Run: `grep -n "type DispatchMode" src/application/runAgenticChat.ts`
Expected: only the `export type { DispatchMode }` line.

- [ ] **Step 1.4: Update `src/presentation/hooks/useAgenticChat.ts` imports**

Replace the existing `import type { DispatchMode } from '@/application/runAgenticChat'` and the inline `export type AgenticStep = ...` block. The new imports section at the top of the file should look like:

```ts
import { useCallback, useRef, useState } from 'react'
import { useAppContainer } from './useAppContainer'
import { useActiveAgent } from './useActiveAgent'
import type { ChatResponseMeta } from '@/application/ports'
import type { ChatMessage, DispatchMode, AgenticStep } from '@/domain/chat'
import type { AppError } from '@/domain/errors'
import { coerceToAppError } from '@/domain/errors'
import { useT } from './useT'

export type { AgenticStep, DispatchMode }
```

Then **delete** the old inline `export type AgenticStep = ...` block (lines ~11-14 in the original file). Keep `AgenticChatState` and the rest of the hook intact.

- [ ] **Step 1.5: Run typecheck to ensure the move did not break anything**

Run: `npm run typecheck`
Expected: PASS, zero errors.

- [ ] **Step 1.6: Run the test suite to confirm no behavior changed**

Run: `npm run test:ci`
Expected: 82 tests pass (no change from current).

- [ ] **Step 1.7: Commit**

```bash
git add src/domain/chat.ts src/application/runAgenticChat.ts src/presentation/hooks/useAgenticChat.ts
git commit -m "$(cat <<'EOF'
refactor(domain): relocate ConversationEntry, AgenticStep, DispatchMode

Move chat types to domain/chat.ts so the upcoming chat-persistence
store can consume them without violating the layered architecture
(domain depends on nothing). useAgenticChat re-exports AgenticStep
for backward compatibility with Chat.tsx.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Add the `chat.persistFull` i18n key

**Files:**
- Modify: `src/domain/i18n.ts` (EN block around line 211, ES block around line 631)

- [ ] **Step 2.1: Add EN key**

In the EN block (the `const EN = {` object), find the `// Chat` section and append after `chat.abortedCap`:

```ts
  'chat.persistFull': 'Could not save chat — local storage is full. Use Clear to free space.',
```

- [ ] **Step 2.2: Add ES key**

In the ES block (`const ES: Record<MessageKey, string> = {`), find the `// Chat` section and add the same key (ES first, since EN drives the type):

```ts
  'chat.persistFull': 'No se pudo guardar el chat — el almacenamiento local está lleno. Usá Clear para liberar espacio.',
```

- [ ] **Step 2.3: Run typecheck**

Run: `npm run typecheck`
Expected: PASS. (`MessageKey = keyof typeof EN`, so adding to EN forces ES to provide it; both updated.)

- [ ] **Step 2.4: Commit**

```bash
git add src/domain/i18n.ts
git commit -m "$(cat <<'EOF'
i18n(chat): add persistFull key for storage-quota toast

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Create `useChatStore` with safe storage and tests (TDD)

**Files:**
- Create: `src/presentation/hooks/useChatStore.ts`
- Create: `tests/presentation/chat-store.test.ts`

- [ ] **Step 3.1: Write the failing tests**

Create `tests/presentation/chat-store.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { AgentId } from '@/domain/branded'
import { useChatStore, DEFAULT_CHAT } from '@/presentation/hooks/useChatStore'
import type { ConversationEntry } from '@/domain/chat'

const A = AgentId('11111111-1111-4111-8111-111111111111')
const B = AgentId('22222222-2222-4222-8222-222222222222')

const sampleEntry: ConversationEntry = { kind: 'msg', role: 'user', content: 'hi' }

describe('useChatStore', () => {
  beforeEach(() => {
    localStorage.clear()
    useChatStore.setState({ byAgent: {} })
  })

  it('returns DEFAULT_CHAT for an unknown agentId', () => {
    expect(useChatStore.getState().byAgent[A]).toBeUndefined()
    // Consumers fall back to DEFAULT_CHAT explicitly.
    expect(DEFAULT_CHAT.entries).toEqual([])
    expect(DEFAULT_CHAT.toolsOn).toBe(true)
    expect(typeof DEFAULT_CHAT.model).toBe('string')
  })

  it('setChat stores a chat for one agent without affecting others', () => {
    useChatStore.getState().setChat(A, { entries: [sampleEntry], model: 'm', toolsOn: false })
    expect(useChatStore.getState().byAgent[A]?.entries).toEqual([sampleEntry])
    expect(useChatStore.getState().byAgent[B]).toBeUndefined()
  })

  it('clearChat removes only the targeted agent bucket', () => {
    useChatStore.getState().setChat(A, { entries: [sampleEntry], model: 'm', toolsOn: true })
    useChatStore.getState().setChat(B, { entries: [sampleEntry], model: 'm', toolsOn: true })
    useChatStore.getState().clearChat(A)
    expect(useChatStore.getState().byAgent[A]).toBeUndefined()
    expect(useChatStore.getState().byAgent[B]).toBeDefined()
  })

  it('persists chats to localStorage under llm4agents-chats', () => {
    useChatStore.getState().setChat(A, { entries: [sampleEntry], model: 'm', toolsOn: true })
    const raw = localStorage.getItem('llm4agents-chats')
    expect(raw).not.toBeNull()
    const parsed = JSON.parse(raw!)
    // Zustand wraps state in { state, version }
    expect(parsed.state.byAgent[A].entries).toEqual([sampleEntry])
  })

  it('does not throw when localStorage.setItem throws QuotaExceededError', () => {
    const orig = localStorage.setItem.bind(localStorage)
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation((k, v) => {
      if (k === 'llm4agents-chats') {
        const err = new Error('quota') as Error & { name: string }
        err.name = 'QuotaExceededError'
        throw err
      }
      orig(k, v)
    })
    expect(() => {
      useChatStore.getState().setChat(A, { entries: [sampleEntry], model: 'm', toolsOn: true })
    }).not.toThrow()
    // In-memory state is updated even if persistence failed.
    expect(useChatStore.getState().byAgent[A]?.entries).toEqual([sampleEntry])
    spy.mockRestore()
  })
})
```

- [ ] **Step 3.2: Run tests to confirm they fail with "module not found"**

Run: `npm run test:ci -- tests/presentation/chat-store.test.ts`
Expected: FAIL — `Cannot find module '@/presentation/hooks/useChatStore'` (or similar).

- [ ] **Step 3.3: Create the store**

Create `src/presentation/hooks/useChatStore.ts`:

```ts
import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { PersistStorage, StorageValue } from 'zustand/middleware'
import { toast } from 'sonner'
import { translate } from '@/domain/i18n'
import { useAppStore } from './useAppStore'
import { DEFAULT_MODEL } from '@/domain/defaults'
import type { ConversationEntry } from '@/domain/chat'
import type { AgentId } from '@/domain/branded'

export type ChatPersisted = Readonly<{
  entries: readonly ConversationEntry[]
  model: string
  toolsOn: boolean
}>

export const DEFAULT_CHAT: ChatPersisted = {
  entries: [],
  model: DEFAULT_MODEL,
  toolsOn: true,
}

type ChatStoreState = {
  readonly byAgent: Readonly<Record<string, ChatPersisted>>
  setChat:   (agentId: AgentId, chat: ChatPersisted) => void
  clearChat: (agentId: AgentId) => void
}

const STORAGE_KEY = 'llm4agents-chats'

let quotaToasted = false

const safeStorage: PersistStorage<Pick<ChatStoreState, 'byAgent'>> = {
  getItem: (name) => {
    const raw = localStorage.getItem(name)
    if (raw === null) return null
    return JSON.parse(raw) as StorageValue<Pick<ChatStoreState, 'byAgent'>>
  },
  setItem: (name, value) => {
    try {
      localStorage.setItem(name, JSON.stringify(value))
      quotaToasted = false
    } catch {
      if (!quotaToasted) {
        const locale = useAppStore.getState().locale
        toast.error(translate(locale, 'chat.persistFull'))
        quotaToasted = true
      }
    }
  },
  removeItem: (name) => { localStorage.removeItem(name) },
}

export const useChatStore = create<ChatStoreState>()(
  persist(
    (set) => ({
      byAgent: {},
      setChat: (agentId, chat) => set((s) => ({ byAgent: { ...s.byAgent, [agentId]: chat } })),
      clearChat: (agentId) => set((s) => {
        if (!(agentId in s.byAgent)) return s
        const next: Record<string, ChatPersisted> = { ...s.byAgent }
        delete next[agentId]
        return { byAgent: next }
      }),
    }),
    {
      name: STORAGE_KEY,
      storage: safeStorage,
      partialize: (s) => ({ byAgent: s.byAgent }),
    },
  ),
)

// Suppress lint: createJSONStorage is imported for type compatibility but not used directly.
void createJSONStorage
```

(The trailing `void createJSONStorage` is a placeholder; remove it after step 3.4 verifies that `createJSONStorage` is not actually needed — see step 3.5.)

- [ ] **Step 3.4: Run tests**

Run: `npm run test:ci -- tests/presentation/chat-store.test.ts`
Expected: PASS — 5/5 tests green.

- [ ] **Step 3.5: Clean up the unused import**

Open `src/presentation/hooks/useChatStore.ts` and remove the `createJSONStorage` import and the `void createJSONStorage` line — `safeStorage` is a hand-rolled `PersistStorage<...>` and does not need the helper. The imports section should end up as:

```ts
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { PersistStorage, StorageValue } from 'zustand/middleware'
import { toast } from 'sonner'
import { translate } from '@/domain/i18n'
import { useAppStore } from './useAppStore'
import { DEFAULT_MODEL } from '@/domain/defaults'
import type { ConversationEntry } from '@/domain/chat'
import type { AgentId } from '@/domain/branded'
```

- [ ] **Step 3.6: Run typecheck and the full suite**

Run: `npm run typecheck && npm run test:ci`
Expected: typecheck PASS; total tests = 87 (82 existing + 5 new).

- [ ] **Step 3.7: Commit**

```bash
git add src/presentation/hooks/useChatStore.ts tests/presentation/chat-store.test.ts
git commit -m "$(cat <<'EOF'
feat(chat): add useChatStore with quota-safe localStorage persistence

Per-agent persisted bucket keyed by AgentId. Custom PersistStorage
wraps localStorage in try/catch and surfaces a toast (chat.persistFull)
on QuotaExceededError, keeping in-memory state usable without crashing.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Wire `useChatStore` into `Chat.tsx`

**Files:**
- Modify: `src/presentation/routes/Chat.tsx`

The Chat component currently keeps `entries`, `model`, `toolsOn` in local `useState`. Replace those with reads/writes to the per-agent bucket.

- [ ] **Step 4.1: Update imports in `Chat.tsx`**

In the imports block at the top, make these edits:

1. Remove `useState` from the local-state list if all `useState` usages are replaced (it is still needed for `input`, `isPinned`, `hasNew`, so KEEP `useState`).
2. Remove `type ChatMessage` import if it becomes unused after the edits — verify with grep at the end.
3. Remove the line `import { DEFAULT_MODEL } from '@/domain/defaults'` only if it becomes unused — `DEFAULT_MODEL` is still referenced in the empty-state hint, so KEEP it.
4. Remove `useAgenticChat`'s named import of `type AgenticStep` from the route — it's only used for typing `ConversationEntry`, which now lives in domain.
5. Add the new imports:

```ts
import type { ConversationEntry } from '@/domain/chat'
import { useChatStore, DEFAULT_CHAT } from '@/presentation/hooks/useChatStore'
```

After this, the relevant imports look like:

```ts
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowDownIcon, WrenchIcon, ChevronDownIcon, ChevronRightIcon, CheckIcon, XIcon, Loader2Icon } from 'lucide-react'
import { Button } from '@/presentation/components/ui/button'
import { Textarea } from '@/presentation/components/ui/textarea'
import { Card } from '@/presentation/components/ui/card'
import { ErrorView } from '@/presentation/components/ErrorView'
import { CostBadge } from '@/presentation/components/CostBadge'
import { ModelPicker } from '@/presentation/components/ModelPicker'
import { ToolsViewer } from '@/presentation/components/ToolsViewer'
import { useModels } from '@/presentation/hooks/useModels'
import { useBalance } from '@/presentation/hooks/useBalance'
import { useChatStream } from '@/presentation/hooks/useChatStream'
import { useAgenticChat } from '@/presentation/hooks/useAgenticChat'
import type { AgenticStep } from '@/domain/chat'
import { useActiveAgent } from '@/presentation/hooks/useActiveAgent'
import { useT } from '@/presentation/hooks/useT'
import type { ChatMessage, ConversationEntry } from '@/domain/chat'
import { useChatStore, DEFAULT_CHAT } from '@/presentation/hooks/useChatStore'
import { DEFAULT_MODEL } from '@/domain/defaults'
```

- [ ] **Step 4.2: Remove the inline `Role` and `ConversationEntry` declarations**

Find and **delete** lines 20-23 in the original file (the type aliases `Role` and `ConversationEntry`). Replace with:

```ts
type Role = ChatMessage['role']
```

(`Role` is still useful for the local `Bubble` component prop type. `ConversationEntry` now comes from `@/domain/chat`.)

- [ ] **Step 4.3: Replace the three `useState` calls inside the `Chat` component**

In the body of `Chat()`, locate:

```ts
const [model, setModel] = useState<string>(DEFAULT_MODEL)
const [entries, setEntries] = useState<readonly ConversationEntry[]>([])
const [input, setInput] = useState('')
const [toolsOn, setToolsOn] = useState(true)
```

Keep `[input, setInput]`. Replace the other three with store-backed reads/writes. The block becomes:

```ts
const chat = useChatStore((s) => (agent ? s.byAgent[agent.id] : undefined)) ?? DEFAULT_CHAT
const setChatBucket = useChatStore((s) => s.setChat)

const entries  = chat.entries
const model    = chat.model
const toolsOn  = chat.toolsOn

const setEntries = useCallback((next: readonly ConversationEntry[] | ((prev: readonly ConversationEntry[]) => readonly ConversationEntry[])): void => {
  if (!agent) return
  const resolved = typeof next === 'function' ? next(entries) : next
  setChatBucket(agent.id, { entries: resolved, model, toolsOn })
}, [agent, entries, model, toolsOn, setChatBucket])

const setModel = useCallback((m: string): void => {
  if (!agent) return
  setChatBucket(agent.id, { entries, model: m, toolsOn })
}, [agent, entries, toolsOn, setChatBucket])

const setToolsOn = useCallback((updater: boolean | ((prev: boolean) => boolean)): void => {
  if (!agent) return
  const next = typeof updater === 'function' ? updater(toolsOn) : updater
  setChatBucket(agent.id, { entries, model, toolsOn: next })
}, [agent, entries, model, toolsOn, setChatBucket])

const [input, setInput] = useState('')
```

The shape of `setEntries` mirrors React's setter (`value | (prev => value)`) so the existing call sites — `setEntries((m) => [...m, …])` and `setEntries([])` — keep working without further edits.

`setToolsOn` similarly accepts both `(prev) => !prev` and a direct boolean.

- [ ] **Step 4.4: Verify the existing call sites still compile**

The existing usages already in `Chat.tsx` are:

- `setEntries((m) => [...m, { kind: 'msg', role: 'assistant', content: fullText }])`
- `setEntries((m) => [...m, { kind: 'agentic', steps, finalText: text }])`
- `setEntries(nextEntries)` (in `send`)
- `setEntries([])` (in `clear`)
- `setToolsOn((v) => !v)` (in the toggle button)
- `setModel` is passed as the `onChange` of `ModelPicker`

All of these signatures match the new `useCallback` setters. No further edits needed in those call sites.

- [ ] **Step 4.5: Verify type imports are tight**

Run: `grep -n "AgenticStep\|ChatMessage\|ConversationEntry" src/presentation/routes/Chat.tsx`
Confirm:
- `AgenticStep` only imported from `@/domain/chat` (not from `@/presentation/hooks/useAgenticChat`).
- `ChatMessage` and `ConversationEntry` come from `@/domain/chat`.

If `AgenticStep` shows up imported from the hook, fix the import to `@/domain/chat`.

- [ ] **Step 4.6: Run typecheck and tests**

Run: `npm run typecheck && npm run test:ci`
Expected: typecheck PASS, 87 tests pass.

- [ ] **Step 4.7: Smoke test in the browser**

The dev server is already running on http://skywalker:4310/. In a browser:

1. Open http://skywalker:4310/chat (with at least one agent active).
2. Send a short message ("hola").
3. Open DevTools → Application → Local Storage → http://skywalker:4310. Verify `llm4agents-chats` exists and contains an entry under `byAgent.<your-agent-id>.entries[0]`.
4. Reload the page. The conversation should reappear identical.
5. Toggle Tools off, change the model to a different one, send another message, reload — both prefs and the new turn persist.
6. Click Clear — the bucket should reset to `entries: []` (the localStorage entry is rewritten with an empty array).

If any step fails, report the failure and STOP — do not proceed to Task 5.

- [ ] **Step 4.8: Commit**

```bash
git add src/presentation/routes/Chat.tsx
git commit -m "$(cat <<'EOF'
feat(chat): persist conversation, model and tools toggle per agent

Replace the three local useState hooks (entries, model, toolsOn) with
reads/writes to useChatStore indexed by the active agent's id. Reload
restores the exact state including images embedded in tool results.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Clear the chat bucket when an agent is deleted

**Files:**
- Modify: `src/presentation/hooks/useAgents.ts`

- [ ] **Step 5.1: Add the cleanup call**

Open `src/presentation/hooks/useAgents.ts`. Locate the `remove` mutation:

```ts
const remove = useMutation({
  mutationFn: async (id: AgentId) => container.useCases.removeAgentLocal(id),
  onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
})
```

Replace it with:

```ts
const remove = useMutation({
  mutationFn: async (id: AgentId) => container.useCases.removeAgentLocal(id),
  onSuccess: (_, id) => {
    qc.invalidateQueries({ queryKey: KEY })
    useChatStore.getState().clearChat(id)
  },
})
```

Add the import at the top:

```ts
import { useChatStore } from './useChatStore'
```

- [ ] **Step 5.2: Smoke verify in the browser**

In the browser:

1. Have at least 2 agents. Make sure each has some chat content (send one message in each).
2. Confirm in DevTools → Application → Local Storage that `llm4agents-chats` has both agent buckets.
3. Delete one of the agents from `/agents`.
4. Refresh DevTools. The deleted agent's bucket should be gone; the other one remains.

- [ ] **Step 5.3: Run typecheck and tests**

Run: `npm run typecheck && npm run test:ci`
Expected: PASS.

- [ ] **Step 5.4: Commit**

```bash
git add src/presentation/hooks/useAgents.ts
git commit -m "$(cat <<'EOF'
feat(chat): drop persisted chat bucket when an agent is deleted

Prevents stale buckets from accumulating in localStorage when agents
are removed and recreated.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Final verification

- [ ] **Step 6.1: Full test suite**

Run: `npm run test:ci`
Expected: 87 tests pass (82 original + 5 new for chat store).

- [ ] **Step 6.2: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 6.3: Lint (no new errors)**

Run: `npm run lint`
Expected: same warnings as baseline (4 in `runAgenticChat.ts`, 2 in `McpClient.ts`, 1 in `useAgenticChat.ts`, 1 in `Transactions.tsx`). Zero errors. If new warnings appear in `useChatStore.ts`, `Chat.tsx`, or `useAgents.ts`, fix them inline before declaring done.

- [ ] **Step 6.4: Manual end-to-end smoke**

Walk through this checklist on http://skywalker:4310:

1. Create a new agent → it becomes active automatically.
2. Send a chat message → reload → message is still there.
3. Toggle Tools off → reload → toggle stays off.
4. Change model → reload → model stays.
5. Use a tool that returns an image (e.g. ask the model to draw something) → reload → image still rendered inline.
6. Switch to another agent → its chat is independent (empty or its own content).
7. Delete the active agent → `useSyncActiveAgent` falls back to the next one; the deleted bucket vanishes from `llm4agents-chats`.
8. From `/settings`, click "Wipe local data" → all buckets gone.

- [ ] **Step 6.5: No fix-up commit needed if everything passes**

If the smoke test reveals an issue, fix it with a focused commit (`fix(chat): …`) and re-run 6.1–6.4. Otherwise, this task is done.

---

## Self-Review (run after writing the plan)

**Spec coverage:**
- Architecture (`useChatStore`, persist key, separate from `useAppStore`) → Task 3.
- Type relocation (`ConversationEntry`, `AgenticStep`, `DispatchMode` to `domain/chat.ts`) → Task 1.
- Integration in `Chat.tsx` (replace 3 useState) → Task 4.
- Cleanup on agent deletion → Task 5.
- Quota overflow handling (try/catch + toast) → Task 3 (steps 3.3 and 3.1's failing test).
- `chat.persistFull` i18n key (EN+ES) → Task 2.
- "What is NOT persisted" (input, in-flight stream, errors) → enforced by Task 4 design (only `entries`/`model`/`toolsOn` are routed through the store; `input` stays as `useState`).
- Edge cases (no bucket → `DEFAULT_CHAT`; switch agent → re-render; delete active → `useSyncActiveAgent` + `clearChat`; settings wipe → `localStorage.clear()` already handles it) → covered in Task 4 smoke (4.7) and Task 6.4.
- Tests (`tests/presentation/chat-store.test.ts`) → Task 3 (5 tests).

All spec requirements have a task. No gaps.

**Placeholder scan:** No "TBD", "TODO", "implement later", or vague "add error handling" instructions. Every code-changing step shows the exact code.

**Type consistency:**
- `ChatPersisted` shape (`{ entries, model, toolsOn }`) is the same in Task 3 (definition), Task 4 (consumer), Task 5 (`clearChat` only).
- `setChat(agentId, chat)` signature consistent across Tasks 3, 4, 5.
- `clearChat(agentId)` consistent across Tasks 3, 5.
- `DEFAULT_CHAT` defined in Task 3, consumed in Task 4.
- `ConversationEntry` defined in Task 1, consumed everywhere afterward.

No inconsistencies found.
