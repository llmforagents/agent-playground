type Brand<T, B extends string> = T & { readonly __brand: B }

export type ApiKey = Brand<string, 'ApiKey'>
export function ApiKey(raw: string): ApiKey {
  if (!raw || raw.length < 1) throw new Error('Invalid ApiKey: empty')
  return raw as ApiKey
}

export type AgentId = Brand<string, 'AgentId'>
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export function AgentId(raw: string): AgentId {
  if (!UUID_RE.test(raw)) throw new Error(`Invalid AgentId: ${raw}`)
  return raw as AgentId
}

export type SessionId = Brand<string, 'SessionId'>
export function SessionId(raw: string): SessionId {
  if (!raw) throw new Error('Invalid SessionId: empty')
  return raw as SessionId
}

export type UsdCents = Brand<number, 'UsdCents'>
export function UsdCents(raw: number): UsdCents {
  if (!Number.isInteger(raw) || raw < 0) throw new Error(`Invalid UsdCents: ${raw}`)
  return raw as UsdCents
}

export type RequestId = Brand<string, 'RequestId'>
export function RequestId(raw: string): RequestId {
  if (!raw) throw new Error('Invalid RequestId: empty')
  return raw as RequestId
}

export type ChainId = Brand<'solana' | 'polygon', 'ChainId'>
export function ChainId(raw: 'solana' | 'polygon'): ChainId {
  if (raw !== 'solana' && raw !== 'polygon') throw new Error(`Invalid ChainId: ${raw}`)
  return raw as ChainId
}

export type WalletAddress = Brand<string, 'WalletAddress'>
export function WalletAddress(raw: string): WalletAddress {
  if (!raw) throw new Error('Invalid WalletAddress: empty')
  return raw as WalletAddress
}

export type Model = Brand<string, 'Model'>
export function Model(raw: string): Model {
  if (!raw) throw new Error('Invalid Model: empty')
  return raw as Model
}
