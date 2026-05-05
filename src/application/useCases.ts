import { Ok, Err, type Result } from '@/domain/result'
import type { RestError, McpError } from '@/domain/errors'
import {
  AgentId, ApiKey, RequestId, SessionId, UsdCents,
} from '@/domain/branded'
import type { Agent } from '@/domain/agent'
import type { McpToolName, McpSession } from '@/domain/scraper'
import type {
  RestApiPort, McpPort, AgentRepo, HistoryRepo, SessionRepo, WalletRepo, StoredWallet,
  ChatResponseWithMeta, ChatStreamChunk,
} from '@/application/ports'
import { runAgenticChat, type AgenticEvent, type RunAgenticParams } from '@/application/runAgenticChat'
import { runCouncilChat, makeRestChatPort } from '@/application/runCouncilChat'
import type { CouncilEvent } from '@/domain/councilEvents'
import type { CouncilConfig } from '@/domain/council'
import type { SdkConfig } from '@/infrastructure/sdk/sdkClient'
import type { ChatMessage } from '@/domain/chat'
import type { HistoryEntry } from '@/domain/history'
import type {
  HealthzResponse, BalanceResponse, ModelsResponse,
  ChatCompletionRequest, TransactionsResponse,
  GenerateWalletRequest, GenerateWalletResponse,
  RegisterAgentRequest,
  ClaimRequest, ClaimResponse,
} from '@/infrastructure/schemas/rest'
import type { McpToolResult } from '@/infrastructure/schemas/mcp'
import { withHistory } from './withHistory'

export type Deps = Readonly<{
  rest: RestApiPort
  mcp: McpPort
  agents: AgentRepo
  history: HistoryRepo
  sessions: SessionRepo
  wallets: WalletRepo
  now: () => Date
  newRequestId: () => string
  sdkConfig?: SdkConfig
}>

export type UseCases = Readonly<{
  healthCheck(): Promise<Result<HealthzResponse, RestError>>
  registerAgent(req: RegisterAgentRequest, color: string): Promise<Result<Agent, RestError>>
  fetchBalance(agent: AgentId, key: ApiKey): Promise<Result<BalanceResponse, RestError>>
  fetchModels(agent: AgentId, key: ApiKey, search?: string): Promise<Result<ModelsResponse, RestError>>
  generateWallet(agent: AgentId, key: ApiKey, req: GenerateWalletRequest): Promise<Result<GenerateWalletResponse, RestError>>
  executeChatCompletion(agent: AgentId, key: ApiKey, req: ChatCompletionRequest): Promise<Result<ChatResponseWithMeta, RestError>>
  streamChatCompletion(
    agent: AgentId, key: ApiKey, req: ChatCompletionRequest, signal: AbortSignal,
  ): AsyncGenerator<ChatStreamChunk, void, void>
  listTransactions(agent: AgentId, key: ApiKey, params: Readonly<{ type?: 'deposit' | 'usage' | 'refund'; limit?: number; offset?: number }>): Promise<Result<TransactionsResponse, RestError>>
  claimPlaygroundCredit(agent: AgentId, req: ClaimRequest): Promise<Result<ClaimResponse, RestError>>
  callScraperTool(agent: AgentId, key: ApiKey, tool: McpToolName, params: unknown, signal?: AbortSignal): Promise<Result<McpToolResult, McpError>>
  openSession(agent: AgentId, key: ApiKey, proxyTier: 'none' | 'datacenter' | 'residential', initialUrl?: string): Promise<Result<SessionId, McpError>>
  closeSession(agent: AgentId, key: ApiKey, sessionId: SessionId): Promise<Result<void, McpError>>
  listAgents(): Promise<readonly Agent[]>
  removeAgentLocal(id: AgentId): Promise<void>
  listSessionsFor(agent: AgentId): Promise<readonly McpSession[]>
  listWalletsFor(agent: AgentId): Promise<readonly StoredWallet[]>
  removeWalletLocal(agent: AgentId, chain: 'solana' | 'polygon', token: 'USDT' | 'USDC'): Promise<void>
  runAgenticChat(
    agent: AgentId, key: ApiKey,
    params: Readonly<{
      model: string
      messages: readonly ChatMessage[]
      maxIterations?: number
      signal?: AbortSignal
      reasoning?: { effort?: 'low' | 'medium' | 'high'; max_tokens?: number }
      include_reasoning?: boolean
    }>,
  ): AsyncGenerator<AgenticEvent, void, void>
  runCouncilChat(
    agent: AgentId, key: ApiKey,
    params: Readonly<{ config: CouncilConfig; userTask: string }>,
  ): AsyncGenerator<CouncilEvent, void, void>
}>

