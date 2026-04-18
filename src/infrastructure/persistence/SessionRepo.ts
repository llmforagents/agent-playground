import type { AgentId, SessionId } from '@/domain/branded'
import type { McpSession } from '@/domain/scraper'
import type { SessionRepo } from '@/application/ports'
import { type AppDb, sessionKey, type SessionRow } from './db'

export class DexieSessionRepo implements SessionRepo {
  constructor(private readonly db: AppDb) {}
  async add(agentId: AgentId, session: McpSession): Promise<void> {
    const row: SessionRow = { ...session, agentId, sessionKey: sessionKey(agentId, session.id) }
    await this.db.sessions.put(row)
  }
  async listByAgent(id: AgentId): Promise<readonly McpSession[]> {
    const rows = await this.db.sessions.where('agentId').equals(id).toArray()
    return rows.map(({ agentId: _a, sessionKey: _k, ...rest }) => rest)
  }
  async remove(agentId: AgentId, sessionId: SessionId): Promise<void> {
    await this.db.sessions.delete(sessionKey(agentId, sessionId))
  }
}
