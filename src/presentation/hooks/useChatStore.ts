import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { PersistStorage, StorageValue } from 'zustand/middleware'
import { toast } from 'sonner'
import { translate } from '@/domain/i18n'
import { useAppStore } from './useAppStore'
import { DEFAULT_MODEL } from '@/domain/defaults'
import type { ConversationEntry } from '@/domain/chat'
import type { AgentId } from '@/domain/branded'
import type { Effort } from '@/domain/reasoning'

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

type ChatStoreState = {
  readonly byAgent: Readonly<Record<string, ChatPersisted>>
  setChat:   (agentId: AgentId, chat: ChatPersisted) => void
  clearChat: (agentId: AgentId) => void
}

const STORAGE_KEY = 'llm4agents-chats'

function makeSafeStorage(): PersistStorage<Pick<ChatStoreState, 'byAgent'>> {
  let quotaToasted = false
  return {
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
}

const safeStorage = makeSafeStorage()

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