export function makeUseCases(deps: Deps): UseCases {
  const track = <T, E extends RestError | McpError>(
    agent: AgentId, kind: 'rest' | 'mcp', endpoint: string, request: unknown,
    action: () => Promise<Result<T, E>>,
  ): Promise<Result<T, E>> =>
    withHistory(
      {
        historyRepo: deps.history,
        agentId: agent,
        requestId: RequestId(deps.newRequestId()),
        kind,
        endpoint,
        request,
        now: deps.now,
      },
      action,
    )

  return {
    async healthCheck() {
      return deps.rest.healthz()
    },

    async registerAgent(req, color) {
      const res = await deps.rest.registerAgent(req)
      if (!res.ok) return res
      const agent: Agent = {
        id: AgentId(res.value.uuid),
        name: res.value.name,
        apiKey: ApiKey(res.value.apiKey),
        createdAt: new Date(res.value.createdAt),
        color,
      }
      await deps.agents.add(agent)
      return Ok(agent)
    },

    async fetchBalance(agent, key) {
      return track(agent, 'rest', 'GET /api/v1/balance', {}, () => deps.rest.getBalance(key))
    },

    async fetchModels(agent, key, search) {
      return track(agent, 'rest', 'GET /api/v1/models', { search }, () => deps.rest.listModels(key, search))
    },

    async generateWallet(agent, key, req) {
      const res = await track(agent, 'rest', 'POST /api/v1/wallets/generate', req, () => deps.rest.generateWallet(key, req))
      if (res.ok) {
        await deps.wallets.upsert(agent, {
          chain: res.value.chain,
          token: res.value.token,
          address: res.value.address,
          createdAt: res.value.createdAt,
        })
      }
      return res
    },

    async executeChatCompletion(agent, key, req) {
      return track(agent, 'rest', 'POST /v1/chat/completions', req, () => deps.rest.chatCompletion(key, req))
    },

    async *streamChatCompletion(agent, key, req, signal) {
      const requestId = RequestId(deps.newRequestId())
      const timestamp = deps.now()
      const started = Date.now()
      let fullText = ''
      let doneMeta: ChatStreamChunk | undefined
      try {
        for await (const chunk of deps.rest.chatCompletionStream(key, req, signal)) {
          if (chunk.kind === 'delta') fullText += chunk.text
          if (chunk.kind === 'done') doneMeta = chunk
          yield chunk
        }
      } finally {
        const durationMs = Date.now() - started
        const rawCost = doneMeta?.kind === 'done' ? doneMeta.meta.costCents : undefined
        const costCents = rawCost !== undefined && Number.isInteger(rawCost) && rawCost >= 0
          ? UsdCents(rawCost)
          : undefined
        await deps.history.add({
          id: requestId,
          agentId: agent,
          timestamp,
          kind: 'rest',
          endpoint: 'POST /v1/chat/completions (stream)',
          request: req,
          response: Ok({ fullText, meta: doneMeta?.kind === 'done' ? doneMeta.meta : {} }),
          ...(costCents !== undefined ? { costCents } : {}),
          durationMs,
        })
      }
    },

    async listTransactions(agent, key, params) {
      return track(agent, 'rest', 'GET /api/v1/transactions', params, () => deps.rest.listTransactions(key, params))
    },

    async claimPlaygroundCredit(agent, req) {
      return track(agent, 'rest', 'POST /api/v1/playground/claim', { agentUuid: req.agentUuid }, () => deps.rest.claimPlaygroundCredit(req))
    },

    async callScraperTool(agent, key, tool, params, signal) {
      return track(agent, 'mcp', `mcp:${tool}`, params, () => deps.mcp.callTool(key, tool, params, signal))
    },

    async openSession(agent, key, proxyTier, initialUrl) {
      const args: Record<string, unknown> = { proxy_tier: proxyTier }
      if (initialUrl) args['initial_url'] = initialUrl
      const res = await deps.mcp.callTool(key, 'session_create', args)
      if (!res.ok) return res
      const textItem = res.value.content.find(c => c.type === 'text')
      const raw = textItem && textItem.type === 'text' ? textItem.text : ''
      try {
        const parsed = JSON.parse(raw) as { session_id?: string }
        if (parsed.session_id) {
          const sid = SessionId(parsed.session_id)
          await deps.sessions.add(agent, {
            id: sid,
            createdAt: deps.now(),
            proxyTier,
            ...(initialUrl ? { initialUrl } : {}),
          })
          return Ok(sid)
        }
      } catch { /* fall through */ }
      return Err({ kind: 'invalid_params', details: 'session_create did not return session_id' })
    },

    async closeSession(agent, key, sessionId) {
      const res = await deps.mcp.callTool(key, 'session_close', { session_id: sessionId })
      if (!res.ok) return res
      await deps.sessions.remove(agent, sessionId)
      return Ok(undefined)
    },

    async listAgents() {
      return deps.agents.list()
    },

    async removeAgentLocal(id) {
      await deps.agents.remove(id)
    },

    async listSessionsFor(agent) {
      return deps.sessions.listByAgent(agent)
    },

    async listWalletsFor(agent) {
      return deps.wallets.listByAgent(agent)
    },

    async removeWalletLocal(agent, chain, token) {
      await deps.wallets.remove(agent, chain, token)
    },

    async *runAgenticChat(agent, key, params) {
      const runParams: RunAgenticParams = {
        model: params.model,
        messages: params.messages,
        ...(params.maxIterations !== undefined ? { maxIterations: params.maxIterations } : {}),
        ...(params.signal !== undefined ? { signal: params.signal } : {}),
        ...(params.reasoning !== undefined ? { reasoning: params.reasoning } : {}),
        ...(params.include_reasoning !== undefined ? { include_reasoning: params.include_reasoning } : {}),
      }
      yield* runAgenticChat(
        {
          agent,
          key,
          ...(deps.sdkConfig !== undefined ? { sdkConfig: deps.sdkConfig } : {}),
        },
        runParams,
      )
    },

    async *runCouncilChat(agent, key, params) {
      const chat = makeRestChatPort(deps.rest, key)
      const requestId = RequestId(deps.newRequestId())
      const startedAt = deps.now()
      let totalCostCents = 0
      let finalAnswer: string | undefined
      let lastError: { kind: string; message?: string } | undefined

      try {
        for await (const event of runCouncilChat({ chat }, params)) {
          if (event.kind === 'council_done') {
            totalCostCents = event.totalCostCents
            finalAnswer = event.finalAnswer
          } else if (event.kind === 'council_failed') {
            totalCostCents = event.partialCostCents
            lastError = { kind: event.error.kind }
          }
          yield event
        }
      } finally {
        const durationMs = Date.now() - startedAt.getTime()
        const entry: HistoryEntry = {
          id: requestId,
          agentId: agent,
          timestamp: startedAt,
          kind: 'rest',
          endpoint: 'POST /v1/chat/completions [council]',
          request: {
            chairman: String(params.config.chairman),
            drafters: params.config.drafters.map(String),
            userTask: params.userTask,
          },
          response: lastError
            ? Err({ kind: 'unknown', message: lastError.kind, raw: null } as RestError)
            : Ok({ finalAnswer: finalAnswer ?? '' }),
          // Council sums sub-cent fractions across 7 calls; UsdCents requires
          // an integer, so round to the nearest cent for history persistence.
          ...(totalCostCents > 0
            ? { costCents: UsdCents(Math.max(0, Math.round(totalCostCents))) }
            : {}),
          durationMs,
        }
        await deps.history.add(entry)
      }
    },
  }
}
