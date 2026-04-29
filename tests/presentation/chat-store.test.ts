import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), info: vi.fn(), warning: vi.fn() } }))

import { toast } from 'sonner'
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
    vi.mocked(toast.error).mockClear()
  })

  it('byAgent returns undefined for an unknown agentId; consumers apply DEFAULT_CHAT as fallback', () => {
    expect(useChatStore.getState().byAgent[A]).toBeUndefined()
    // Consumer pattern: selector + nullish fallback to DEFAULT_CHAT.
    const chat = useChatStore.getState().byAgent[A] ?? DEFAULT_CHAT
    expect(chat.entries).toEqual([])
    expect(chat.toolsOn).toBe(true)
    expect(typeof chat.model).toBe('string')
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

  it('does not throw on QuotaExceededError, fires the toast once, and dedups subsequent failures', () => {
    const orig = localStorage.setItem.bind(localStorage)
    let throwOnPersist = true
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation((k, v) => {
      if (k === 'llm4agents-chats' && throwOnPersist) {
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
    // Toast fired exactly once.
    expect(toast.error).toHaveBeenCalledTimes(1)

    // Second failing save: dedup — toast does NOT fire a second time.
    useChatStore.getState().setChat(B, { entries: [sampleEntry], model: 'm', toolsOn: false })
    expect(toast.error).toHaveBeenCalledTimes(1)

    // Recover: a successful save resets the dedup guard. Next failure should toast again.
    throwOnPersist = false
    useChatStore.getState().setChat(A, { entries: [], model: 'm', toolsOn: true })
    throwOnPersist = true
    useChatStore.getState().setChat(B, { entries: [sampleEntry], model: 'm', toolsOn: true })
    expect(toast.error).toHaveBeenCalledTimes(2)

    spy.mockRestore()
  })
})
