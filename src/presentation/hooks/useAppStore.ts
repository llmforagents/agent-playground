import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { AgentId } from '@/domain/branded'
import { detectLocale, type Locale } from '@/domain/i18n'

type Theme = 'light' | 'dark'

export type DepositWatch = Readonly<{
  agentId: AgentId
  startedAt: number
  startDepositedUsd: number
}>

type AppState = {
  activeAgentId: AgentId | undefined
  theme: Theme
  locale: Locale
  mainnetBannerAck: boolean
  depositWatch: DepositWatch | null
  setActiveAgent: (id: AgentId | undefined) => void
  toggleTheme: () => void
  setLocale: (l: Locale) => void
  ackMainnet: () => void
  startDepositWatch: (w: DepositWatch) => void
  stopDepositWatch: () => void
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      activeAgentId: undefined,
      theme: 'dark',
      locale: detectLocale(),
      mainnetBannerAck: false,
      depositWatch: null,
      setActiveAgent: (id) => set({ activeAgentId: id }),
      toggleTheme: () => set((s) => ({ theme: s.theme === 'light' ? 'dark' : 'light' })),
      setLocale: (l) => set({ locale: l }),
      ackMainnet: () => set({ mainnetBannerAck: true }),
      startDepositWatch: (w) => set({ depositWatch: w }),
      stopDepositWatch: () => set({ depositWatch: null }),
    }),
    { name: 'llm4agents-ui' },
  ),
)
