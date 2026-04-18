import { describe, expect, it, beforeEach } from 'vitest'
import { createDb } from '@/infrastructure/persistence/db'
import { DexieAgentRepo } from '@/infrastructure/persistence/AgentRepo'
import { DexieHistoryRepo } from '@/infrastructure/persistence/HistoryRepo'
import { DexieSessionRepo } from '@/infrastructure/persistence/SessionRepo'
import { AgentId, ApiKey, RequestId, SessionId } from '@/domain/branded'
import { Ok } from '@/domain/result'

const AGENT_ID = AgentId('11111111-1111-4111-8111-111111111111')

describe('DexieAgentRepo', () => {
  let repo: DexieAgentRepo
  beforeEach(() => {
    const db = createDb(`test-${Date.now()}-${Math.random()}`)
    repo = new DexieAgentRepo(db)
  })
  it('adds and lists agents', async () => {
    await repo.add({
      id: AGENT_ID, name: 'A', apiKey: ApiKey('sk'), createdAt: new Date(), color: '#123',
    })
    const all = await repo.list()
    expect(all.length).toBe(1)
    expect(all[0]?.name).toBe('A')
  })
})

describe('DexieHistoryRepo', () => {
  let repo: DexieHistoryRepo
  beforeEach(() => {
    const db = createDb(`test-${Date.now()}-${Math.random()}`)
    repo = new DexieHistoryRepo(db)
  })
  it('filters by agent', async () => {
    await repo.add({
      id: RequestId('r1'), agentId: AGENT_ID, timestamp: new Date(),
      kind: 'rest', endpoint: 'GET /x', request: {}, response: Ok({}), durationMs: 10,
    })
    const list = await repo.listByAgent(AGENT_ID, 10)
    expect(list.length).toBe(1)
  })
})

describe('DexieSessionRepo', () => {
  let repo: DexieSessionRepo
  beforeEach(() => {
    const db = createDb(`test-${Date.now()}-${Math.random()}`)
    repo = new DexieSessionRepo(db)
  })
  it('add + remove', async () => {
    await repo.add(AGENT_ID, {
      id: SessionId('sess_1'), createdAt: new Date(), proxyTier: 'none',
    })
    expect((await repo.listByAgent(AGENT_ID)).length).toBe(1)
    await repo.remove(AGENT_ID, SessionId('sess_1'))
    expect((await repo.listByAgent(AGENT_ID)).length).toBe(0)
  })
})
