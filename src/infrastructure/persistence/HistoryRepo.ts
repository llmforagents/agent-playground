import type { HistoryEntry } from '@/domain/history'
import type { AgentId } from '@/domain/branded'
import type { HistoryRepo } from '@/application/ports'
import type { AppDb } from './db'

export class DexieHistoryRepo implements HistoryRepo {
  constructor(private readonly db: AppDb) {}
  async add(entry: HistoryEntry): Promise<void> {
    await this.db.history.put(entry)
  }
  async listByAgent(id: AgentId, limit: number): Promise<readonly HistoryEntry[]> {
    return await this.db.history
      .where('agentId').equals(id)
      .reverse()
      .sortBy('timestamp')
      .then(arr => arr.slice(0, limit))
  }
  async clear(id: AgentId): Promise<void> {
    await this.db.history.where('agentId').equals(id).delete()
  }
}
