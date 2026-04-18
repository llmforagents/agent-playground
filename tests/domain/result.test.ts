import { describe, expect, it } from 'vitest'
import { Ok, Err, type Result, assertNever } from '@/domain/result'

describe('Result', () => {
  it('Ok carries a value', () => {
    const r: Result<number, string> = Ok(42)
    expect(r).toEqual({ ok: true, value: 42 })
  })

  it('Err carries an error', () => {
    const r: Result<number, string> = Err('boom')
    expect(r).toEqual({ ok: false, error: 'boom' })
  })

  it('assertNever throws on any value', () => {
    expect(() => assertNever('x' as never)).toThrowError(/Unexpected/)
  })
})
