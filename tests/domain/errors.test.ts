import { describe, expect, it } from 'vitest'
import { type RestError, type McpError, describeError } from '@/domain/errors'

describe('errors', () => {
  it('describeError handles every RestError kind', () => {
    const cases: readonly RestError[] = [
      { kind: 'network' },
      { kind: 'timeout', endpoint: '/x' },
      { kind: 'unauthorized' },
      { kind: 'insufficient_balance' },
      { kind: 'rate_limited', retryAfterMs: 1000 },
      { kind: 'validation', issues: [] },
      { kind: 'upstream_error', status: 502, body: null },
    ]
    for (const c of cases) {
      expect(describeError(c)).toBeTypeOf('string')
      expect(describeError(c).length).toBeGreaterThan(0)
    }
  })

  it('describeError handles McpError kinds', () => {
    const a: McpError = { kind: 'jsonrpc_error', code: -32000, message: 'bad' }
    const b: McpError = { kind: 'invalid_params', details: 'url missing' }
    expect(describeError(a)).toMatch(/bad/)
    expect(describeError(b)).toMatch(/url missing/)
  })
})
