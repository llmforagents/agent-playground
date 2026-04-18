import type { AgentId } from '@/domain/branded'
import type { AppDb, WalletRow } from './db'
import { walletKey } from './db'
import type { StoredWallet, WalletRepo } from '@/application/ports'

export class DexieWalletRepo implements WalletRepo {
  constructor(private readonly db: AppDb) {}

  async listByAgent(agent: AgentId): Promise<readonly StoredWallet[]> {
    const rows = await this.db.wallets.where('agentId').equals(agent).toArray()
    return rows
      .map(rowToStored)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }

  async upsert(agent: AgentId, w: Omit<StoredWallet, 'lastSeenAt'>): Promise<StoredWallet> {
    const now = new Date().toISOString()
    const row: WalletRow = {
      walletKey: walletKey(agent, w.chain, w.token),
      agentId: agent,
      chain: w.chain,
      token: w.token,
      address: w.address,
      createdAt: w.createdAt,
      lastSeenAt: now,
    }
    await this.db.wallets.put(row)
    return rowToStored(row)
  }

  async remove(agent: AgentId, chain: 'solana' | 'polygon', token: 'USDT' | 'USDC'): Promise<void> {
    await this.db.wallets.delete(walletKey(agent, chain, token))
  }
}

function rowToStored(r: WalletRow): StoredWallet {
  return {
    chain: r.chain,
    token: r.token,
    address: r.address,
    createdAt: r.createdAt,
    lastSeenAt: r.lastSeenAt,
  }
}
