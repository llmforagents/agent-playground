import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { AgentId } from '@/domain/branded'

type Theme = 'light' | 'dark'

type AppState = {
  activeAgentId: AgentId | undefined
  theme: Theme
  mainnetBannerAck: boolean
  setActiveAgent: (id: AgentId | undefined) => void
  toggleTheme: () => void
  ackMainnet: () => void
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      activeAgentId: undefined,
      theme: 'dark',
      mainnetBannerAck: false,
      setActiveAgent: (id) => set({ activeAgentId: id }),
      toggleTheme: () => set((s) => ({ theme: s.theme === 'light' ? 'dark' : 'light' })),
      ackMainnet: () => set({ mainnetBannerAck: true }),
    }),
    { name: 'llm4agents-ui' },
  ),
)
