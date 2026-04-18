import { describe, expect, it } from 'vitest'
import { loadEnv } from '@/composition/env'

describe('loadEnv', () => {
  it('accepts valid env', () => {
    expect(loadEnv({ VITE_API_BASE: '/proxy/api', VITE_MCP_BASE: '/proxy/mcp' })).toEqual({
      apiBase: '/proxy/api',
      mcpBase: '/proxy/mcp',
    })
  })

  it('rejects missing', () => {
    expect(() => loadEnv({})).toThrowError(/VITE_API_BASE/)
  })
})
