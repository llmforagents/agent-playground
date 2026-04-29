# Chat Persistence — Design

**Date:** 2026-04-29
**Status:** Approved

## Goal

Persist the chat conversation in `localStorage` so the user does not lose progress when reloading the page or closing the browser. Persist one current conversation **per agent**, including the selected model and the tools toggle.

## Non-goals

- Multiple conversation threads per agent (no history list, no "new chat" button).
- Cross-device sync.
- Persistence of in-flight streaming/agentic state (only finalized turns are persisted).
- Persistence of the textarea input (ephemeral).

## Scope (per user decisions)

- **One conversation per agent.** Clear wipes it; no archiving.
- **Persist full content including tool image data** (`raw` payloads). Use is light (~$0.50 per agent), so localStorage bloat is acceptable.
- **Persist UI prefs** (`model`, `toolsOn`) alongside `entries` so reload restores the exact session state.

## Architecture

### New Zustand store: `useChatStore`

Lives in `src/presentation/hooks/useChatStore.ts`. Separate from `useAppStore` to avoid mixing potentially heavy chat data with lightweight UI prefs. Persisted under the localStorage key `llm4agents-chats` via the `zustand/middleware` `persist` wrapper.

```ts
type ChatPersisted = Readonly<{
  entries: readonly ConversationEntry[]
  model: string
  toolsOn: boolean
}>

type ChatStoreState = {
  byAgent: Readonly<Record<string, ChatPersisted>>     // key: AgentId
  setChat:   (agentId: AgentId, chat: ChatPersisted) => void
  clearChat: (agentId: AgentId) => void
}
```

Defaults when an agent has no persisted chat: `{ entries: [], model: DEFAULT_MODEL, toolsOn: true }`.

### Type relocation

`ConversationEntry` currently lives **inside** `Chat.tsx` (lines 21–23). Move it to `src/domain/chat.ts` so the store can reference it without violating the layered architecture (domain has zero dependencies). Re-export the type from the same module.

```ts
// src/domain/chat.ts
export type ConversationEntry =
  | { readonly kind: 'msg'; readonly role: ChatMessage['role']; readonly content: string }
  | { readonly kind: 'agentic'; readonly steps: readonly AgenticStep[]; readonly finalText: string }
```

`AgenticStep` currently lives in `useAgenticChat.ts` (presentation) and `DispatchMode` lives in `application/runAgenticChat.ts`. Both are referenced by `ConversationEntry` (transitively, via `AgenticStep`). To keep `domain/chat.ts` pure and not invert the layered architecture, move **both** `AgenticStep` and `DispatchMode` to `domain/chat.ts`. They are pure value types with no runtime dependencies, so this is a safe relocation.

After the move:
- `application/runAgenticChat.ts` imports `DispatchMode` from `@/domain/chat` (was a local export there).
- `presentation/hooks/useAgenticChat.ts` imports `AgenticStep` from `@/domain/chat` and re-exports it, so existing consumers (`Chat.tsx`) keep working without import changes.

## Integration in `Chat.tsx`

Replace the three local `useState` calls with reads/writes to the store, indexed by `agent.id`:

```ts
const chat = useChatStore((s) => s.byAgent[agent.id]) ?? DEFAULT_CHAT
const setChat = useChatStore((s) => s.setChat)

// reads
const entries  = chat.entries
const model    = chat.model
const toolsOn  = chat.toolsOn

// writes — every mutation goes through setChat
const setEntries = (next: readonly ConversationEntry[]) => setChat(agent.id, { ...chat, entries: next })
const setModel   = (m: string) => setChat(agent.id, { ...chat, model: m })
const setToolsOn = (v: boolean) => setChat(agent.id, { ...chat, toolsOn: v })
```

Each existing site that previously called the local setters (`setEntries`, `setModel`, `setToolsOn`) gets routed through these helpers. The two `useEffect` hooks that append to `entries` when a stream/agentic run reaches `done` keep the same logic — they call `setEntries` exactly as today.

`input` (textarea) and the scroll-pin/has-new flags remain as local `useState` — they are ephemeral.

## Cleanup on agent deletion

When an agent is removed, also clear its persisted bucket. Modify `useAgents.remove`:

