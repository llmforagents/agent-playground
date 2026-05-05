import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), info: vi.fn(), warning: vi.fn() } }))

import { AgentId } from '@/domain/branded'
import {
  useCouncilStore,
  MAX_RUNS_PER_PLAN,
  type CouncilSnapshot,
} from '@/presentation/hooks/useCouncilStore'
import type { CouncilPlan } from '@/domain/council'

const A = AgentId('11111111-1111-4111-8111-111111111111')
const B = AgentId('22222222-2222-4222-8222-222222222222')

function mkSnapshot(id: string, plan: CouncilPlan, ts: string, task = 't'): CouncilSnapshot {
  return {
    id,
    timestamp: ts,
    plan,
    userTask: task,
    events: [{ kind: 'council_started', totalDrafters: 3, chairman: 'm' as never }],
    finalAnswer: 'ok',
    totalCostCents: 1,
    error: null,
  }
}

describe('useCouncilStore', () => {
  beforeEach(() => {
    localStorage.clear()
    useCouncilStore.setState({ byAgent: {} })
  })

  it('byAgent returns undefined for an unknown agent', () => {
    expect(useCouncilStore.getState().byAgent[A]).toBeUndefined()
  })

  it('addRun creates the bucket and sets active', () => {
    const snap = mkSnapshot('r1', 'lite', '2026-05-05T20:00:00Z')
    useCouncilStore.getState().addRun(A, snap)
    const bucket = useCouncilStore.getState().byAgent[A]
    expect(bucket?.activeRunId).toBe('r1')
    expect(bucket?.runs).toHaveLength(1)
  })

  it('addRun is per-agent isolated', () => {
    useCouncilStore.getState().addRun(A, mkSnapshot('a', 'lite', '2026-05-05T20:00:00Z'))
    useCouncilStore.getState().addRun(B, mkSnapshot('b', 'lite', '2026-05-05T20:00:00Z'))
    expect(useCouncilStore.getState().byAgent[A]?.runs.map((r) => r.id)).toEqual(['a'])
    expect(useCouncilStore.getState().byAgent[B]?.runs.map((r) => r.id)).toEqual(['b'])
  })

  it('caps history at MAX_RUNS_PER_PLAN per plan, kicking the oldest of the same plan', () => {
    const { addRun } = useCouncilStore.getState()
    // Fill 6 lite runs (cap is 5).
    for (let i = 1; i <= MAX_RUNS_PER_PLAN + 1; i++) {
      addRun(A, mkSnapshot(`l${i}`, 'lite', `2026-05-05T20:0${i}:00Z`, `lite-${i}`))
    }
    const liteIds = useCouncilStore.getState().byAgent[A]?.runs
      .filter((r) => r.plan === 'lite')
      .map((r) => r.id)
    expect(liteIds).toHaveLength(MAX_RUNS_PER_PLAN)
    expect(liteIds).toContain('l6') // newest in
    expect(liteIds).not.toContain('l1') // oldest of same plan kicked
  })

  it('caps each plan independently — power runs do not evict lite runs', () => {
    const { addRun } = useCouncilStore.getState()
    for (let i = 1; i <= 5; i++) addRun(A, mkSnapshot(`l${i}`, 'lite', `2026-05-05T20:0${i}:00Z`))
    for (let i = 1; i <= 5; i++) addRun(A, mkSnapshot(`p${i}`, 'power', `2026-05-05T21:0${i}:00Z`))
    const runs = useCouncilStore.getState().byAgent[A]?.runs ?? []
    expect(runs.filter((r) => r.plan === 'lite')).toHaveLength(5)
    expect(runs.filter((r) => r.plan === 'power')).toHaveLength(5)
    expect(runs).toHaveLength(10)
  })

  it('setActiveRun switches the active pointer', () => {
    const { addRun, setActiveRun } = useCouncilStore.getState()
    addRun(A, mkSnapshot('r1', 'lite', '2026-05-05T20:00:00Z'))
    addRun(A, mkSnapshot('r2', 'pro', '2026-05-05T20:01:00Z'))
    setActiveRun(A, 'r1')
    expect(useCouncilStore.getState().byAgent[A]?.activeRunId).toBe('r1')
    setActiveRun(A, null)
    expect(useCouncilStore.getState().byAgent[A]?.activeRunId).toBeNull()
  })

  it('setActiveRun ignores ids not present in the bucket', () => {
    const { addRun, setActiveRun } = useCouncilStore.getState()
    addRun(A, mkSnapshot('r1', 'lite', '2026-05-05T20:00:00Z'))
    setActiveRun(A, 'does-not-exist')
    expect(useCouncilStore.getState().byAgent[A]?.activeRunId).toBe('r1')
  })

  it('deleteRun removes a single run and clears active if it was active', () => {
    const { addRun, deleteRun } = useCouncilStore.getState()
    addRun(A, mkSnapshot('r1', 'lite', '2026-05-05T20:00:00Z'))
    addRun(A, mkSnapshot('r2', 'pro', '2026-05-05T20:01:00Z'))
    deleteRun(A, 'r2')
    const bucket = useCouncilStore.getState().byAgent[A]
    expect(bucket?.runs.map((r) => r.id)).toEqual(['r1'])
    expect(bucket?.activeRunId).toBeNull()
  })

  it('clearAllRuns wipes the agent bucket only', () => {
    const { addRun, clearAllRuns } = useCouncilStore.getState()
    addRun(A, mkSnapshot('a', 'lite', '2026-05-05T20:00:00Z'))
    addRun(B, mkSnapshot('b', 'lite', '2026-05-05T20:00:00Z'))
    clearAllRuns(A)
    expect(useCouncilStore.getState().byAgent[A]).toBeUndefined()
    expect(useCouncilStore.getState().byAgent[B]?.runs).toHaveLength(1)
  })

  it('persists round-trip through localStorage', () => {
    useCouncilStore.getState().addRun(A, mkSnapshot('r1', 'lite', '2026-05-05T20:00:00Z'))
    const raw = localStorage.getItem('llm4agents-council')
    expect(raw).toBeTruthy()
    const parsed = JSON.parse(raw ?? '{}')
    expect(parsed.state.byAgent[A].activeRunId).toBe('r1')
    expect(parsed.state.byAgent[A].runs).toHaveLength(1)
  })
})
