import type { AgentId, RequestId, UsdCents } from './branded'
import type { Result } from './result'
import type { AppError } from './errors'

export type HistoryEntry = Readonly<{
  id: RequestId
  agentId: AgentId
  timestamp: Date
  kind: 'rest' | 'mcp'
  endpoint: string
  request: unknown
  response: Result<unknown, AppError>
  costCents?: UsdCents
  durationMs: number
}>
