import { describe, expect, it, beforeEach } from 'vitest'
import { useAppStore } from '@/presentation/hooks/useAppStore'
import { AgentId } from '@/domain/branded'

const AGENT = AgentId('11111111-1111-4111-8111-111111111111')

describe('useAppStore', () => {
  beforeEach(() => {
    useAppStore.setState({ activeAgentId: undefined, theme: 'light', mainnetBannerAck: false })
  })
  it('setActiveAgent updates state', () => {
    useAppStore.getState().setActiveAgent(AGENT)
    expect(useAppStore.getState().activeAgentId).toBe(AGENT)
  })
  it('toggleTheme flips theme', () => {
    useAppStore.getState().toggleTheme()
    expect(useAppStore.getState().theme).toBe('dark')
  })
  it('ackMainnet sets banner flag', () => {
    useAppStore.getState().ackMainnet()
    expect(useAppStore.getState().mainnetBannerAck).toBe(true)
  })
})
