import { describe, expect, it, beforeAll, afterAll, afterEach } from 'vitest'
import { setupServer } from 'msw/node'
import { http, HttpResponse } from 'msw'
import { RestApiClient } from '@/infrastructure/rest/RestApiClient'
import { ApiKey } from '@/domain/branded'
import * as fx from '../fixtures/rest'

const server = setupServer()
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

const BASE = 'http://localhost/proxy/api'

describe('RestApiClient', () => {
  it('healthz returns Ok', async () => {
    server.use(http.get(`${BASE}/healthz`, () => HttpResponse.json(fx.fxHealthz)))
    const c = new RestApiClient('http://localhost/proxy/api', '/proxy/mcp')
    const r = await c.healthz()
    expect(r.ok).toBe(true)
  })

  it('getBalance returns Ok', async () => {
    server.use(http.get(`${BASE}/api/v1/balance`, () => HttpResponse.json(fx.fxBalance)))
    const c = new RestApiClient('http://localhost/proxy/api', '/proxy/mcp')
    const r = await c.getBalance(ApiKey('sk_test'))
    expect(r.ok).toBe(true)
  })

  it('401 maps to unauthorized', async () => {
    server.use(http.get(`${BASE}/api/v1/balance`, () => new HttpResponse(null, { status: 401 })))
    const c = new RestApiClient('http://localhost/proxy/api', '/proxy/mcp')
    const r = await c.getBalance(ApiKey('sk_test'))
    expect(r).toEqual({ ok: false, error: { kind: 'unauthorized' } })
  })

  it('chatCompletion extracts cost headers', async () => {
    server.use(http.post(`${BASE}/v1/chat/completions`, () =>
      HttpResponse.json(fx.fxChatCompletion, {
        headers: {
          'X-Cost-Usd-Cents': '2',
          'X-Tokens-Input': '3',
          'X-Tokens-Output': '5',
          'X-Balance-Remaining-Cents': '498',
          'X-Request-Id': 'req_1',
        },
      })))
    const c = new RestApiClient('http://localhost/proxy/api', '/proxy/mcp')
    const r = await c.chatCompletion(ApiKey('sk_test'), {
      model: 'gemini-2.5-flash-lite',
      messages: [{ role: 'user', content: 'hi' }],
    })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.value.meta.costCents).toBe(2)
      expect(r.value.meta.balanceRemainingCents).toBe(498)
    }
  })
})
