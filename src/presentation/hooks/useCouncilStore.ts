import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { PersistStorage, StorageValue } from 'zustand/middleware'
import { toast } from 'sonner'
import { translate } from '@/domain/i18n'
import { useAppStore } from './useAppStore'
import type { AgentId } from '@/domain/branded'
import type { CouncilEvent } from '@/domain/councilEvents'
import type { CouncilPlan } from '@/domain/council'

export type CouncilSnapshot = Readonly<{
  id: string
  timestamp: string
  plan: CouncilPlan
  userTask: string
  events: ReadonlyArray<CouncilEvent>
  finalAnswer: string | null
  totalCostCents: number
  error: string | null
}>

type CouncilStoreState = {
  readonly byAgent: Readonly<Record<string, CouncilSnapshot>>
  setSnapshot: (agentId: AgentId, snapshot: CouncilSnapshot) => void
  clearSnapshot: (agentId: AgentId) => void
}

const STORAGE_KEY = 'llm4agents-council'

function makeSafeStorage(): PersistStorage<Pick<CouncilStoreState, 'byAgent'>> {
  let quotaToasted = false
  return {
    getItem: (name) => {
      const raw = localStorage.getItem(name)
      if (raw === null) return null
      return JSON.parse(raw) as StorageValue<Pick<CouncilStoreState, 'byAgent'>>
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

export const useCouncilStore = create<CouncilStoreState>()(
  persist(
    (set) => ({
      byAgent: {},
      setSnapshot: (agentId, snapshot) =>
        set((s) => ({ byAgent: { ...s.byAgent, [agentId]: snapshot } })),
      clearSnapshot: (agentId) =>
        set((s) => {
          if (!(agentId in s.byAgent)) return s
          const next: Record<string, CouncilSnapshot> = { ...s.byAgent }
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
