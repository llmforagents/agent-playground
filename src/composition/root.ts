import { RestApiClient } from '@/infrastructure/rest/RestApiClient'
import { McpClient } from '@/infrastructure/mcp/McpClient'
import { createDb } from '@/infrastructure/persistence/db'
import { DexieAgentRepo } from '@/infrastructure/persistence/AgentRepo'
import { DexieHistoryRepo } from '@/infrastructure/persistence/HistoryRepo'
import { DexieSessionRepo } from '@/infrastructure/persistence/SessionRepo'
import { DexieWalletRepo } from '@/infrastructure/persistence/WalletRepo'
import { makeUseCases, type UseCases } from '@/application/useCases'
import { safeRandomUUID } from '@/lib/uuid'
import type { AppEnv, ClaimConfig } from './env'

export type AppContainer = Readonly<{
  useCases: UseCases
  claim?: ClaimConfig
}>

export function composeApp(env: AppEnv): AppContainer {
  const rest = new RestApiClient(env.apiBase, env.mcpBase)
  const mcp = new McpClient(env.mcpBase)
  const db = createDb()
  const agents = new DexieAgentRepo(db)
  const history = new DexieHistoryRepo(db)
  const sessions = new DexieSessionRepo(db)
  const wallets = new DexieWalletRepo(db)
  const useCases = makeUseCases({
    rest,
    mcp,
    agents,
    history,
    sessions,
    wallets,
    now: () => new Date(),
    newRequestId: () => safeRandomUUID(),
  })
  return env.claim ? { useCases, claim: env.claim } : { useCases }
}
