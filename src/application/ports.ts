import type { Result } from '@/domain/result'
import type { RestError, McpError } from '@/domain/errors'
import type { ApiKey, SessionId } from '@/domain/branded'
import type {
  HealthzResponse, RegisterAgentRequest, RegisterAgentResponse,
  BalanceResponse, GenerateWalletRequest, GenerateWalletResponse,
  ModelsResponse, ChatCompletionRequest, ChatCompletionResponse,
  TransactionsResponse,
  ClaimRequest, ClaimResponse,
} from '@/infrastructure/schemas/rest'
import type { McpToolResult } from '@/infrastructure/schemas/mcp'
import type { McpToolName } from '@/domain/scraper'
import type { Agent } from '@/domain/agent'
import type { HistoryEntry } from '@/domain/history'
import type { McpSession } from '@/domain/scraper'
import type { AgentId } from '@/domain/branded'

export type ChatResponseMeta = Readonly<{
  costCents?: number
  tokensInput?: number
  tokensOutput?: number
  reasoningTokens?: number
  balanceRemainingCents?: number
  requestId?: string
}>

export type ChatResponseWithMeta = Readonly<{
  data: ChatCompletionResponse
  meta: ChatResponseMeta
}>

export type ChatStreamChunk =
  | { readonly kind: 'delta'; readonly text: string }
  | { readonly kind: 'reasoning_delta'; readonly text: string }
  | { readonly kind: 'done'; readonly meta: ChatResponseMeta; readonly fullText: string; readonly fullReasoning?: string }

export interface RestApiPort {
  healthz(): Promise<Result<HealthzResponse, RestError>>
  registerAgent(req: RegisterAgentRequest): Promise<Result<RegisterAgentResponse, RestError>>
  getBalance(key: ApiKey): Promise<Result<BalanceResponse, RestError>>
  listModels(key: ApiKey, search?: string): Promise<Result<ModelsResponse, RestError>>
  generateWallet(key: ApiKey, req: GenerateWalletRequest): Promise<Result<GenerateWalletResponse, RestError>>
  chatCompletion(key: ApiKey, req: ChatCompletionRequest): Promise<Result<ChatResponseWithMeta, RestError>>
  chatCompletionStream(
    key: ApiKey, req: ChatCompletionRequest, signal: AbortSignal,
  ): AsyncGenerator<ChatStreamChunk, void, void>
  listTransactions(key: ApiKey, params: Readonly<{
    type?: 'deposit' | 'usage' | 'refund'; limit?: number; offset?: number
  }>): Promise<Result<TransactionsResponse, RestError>>
  claimPlaygroundCredit(req: ClaimRequest): Promise<Result<ClaimResponse, RestError>>
}

export interface McpPort {
  callTool(
    key: ApiKey, tool: McpToolName, params: unknown, signal?: AbortSignal,
  ): Promise<Result<McpToolResult, McpError>>
}

export interface AgentRepo {
  list(): Promise<readonly Agent[]>
  add(agent: Agent): Promise<void>
  rename(id: AgentId, name: string): Promise<void>
  remove(id: AgentId): Promise<void>
  get(id: AgentId): Promise<Agent | undefined>
}

export interface HistoryRepo {
  add(entry: HistoryEntry): Promise<void>
  listByAgent(id: AgentId, limit: number): Promise<readonly HistoryEntry[]>
  clear(id: AgentId): Promise<void>
}

export interface SessionRepo {
  add(agentId: AgentId, session: McpSession): Promise<void>
  listByAgent(id: AgentId): Promise<readonly McpSession[]>
  remove(agentId: AgentId, sessionId: SessionId): Promise<void>
}

export type StoredWallet = Readonly<{
  chain: 'solana' | 'polygon'
  token: 'USDT' | 'USDC'
  address: string
  createdAt: string
  lastSeenAt: string
}>

export interface WalletRepo {
  listByAgent(agent: AgentId): Promise<readonly StoredWallet[]>
  upsert(agent: AgentId, w: Omit<StoredWallet, 'lastSeenAt'>): Promise<StoredWallet>
  remove(agent: AgentId, chain: 'solana' | 'polygon', token: 'USDT' | 'USDC'): Promise<void>
}
