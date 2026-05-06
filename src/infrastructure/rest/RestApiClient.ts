import { z } from 'zod'
import { Err, Ok, type Result } from '@/domain/result'
import type { RestError } from '@/domain/errors'
import type { ApiKey } from '@/domain/branded'
import {
  HealthzSchema, RegisterAgentResponseSchema, BalanceResponseSchema,
  GenerateWalletResponseSchema, ModelsResponseSchema,
  ChatCompletionResponseSchema, TransactionsResponseSchema,
  ClaimResponseSchema,
  type RegisterAgentRequest, type GenerateWalletRequest,
  type ChatCompletionRequest, type ClaimRequest,
  type ChatCompletionResponse, type BalanceResponse, type GenerateWalletResponse,
  type TransactionsResponse,
} from '@/infrastructure/schemas/rest'
import { classifyHttpError } from './classifyError'
import { createSdkClient } from '@/infrastructure/sdk/sdkClient'
import { callSdk } from '@/infrastructure/sdk/translateSdkError'
import type { LLM4AgentsClient } from '@llmforagents/sdk'
import type {
  RestApiPort, ChatResponseWithMeta, ChatResponseMeta, ChatStreamChunk,
} from '@/application/ports'
import type { ZodLikeIssue } from '@/domain/errors'

const DEFAULT_TIMEOUT_MS = 60_000

function zodIssuesToZodLike(
  issues: readonly { readonly path: readonly PropertyKey[]; readonly message: string }[],
): readonly ZodLikeIssue[] {
  return issues.map(i => ({
    path: i.path.filter((p): p is string | number =>
      typeof p === 'string' || typeof p === 'number'),
    message: i.message,
  }))
}

function validate<T>(schema: z.ZodType<T>, raw: unknown): Result<T, RestError> {
  const parsed = schema.safeParse(raw)
  if (!parsed.success) {
    return Err({ kind: 'validation', issues: zodIssuesToZodLike(parsed.error.issues) })
  }
  return Ok(parsed.data)
}

export class RestApiClient implements RestApiPort {
  constructor(private readonly apiBase: string, _mcpBase: string) {}

  async healthz() {
    return this.getJson('/healthz', HealthzSchema)
  }

  async registerAgent(req: RegisterAgentRequest) {
    return this.postJson('/api/v1/agents/register', req, RegisterAgentResponseSchema)
  }

  async getBalance(key: ApiKey): Promise<Result<BalanceResponse, RestError>> {
    const sdk = createSdkClient(key, { baseUrl: this.apiBase })
    const r = await callSdk(() => sdk.wallets.balance())
    if (!r.ok) return r
    return validate(BalanceResponseSchema, r.value)
  }

  async listModels(key: ApiKey, search?: string) {
    const sdk = createSdkClient(key, { baseUrl: this.apiBase })
    const r = await callSdk(() => sdk.models.list(search ? { search } : undefined))
    if (!r.ok) return r
    return validate(ModelsResponseSchema, r.value)
  }

  async generateWallet(
    key: ApiKey, req: GenerateWalletRequest,
  ): Promise<Result<GenerateWalletResponse, RestError>> {
    const sdk = createSdkClient(key, { baseUrl: this.apiBase })
    const r = await callSdk(() => sdk.wallets.generate({ chain: req.chain, token: req.token }))
    if (!r.ok) return r
    return validate(GenerateWalletResponseSchema, r.value)
  }

  async chatCompletion(
    key: ApiKey, req: ChatCompletionRequest,
  ): Promise<Result<ChatResponseWithMeta, RestError>> {
    const sdk = createSdkClient(key, { baseUrl: this.apiBase })
    let capturedMeta: SdkResponseMeta | undefined
    const callRes = await callSdk(() =>
      sdk.chat.completions.create(toSdkNonStreamParams(req), { onMeta: (m) => { capturedMeta = m } })
    )
    if (!callRes.ok) return callRes
    const parsed = ChatCompletionResponseSchema.safeParse(callRes.value)
    if (!parsed.success) {
      return Err({ kind: 'validation', issues: zodIssuesToZodLike(parsed.error.issues) })
    }
    const reasoningTokens = extractReasoningTokens(parsed.data)
    const usage = parsed.data.usage as SseUsage | undefined
    return Ok({ data: parsed.data, meta: metaFromSdk(capturedMeta, reasoningTokens, usage) })
  }

