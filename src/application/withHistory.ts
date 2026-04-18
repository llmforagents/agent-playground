import type { Result } from '@/domain/result'
import type { AgentId, RequestId, UsdCents } from '@/domain/branded'
import type { AppError } from '@/domain/errors'
import type { HistoryEntry } from '@/domain/history'
import type { HistoryRepo } from '@/application/ports'

export type WithHistoryContext<Req> = Readonly<{
  historyRepo: HistoryRepo
  agentId: AgentId
  requestId: RequestId
  kind: 'rest' | 'mcp'
  endpoint: string
  request: Req
  now: () => Date
  extractCostCents?: (value: unknown) => UsdCents | undefined
}>

export async function withHistory<T, E extends AppError, Req>(
  ctx: WithHistoryContext<Req>,
  action: () => Promise<Result<T, E>>,
): Promise<Result<T, E>> {
  const started = Date.now()
  const timestamp = ctx.now()
  const result = await action()
  const durationMs = Date.now() - started
  const costCents = result.ok && ctx.extractCostCents
    ? ctx.extractCostCents(result.value)
    : undefined
  const entry: HistoryEntry = {
    id: ctx.requestId,
    agentId: ctx.agentId,
    timestamp,
    kind: ctx.kind,
    endpoint: ctx.endpoint,
    request: ctx.request,
    response: result as Result<unknown, AppError>,
    ...(costCents !== undefined ? { costCents } : {}),
    durationMs,
  }
  await ctx.historyRepo.add(entry)
  return result
}
