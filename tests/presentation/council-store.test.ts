import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), info: vi.fn(), warning: vi.fn() } }))

import { AgentId } from '@/domain/branded'
import { useCouncilStore, type CouncilSnapshot } from '@/presentation/hooks/useCouncilStore'

const A = AgentId('11111111-1111-4111-8111-111111111111')
const B = AgentId('22222222-2222-4222-8222-222222222222')

const sample: CouncilSnapshot = {
  id: 'run-test',
  timestamp: '2026-05-05T20:00:00.000Z',
  plan: 'lite',
  userTask: 'capital de Perú',
  events: [
    { kind: 'council_started', totalDrafters: 3, chairman: 'google/gemini-2.5-flash-lite' as never },
  ],
  finalAnswer: 'Lima.',
  totalCostCents: 7,
  error: null,
}

describe('useCouncilStore', () => {
  beforeEach(() => {
    localStorage.clear()
    useCouncilStore.setState({ byAgent: {} })
  })

  it('byAgent returns undefined for an unknown agent', () => {
    expect(useCouncilStore.getState().byAgent[A]).toBeUndefined()
  })

  it('setSnapshot persists per-agent without bleeding to others', () => {
    useCouncilStore.getState().setSnapshot(A, sample)
    expect(useCouncilStore.getState().byAgent[A]).toEqual(sample)
    expect(useCouncilStore.getState().byAgent[B]).toBeUndefined()
  })

  it('clearSnapshot removes only the target agent', () => {
    const { setSnapshot, clearSnapshot } = useCouncilStore.getState()
    setSnapshot(A, sample)
    setSnapshot(B, { ...sample, userTask: 'task B' })
    clearSnapshot(A)
    expect(useCouncilStore.getState().byAgent[A]).toBeUndefined()
    expect(useCouncilStore.getState().byAgent[B]?.userTask).toBe('task B')
  })

  it('clearSnapshot is a no-op when agent has no snapshot', () => {
    const before = useCouncilStore.getState().byAgent
    useCouncilStore.getState().clearSnapshot(A)
    expect(useCouncilStore.getState().byAgent).toBe(before)
  })

  it('snapshot survives a localStorage round-trip via persist middleware', () => {
    useCouncilStore.getState().setSnapshot(A, sample)
    const raw = localStorage.getItem('llm4agents-council')
    expect(raw).toBeTruthy()
    const parsed = JSON.parse(raw ?? '{}')
    expect(parsed.state.byAgent[A]).toMatchObject({
      id: 'run-test',
      finalAnswer: 'Lima.',
      totalCostCents: 7,
    })
  })
})
