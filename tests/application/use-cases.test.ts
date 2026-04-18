import { describe, expect, it, vi } from 'vitest'
import { makeUseCases } from '@/application/useCases'
import { Ok, Err } from '@/domain/result'
import { ApiKey, AgentId } from '@/domain/branded'
import type { RestApiPort, McpPort, HistoryRepo, SessionRepo, AgentRepo, WalletRepo } from '@/application/ports'

const AGENT = AgentId('11111111-1111-4111-8111-111111111111')
const KEY = ApiKey('sk_test')

function fakes() {
  const rest: RestApiPort = {
    healthz: vi.fn(async () => Ok({ status: 'ok', service: 'x', timestamp: 't' })),
    registerAgent: vi.fn(async () => Ok({ uuid: '11111111-1111-4111-8111-111111111111', apiKey: 'k', name: 'n', createdAt: 't' })),
    getBalance: vi.fn(async () => Ok({ availableUsdCents: 500, totalDepositedUsd: 5, totalSpentUsd: 0 })),
    listModels: vi.fn(async () => Ok({ models: [] })),
    generateWallet: vi.fn(async () => Ok({ chain: 'solana' as const, token: 'USDC' as const, address: '0x', createdAt: 't' })),
    chatCompletion: vi.fn(async () => Ok({ data: { id: 'x', object: 'chat.completion', created: 0, model: 'm', choices: [{ index: 0, message: { role: 'assistant' as const, content: 'hi' } }] }, meta: { costCents: 2 } })),
    chatCompletionStream: vi.fn(async function* () {}),
    listTransactions: vi.fn(async () => Ok({ transactions: [], total: 0, limit: 50, offset: 0 })),
  }
  const mcp: McpPort = { callTool: vi.fn(async () => Ok({ content: [{ type: 'text' as const, text: 'x' }] })) }
  const agents: AgentRepo = { list: vi.fn(async () => []), add: vi.fn(), rename: vi.fn(), remove: vi.fn(), get: vi.fn(async () => undefined) }
  const history: HistoryRepo = { add: vi.fn(), listByAgent: vi.fn(async () => []), clear: vi.fn() }
  const sessions: SessionRepo = { add: vi.fn(), listByAgent: vi.fn(async () => []), remove: vi.fn() }
  const wallets: WalletRepo = {
    listByAgent: vi.fn(async () => []),
    upsert: vi.fn(async (_a, w) => ({ ...w, lastSeenAt: 't' })),
    remove: vi.fn(async () => {}),
  }
  return { rest, mcp, agents, history, sessions, wallets }
}

describe('use cases', () => {
  it('healthCheck calls rest.healthz', async () => {
    const f = fakes()
    const uc = makeUseCases({ ...f, now: () => new Date(), newRequestId: () => 'r1' })
    const r = await uc.healthCheck()
    expect(r.ok).toBe(true)
    expect(f.rest.healthz).toHaveBeenCalled()
  })

  it('fetchBalance records history with agentId', async () => {
    const f = fakes()
    const uc = makeUseCases({ ...f, now: () => new Date(), newRequestId: () => 'r1' })
    const r = await uc.fetchBalance(AGENT, KEY)
    expect(r.ok).toBe(true)
    expect(f.history.add).toHaveBeenCalledWith(expect.objectContaining({ agentId: AGENT, endpoint: 'GET /api/v1/balance' }))
  })

  it('executeChatCompletion returns meta + balanceRemaining', async () => {
    const f = fakes()
    const uc = makeUseCases({ ...f, now: () => new Date(), newRequestId: () => 'r1' })
    const r = await uc.executeChatCompletion(AGENT, KEY, {
      model: 'gemini-2.5-flash-lite', messages: [{ role: 'user', content: 'hi' }], stream: false,
    })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value.meta.costCents).toBe(2)
  })

  it('callScraperTool reaches McpPort', async () => {
    const f = fakes()
    const uc = makeUseCases({ ...f, now: () => new Date(), newRequestId: () => 'r1' })
    const r = await uc.callScraperTool(AGENT, KEY, 'fetch_html', { url: 'https://a.com', proxy_tier: 'none' })
    expect(r.ok).toBe(true)
    expect(f.mcp.callTool).toHaveBeenCalledWith(KEY, 'fetch_html', { url: 'https://a.com', proxy_tier: 'none' }, undefined)
  })

  it('registerAgent persists the new agent', async () => {
    const f = fakes()
    const uc = makeUseCases({ ...f, now: () => new Date(), newRequestId: () => 'r1' })
    const r = await uc.registerAgent({ name: 'test' }, '#abcabc')
    expect(r.ok).toBe(true)
    expect(f.agents.add).toHaveBeenCalled()
  })

  it('propagates errors', async () => {
    const f = fakes()
    f.rest.getBalance = vi.fn(async () => Err({ kind: 'unauthorized' as const }))
    const uc = makeUseCases({ ...f, now: () => new Date(), newRequestId: () => 'r1' })
    const r = await uc.fetchBalance(AGENT, KEY)
    expect(r).toEqual({ ok: false, error: { kind: 'unauthorized' } })
  })
})
