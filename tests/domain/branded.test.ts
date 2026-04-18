import { describe, expect, it } from 'vitest'
import {
  ApiKey, AgentId, SessionId, UsdCents, RequestId,
  ChainId, WalletAddress, Model,
} from '@/domain/branded'

describe('branded types', () => {
  it('ApiKey accepts non-empty string', () => {
    expect(ApiKey('sk_abc')).toBe('sk_abc')
  })
  it('ApiKey rejects empty', () => {
    expect(() => ApiKey('')).toThrowError(/ApiKey/)
  })
  it('AgentId requires uuid-ish string', () => {
    expect(AgentId('11111111-1111-4111-8111-111111111111')).toBeDefined()
    expect(() => AgentId('not-a-uuid')).toThrowError(/AgentId/)
  })
  it('SessionId is non-empty', () => {
    expect(SessionId('sess_1')).toBe('sess_1')
    expect(() => SessionId('')).toThrowError()
  })
  it('UsdCents requires non-negative integer', () => {
    expect(UsdCents(0)).toBe(0)
    expect(UsdCents(100)).toBe(100)
    expect(() => UsdCents(-1)).toThrowError()
    expect(() => UsdCents(1.5)).toThrowError()
  })
  it('RequestId is non-empty', () => {
    expect(RequestId('req_1')).toBe('req_1')
  })
  it('ChainId accepts solana and polygon', () => {
    expect(ChainId('solana')).toBe('solana')
    expect(ChainId('polygon')).toBe('polygon')
    expect(() => ChainId('ethereum' as 'solana')).toThrowError()
  })
  it('WalletAddress requires non-empty string', () => {
    expect(WalletAddress('0xabc')).toBe('0xabc')
    expect(() => WalletAddress('')).toThrowError()
  })
  it('Model requires non-empty string', () => {
    expect(Model('gemini-2.5-flash-lite')).toBe('gemini-2.5-flash-lite')
    expect(() => Model('')).toThrowError()
  })
})
