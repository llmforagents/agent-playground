import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { AgentId } from '@/domain/branded'
import { detectLocale, type Locale } from '@/domain/i18n'

type Theme = 'light' | 'dark'

type AppState = {
  activeAgentId: AgentId | undefined
  theme: Theme
  locale: Locale
  mainnetBannerAck: boolean
  setActiveAgent: (id: AgentId | undefined) => void
  toggleTheme: () => void
  setLocale: (l: Locale) => void
  ackMainnet: () => void
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      activeAgentId: undefined,
      theme: 'dark',
      locale: detectLocale(),
      mainnetBannerAck: false,
      setActiveAgent: (id) => set({ activeAgentId: id }),
      toggleTheme: () => set((s) => ({ theme: s.theme === 'light' ? 'dark' : 'light' })),
      setLocale: (l) => set({ locale: l }),
      ackMainnet: () => set({ mainnetBannerAck: true }),
    }),
    { name: 'llm4agents-ui' },
  ),
)
