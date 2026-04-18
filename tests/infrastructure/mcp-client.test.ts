import { describe, expect, it, beforeAll, afterAll, afterEach } from 'vitest'
import { setupServer } from 'msw/node'
import { http, HttpResponse } from 'msw'
import { McpClient } from '@/infrastructure/mcp/McpClient'
import { ApiKey } from '@/domain/branded'

const server = setupServer()
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

const MCP_URL = 'http://localhost/proxy/mcp'

describe('McpClient', () => {
  it('callTool returns Ok with content', async () => {
    server.use(http.post(MCP_URL, async () =>
      HttpResponse.json({
        jsonrpc: '2.0', id: 1,
        result: { content: [{ type: 'text', text: '<html/>' }] },
      })))
    const c = new McpClient(MCP_URL)
    const r = await c.callTool(ApiKey('sk_test'), 'fetch_html', {
      url: 'https://a.com', proxy_tier: 'none',
    })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value.content[0]?.type).toBe('text')
  })

  it('jsonrpc error maps to jsonrpc_error', async () => {
    server.use(http.post(MCP_URL, async () =>
      HttpResponse.json({
        jsonrpc: '2.0', id: 1,
        error: { code: -32000, message: 'tool not found' },
      })))
    const c = new McpClient(MCP_URL)
    const r = await c.callTool(ApiKey('sk_test'), 'fetch_html', {
      url: 'https://a.com', proxy_tier: 'none',
    })
    expect(r).toEqual({ ok: false, error: { kind: 'jsonrpc_error', code: -32000, message: 'tool not found' } })
  })
})
