import { describe, expect, it } from 'vitest'
import { classifyHttpError } from '@/infrastructure/rest/classifyError'

describe('classifyHttpError', () => {
  it('401 → unauthorized', () => {
    expect(classifyHttpError(401, null, {})).toEqual({ kind: 'unauthorized' })
  })
  it('402 → insufficient_balance', () => {
    expect(classifyHttpError(402, null, {})).toEqual({ kind: 'insufficient_balance' })
  })
  it('429 with Retry-After seconds → rate_limited', () => {
    expect(classifyHttpError(429, null, { 'retry-after': '10' })).toEqual({
      kind: 'rate_limited', retryAfterMs: 10000,
    })
  })
  it('429 no header → default 1000ms', () => {
    expect(classifyHttpError(429, null, {})).toEqual({
      kind: 'rate_limited', retryAfterMs: 1000,
    })
  })
  it('5xx → upstream_error', () => {
    expect(classifyHttpError(502, { error: 'bad gateway' }, {})).toEqual({
      kind: 'upstream_error', status: 502, body: { error: 'bad gateway' },
    })
  })
  it('422 → validation with issues fallback', () => {
    const e = classifyHttpError(422, { message: 'bad' }, {})
    expect(e.kind).toBe('validation')
  })
})