  async *chatCompletionStream(
    key: ApiKey, req: ChatCompletionRequest, signal: AbortSignal, timeoutMs?: number,
  ): AsyncGenerator<ChatStreamChunk, void, void> {
    const sdk = createSdkClient(
      key,
      timeoutMs !== undefined
        ? { baseUrl: this.apiBase, timeout: timeoutMs }
        : { baseUrl: this.apiBase },
    )
    let capturedMeta: SdkResponseMeta | undefined
    let finalReasoningTokens: number | undefined
    let stream: Awaited<ReturnType<SdkChatCompletions['create']>> & AsyncIterable<unknown>
    try {
      const result = await sdk.chat.completions.create(toSdkStreamParams(req), {
        signal,
        onMeta: (m) => { capturedMeta = m },
        onFinalUsage: (u) => { finalReasoningTokens = u.reasoningTokens },
      })
      stream = result as typeof stream
    } catch {
      // Match prior behavior: on transport error, terminate silently without
      // yielding 'done'. The caller's UI handles the absence of completion.
      return
    }
    let full = ''
    let fullReasoning = ''
    let lastUsage: SseUsage | undefined
    for await (const raw of stream) {
      const chunk = raw as {
        choices?: readonly { delta?: { content?: string; reasoning?: string } }[]
        usage?: SseUsage
      }
      if (chunk.usage) lastUsage = chunk.usage
      const delta = chunk.choices?.[0]?.delta
      const contentDelta = delta?.content ?? ''
      const reasoningDelta = delta?.reasoning ?? ''
      if (reasoningDelta) {
        fullReasoning += reasoningDelta
        yield { kind: 'reasoning_delta', text: reasoningDelta }
      }
      if (contentDelta) {
        full += contentDelta
        yield { kind: 'delta', text: contentDelta }
      }
    }
    // SDK 2.3.1 onFinalUsage looks for `lastUsage.reasoning_tokens` (top-level)
    // but providers nest it under `completion_tokens_details.reasoning_tokens`.
    // Likewise streaming responses rarely carry the x-tokens/x-cost HTTP headers
    // that `onMeta` reads. Build meta from the SSE `usage` chunk as a fallback.
    yield {
      kind: 'done',
      fullText: full,
      meta: metaFromSdk(capturedMeta, finalReasoningTokens, lastUsage),
      ...(fullReasoning ? { fullReasoning } : {}),
    }
  }

  async claimPlaygroundCredit(req: ClaimRequest) {
    return this.postJson('/api/v1/playground/claim', req, ClaimResponseSchema)
  }

  async listTransactions(
    key: ApiKey, params: Readonly<{ type?: 'deposit' | 'usage' | 'refund'; limit?: number; offset?: number }>,
  ): Promise<Result<TransactionsResponse, RestError>> {
    const sdk = createSdkClient(key, { baseUrl: this.apiBase })
    const filter: Parameters<typeof sdk.wallets.transactions>[0] = {
      ...(params.type !== undefined ? { type: params.type } : {}),
      ...(params.limit !== undefined ? { limit: params.limit } : {}),
      ...(params.offset !== undefined ? { offset: params.offset } : {}),
    }
    const r = await callSdk(() => sdk.wallets.transactions(filter))
    if (!r.ok) return r
    return validate(TransactionsResponseSchema, r.value)
  }

  private async getJson<T>(
    path: string, schema: z.ZodType<T>, key?: ApiKey,
  ): Promise<Result<T, RestError>> {
    const res = await this.fetchSafe(`${this.apiBase}${path}`, {
      method: 'GET',
      headers: key ? { authorization: `Bearer ${key}` } : {},
    })
    if (!res.ok) return res
    const body = await res.value.response.json()
    const parsed = schema.safeParse(body)
    if (!parsed.success) {
      return Err({ kind: 'validation', issues: zodIssuesToZodLike(parsed.error.issues) })
    }
    return Ok(parsed.data)
  }

