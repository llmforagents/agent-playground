import { describe, expect, it } from 'vitest'
import { withHistory } from '@/application/withHistory'
import { Ok, Err } from '@/domain/result'
import { AgentId, RequestId } from '@/domain/branded'
import type { HistoryRepo } from '@/application/ports'
import type { HistoryEntry } from '@/domain/history'

const AGENT = AgentId('11111111-1111-4111-8111-111111111111')

function fakeRepo(): { repo: HistoryRepo; store: HistoryEntry[] } {
  const store: HistoryEntry[] = []
  return {
    store,
    repo: {
      add: async (e) => { store.push(e) },
      listByAgent: async () => [],
      clear: async () => {},
    },
  }
}

describe('withHistory', () => {
  it('records successful call', async () => {
    const { repo, store } = fakeRepo()
    const result = await withHistory({
      historyRepo: repo,
      agentId: AGENT,
      requestId: RequestId('r1'),
      kind: 'rest',
      endpoint: 'GET /balance',
      request: { foo: 1 },
      now: () => new Date('2026-04-17T00:00:00Z'),
    }, async () => Ok({ balance: 100 }))
    expect(result).toEqual({ ok: true, value: { balance: 100 } })
    expect(store).toHaveLength(1)
    expect(store[0]?.endpoint).toBe('GET /balance')
    expect(store[0]?.response).toEqual({ ok: true, value: { balance: 100 } })
  })

  it('records failed call', async () => {
    const { repo, store } = fakeRepo()
    await withHistory({
      historyRepo: repo,
      agentId: AGENT,
      requestId: RequestId('r2'),
      kind: 'mcp',
      endpoint: 'mcp:fetch_html',
      request: { url: 'x' },
      now: () => new Date(),
    }, async () => Err({ kind: 'network' as const }))
    expect(store).toHaveLength(1)
    expect(store[0]?.response.ok).toBe(false)
  })
})
