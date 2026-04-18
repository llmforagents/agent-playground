import Dexie, { type Table } from 'dexie'
import type { Agent } from '@/domain/agent'
import type { HistoryEntry } from '@/domain/history'
import type { McpSession } from '@/domain/scraper'
import type { AgentId, SessionId } from '@/domain/branded'

export type SessionRow = McpSession & { agentId: AgentId; sessionKey: string }

export type WalletRow = Readonly<{
  walletKey: string
  agentId: AgentId
  chain: 'solana' | 'polygon'
  token: 'USDT' | 'USDC'
  address: string
  createdAt: string
  lastSeenAt: string
}>

export class AppDb extends Dexie {
  agents!: Table<Agent, AgentId>
  history!: Table<HistoryEntry, string>
  sessions!: Table<SessionRow, string>
  wallets!: Table<WalletRow, string>

  constructor(name = 'llm4agents-dashboard') {
    super(name)
    this.version(1).stores({
      agents: 'id, name, createdAt',
      history: 'id, agentId, timestamp, kind, endpoint',
      sessions: 'sessionKey, agentId, id, createdAt',
    })
    this.version(2).stores({
      agents: 'id, name, createdAt',
      history: 'id, agentId, timestamp, kind, endpoint',
      sessions: 'sessionKey, agentId, id, createdAt',
      wallets: 'walletKey, agentId, chain, token, createdAt',
    })
  }
}

export function createDb(name?: string): AppDb {
  return new AppDb(name)
}

export function sessionKey(agentId: AgentId, sessionId: SessionId): string {
  return `${agentId}::${sessionId}`
}

export function walletKey(agentId: AgentId, chain: 'solana' | 'polygon', token: 'USDT' | 'USDC'): string {
  return `${agentId}::${chain}::${token}`
}