  private async postJson<T, B>(
    path: string, body: B, schema: z.ZodType<T>, key?: ApiKey,
  ): Promise<Result<T, RestError>> {
    const res = await this.fetchSafe(`${this.apiBase}${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(key ? { authorization: `Bearer ${key}` } : {}),
      },
      body: JSON.stringify(body),
    })
    if (!res.ok) return res
    const parsed = schema.safeParse(await res.value.response.json())
    if (!parsed.success) {
      return Err({ kind: 'validation', issues: zodIssuesToZodLike(parsed.error.issues) })
    }
    return Ok(parsed.data)
  }

  private async fetchSafe(
    url: string, init: RequestInit,
  ): Promise<Result<{ response: Response }, RestError>> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS)
    try {
      const response = await fetch(url, { ...init, signal: controller.signal })
      if (!response.ok) {
        const headersObj: Record<string, string> = {}
        response.headers.forEach((v, k) => { headersObj[k.toLowerCase()] = v })
        const bodyText = await response.text()
        let parsed: unknown = null
        try { parsed = JSON.parse(bodyText) } catch { parsed = bodyText }
        return Err(classifyHttpError(response.status, parsed, headersObj))
      }
      return Ok({ response })
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') {
        return Err({ kind: 'timeout', endpoint: url })
      }
      return Err({ kind: 'network' })
    } finally {
      clearTimeout(timer)
    }
  }
}

type SdkChatCompletions = LLM4AgentsClient['chat']['completions']
type SdkResponseMeta = NonNullable<Parameters<SdkChatCompletions['create']>[1]>['onMeta'] extends ((m: infer M) => void) | undefined ? M : never

type SseUsage = Readonly<{
  prompt_tokens?: number
  completion_tokens?: number
  cost?: number
  completion_tokens_details?: Readonly<{ reasoning_tokens?: number }>
}>

function metaFromSdk(
  m: SdkResponseMeta | undefined,
  reasoningTokens?: number,
  usage?: SseUsage,
): ChatResponseMeta {
  const out: { costCents?: number; tokensInput?: number; tokensOutput?: number; balanceRemainingCents?: number; requestId?: string; reasoningTokens?: number } = {}
  // Prefer SDK headers/callback values; fall back to SSE `usage` chunk fields.
  const costCents = m?.costUsdCents ?? (usage?.cost !== undefined ? usage.cost * 100 : undefined)
  const tokensInput = m?.tokensInput ?? usage?.prompt_tokens
  const tokensOutput = m?.tokensOutput ?? usage?.completion_tokens
  const reasoning = reasoningTokens ?? usage?.completion_tokens_details?.reasoning_tokens
  if (costCents !== undefined) out.costCents = costCents
  if (tokensInput !== undefined) out.tokensInput = tokensInput
  if (tokensOutput !== undefined) out.tokensOutput = tokensOutput
  if (m?.balanceRemainingCents !== undefined) out.balanceRemainingCents = m.balanceRemainingCents
  if (m?.requestId !== undefined) out.requestId = m.requestId
  if (reasoning !== undefined) out.reasoningTokens = reasoning
  return out
}

// The SDK types `reasoning?: boolean` but the proxy accepts the OpenRouter
// object shape `{ effort?: 'low'|'medium'|'high'; max_tokens?: number }` and
// the SDK passes the field through unchanged. Bypass the type at the boundary
// rather than narrow the playground's richer schema.
type SdkNonStreamParams = Parameters<SdkChatCompletions['create']>[0] & { stream?: false }
type SdkStreamParams = Parameters<SdkChatCompletions['create']>[0] & { stream: true }

function toSdkNonStreamParams(req: ChatCompletionRequest): SdkNonStreamParams {
  return { ...req, stream: false } as unknown as SdkNonStreamParams
}

function toSdkStreamParams(req: ChatCompletionRequest): SdkStreamParams {
  return { ...req, stream: true } as unknown as SdkStreamParams
}

function extractReasoningTokens(data: ChatCompletionResponse): number | undefined {
  const usage = data.usage as { completion_tokens_details?: { reasoning_tokens?: number } } | undefined
  const n = usage?.completion_tokens_details?.reasoning_tokens
  return typeof n === 'number' && n >= 0 ? n : undefined
}