```ts
const remove = useMutation({
  mutationFn: async (id: AgentId) => container.useCases.removeAgentLocal(id),
  onSuccess: (_, id) => {
    qc.invalidateQueries({ queryKey: KEY })
    useChatStore.getState().clearChat(id)
  },
})
```

This prevents stale buckets from accumulating in localStorage when agents are deleted and re-created.

## Quota overflow handling

The user accepted persisting tool image base64 payloads (`raw`). localStorage has a ~5 MB per-origin limit; a few large screenshots could exceed it.

**Mitigation:** wrap the persist middleware's storage adapter so a `QuotaExceededError` (or any storage write failure) does not crash the app:

```ts
const safeStorage = {
  getItem: (k: string) => localStorage.getItem(k),
  setItem: (k: string, v: string) => {
    try { localStorage.setItem(k, v) }
    catch { toast.error(t('chat.persistFull')) }
  },
  removeItem: (k: string) => localStorage.removeItem(k),
}
```

Behavior on overflow: the in-memory state keeps working; only persistence stops until the user clears the chat. A toast notifies the user once.

The `chat.persistFull` translation key is added to `src/domain/i18n.ts` for both EN and ES.

## What is NOT persisted

- `input` (textarea) — ephemeral.
- `stream.state.partial` while `streaming` — only the final `fullText` reaches `entries` via the existing `useEffect`.
- `agentic.state.steps` while `running` — only the final `{ steps, text }` reaches `entries` via the existing `useEffect`.
- Errors and abort reasons — ephemeral.

The reload behavior is therefore: **everything that completed before the reload is preserved exactly; anything in flight at reload time is lost.** This matches user expectations and avoids storing partial/inconsistent state.

## Edge cases

| Case | Behavior |
|---|---|
| Agent has no persisted bucket (first chat use) | Defaults: `entries: []`, model = `DEFAULT_MODEL`, `toolsOn: true` |
| User switches active agent | Chat UI re-renders with the new agent's bucket; previous agent's chat is preserved |
| User deletes the active agent | `useSyncActiveAgent` (existing) selects the next agent; `useChatStore.clearChat` removes the deleted agent's bucket |
| User wipes local data via Settings | Settings already calls `localStorage.clear()` globally (verified in `Settings.tsx:51`), which removes the new bucket too. No change needed there. |
| `AgentId` brand serialization | Branded types are runtime strings; `JSON.stringify` and `JSON.parse` round-trip them as plain strings, which is fine because the store keys by string |

## Files affected

| File | Change |
|---|---|
| `src/domain/chat.ts` | Add `ConversationEntry`, `AgenticStep`, `DispatchMode` (moved from presentation) |
| `src/presentation/hooks/useChatStore.ts` | **New** — Zustand store with persist + safe storage |
| `src/presentation/routes/Chat.tsx` | Replace 3 `useState` with reads/writes to the store; remove inline `ConversationEntry` |
| `src/presentation/hooks/useAgenticChat.ts` | Re-export `AgenticStep` and `DispatchMode` from `domain/chat.ts` (backward compatibility) |
| `src/presentation/hooks/useAgents.ts` | `onSuccess` of `remove`: also call `useChatStore.getState().clearChat(id)` |
| `src/application/runAgenticChat.ts` | Import `DispatchMode` from `@/domain/chat` (relocation only) |
| `src/domain/i18n.ts` | Add `chat.persistFull` (EN + ES) |
| `tests/presentation/chat-store.test.ts` | **New** — unit tests for store: set/clear, multi-agent isolation, defaults |

## Testing strategy

- **Unit tests for `useChatStore`:**
  - Setting a chat for agent A does not affect agent B.
  - `clearChat(A)` removes only A's bucket.
  - Defaults are returned for an unknown agentId via the consumer pattern (selector + fallback).
  - Persistence: writing then re-creating the store reads back the same data (use `localStorage` mock).
  - Quota error during `setItem` does not throw.
- **Manual QA:**
  - Send a message → reload → message is still there with same model and tools toggle.
  - Use a tool that returns an image → reload → image is still rendered.
  - Switch agents → each agent has its own conversation.
  - Delete agent → its bucket disappears from localStorage.
  - Clear button → bucket resets to defaults for the active agent.

## Out of scope (deferred)

- Conversation history / multiple threads per agent.
- Export/import of conversations.
- Encryption at rest.
- Migration of in-flight state (cancellation tokens, mid-stream resumption).
