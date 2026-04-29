import { describe, expect, it, vi, beforeAll, afterAll, afterEach } from 'vitest'
import { setupServer } from 'msw/node'
import { http, HttpResponse } from 'msw'
import { RestApiClient } from '@/infrastructure/rest/RestApiClient'
import { ApiKey } from '@/domain/branded'
import type { ChatStreamChunk } from '@/application/ports'
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

// ─── SSE stream helpers ────────────────────────────────────────────────────

function makeSseStream(events: readonly string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  return new ReadableStream({
    start(controller) {
      for (const ev of events) controller.enqueue(encoder.encode(`data: ${ev}\n\n`))
      controller.enqueue(encoder.encode('data: [DONE]\n\n'))
      controller.close()
    },
  })
}

async function collect(gen: AsyncGenerator<ChatStreamChunk, void, void>): Promise<readonly ChatStreamChunk[]> {
  const out: ChatStreamChunk[] = []
  for await (const c of gen) out.push(c)
  return out
}

describe('RestApiClient.chatCompletionStream — reasoning', () => {
  it('parses delta.reasoning and emits reasoning_delta chunks', async () => {
    const stream = makeSseStream([
      JSON.stringify({ choices: [{ delta: { reasoning: 'Let me think.' } }] }),
      JSON.stringify({ choices: [{ delta: { content: 'Answer is 42.' } }] }),
    ])
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(stream, { status: 200, headers: { 'content-type': 'text/event-stream' } }),
    )
    const client = new RestApiClient('https://api.test', 'https://mcp.test')
    const chunks = await collect(client.chatCompletionStream(
      ApiKey('sk_test'),
      { model: 'openai/o3', messages: [{ role: 'user', content: 'hi' }], stream: true },
      new AbortController().signal,
    ))
    fetchMock.mockRestore()

    const reasoningChunks = chunks.filter((c) => c.kind === 'reasoning_delta')
    const contentChunks = chunks.filter((c) => c.kind === 'delta')
    const doneChunk = chunks.find((c) => c.kind === 'done')

    expect(reasoningChunks).toHaveLength(1)
    expect(reasoningChunks[0]).toEqual({ kind: 'reasoning_delta', text: 'Let me think.' })
    expect(contentChunks).toHaveLength(1)
    expect(contentChunks[0]).toEqual({ kind: 'delta', text: 'Answer is 42.' })
    expect(doneChunk?.kind === 'done' && doneChunk.fullText).toBe('Answer is 42.')
    expect(doneChunk?.kind === 'done' && doneChunk.fullReasoning).toBe('Let me think.')
  })

  it('handles a chunk with both delta.content and delta.reasoning together', async () => {
    const stream = makeSseStream([
      JSON.stringify({ choices: [{ delta: { content: 'A', reasoning: 'B' } }] }),
    ])
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(stream, { status: 200, headers: { 'content-type': 'text/event-stream' } }),
    )
    const client = new RestApiClient('https://api.test', 'https://mcp.test')
    const chunks = await collect(client.chatCompletionStream(
      ApiKey('sk_test'),
      { model: 'openai/o3', messages: [{ role: 'user', content: 'hi' }], stream: true },
      new AbortController().signal,
    ))
    fetchMock.mockRestore()

    const kinds = chunks.map((c) => c.kind)
    expect(kinds).toContain('delta')
    expect(kinds).toContain('reasoning_delta')
    expect(kinds).toContain('done')
  })
})

describe('RestApiClient.chatCompletion — reasoning_tokens', () => {
  it('extracts reasoning_tokens from usage.completion_tokens_details', async () => {
    const responseBody = {
      id: 'x',
      object: 'chat.completion',
      created: 0,
      model: 'openai/o3',
      choices: [{ index: 0, message: { role: 'assistant', content: 'hi', reasoning: 'thinking' } }],
      usage: {
        prompt_tokens: 10,
        completion_tokens: 100,
        total_tokens: 110,
        completion_tokens_details: { reasoning_tokens: 75 },
      },
    }
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(responseBody), { status: 200, headers: { 'content-type': 'application/json' } }),
    )
    const client = new RestApiClient('https://api.test', 'https://mcp.test')
    const res = await client.chatCompletion(
      ApiKey('sk_test'),
      { model: 'openai/o3', messages: [{ role: 'user', content: 'hi' }] },
    )
    fetchMock.mockRestore()

    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.value.meta.reasoningTokens).toBe(75)
    expect(res.value.data.choices[0]?.message.reasoning).toBe('thinking')
  })

  it('omits reasoningTokens when usage has no completion_tokens_details', async () => {
    const responseBody = {
      id: 'x',
      object: 'chat.completion',
      created: 0,
      model: 'openai/gpt-4o-mini',
      choices: [{ index: 0, message: { role: 'assistant', content: 'hi' } }],
      usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
    }
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(responseBody), { status: 200, headers: { 'content-type': 'application/json' } }),
    )
    const client = new RestApiClient('https://api.test', 'https://mcp.test')
    const res = await client.chatCompletion(
      ApiKey('sk_test'),
      { model: 'openai/gpt-4o-mini', messages: [{ role: 'user', content: 'hi' }] },
    )
    fetchMock.mockRestore()

    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.value.meta.reasoningTokens).toBeUndefined()
  })
})
