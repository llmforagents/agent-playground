import type { Agent } from '@/domain/agent'
import type { AgentId } from '@/domain/branded'
import type { AgentRepo } from '@/application/ports'
import type { AppDb } from './db'

export class DexieAgentRepo implements AgentRepo {
  constructor(private readonly db: AppDb) {}
  async list(): Promise<readonly Agent[]> {
    return await this.db.agents.orderBy('createdAt').toArray()
  }
  async add(agent: Agent): Promise<void> {
    await this.db.agents.put(agent)
  }
  async rename(id: AgentId, name: string): Promise<void> {
    await this.db.agents.update(id, { name })
  }
  async remove(id: AgentId): Promise<void> {
    await this.db.agents.delete(id)
  }
  async get(id: AgentId): Promise<Agent | undefined> {
    return await this.db.agents.get(id)
  }
}
