import { z } from 'zod'
import { Err, Ok, type Result } from '@/domain/result'
import type { RestError } from '@/domain/errors'
import type { ApiKey } from '@/domain/branded'
import {
  HealthzSchema, RegisterAgentResponseSchema, BalanceResponseSchema,
  GenerateWalletResponseSchema, ModelsResponseSchema,
  ChatCompletionResponseSchema, TransactionsResponseSchema,
  TxSendResponseSchema, ClaimResponseSchema,
  type RegisterAgentRequest, type GenerateWalletRequest,
  type ChatCompletionRequest, type TxSendRequest, type ClaimRequest,
} from '@/infrastructure/schemas/rest'
import { classifyHttpError } from './classifyError'
import { parseSseStream } from '@/infrastructure/stream/sseParser'
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

export class RestApiClient implements RestApiPort {
  constructor(private readonly apiBase: string, _mcpBase: string) {}

  async healthz() {
    return this.getJson('/healthz', HealthzSchema)
  }

  async registerAgent(req: RegisterAgentRequest) {
    return this.postJson('/api/v1/agents/register', req, RegisterAgentResponseSchema)
  }

  async getBalance(key: ApiKey) {
    return this.getJson('/api/v1/balance', BalanceResponseSchema, key)
  }

  async listModels(key: ApiKey, search?: string) {
    const qs = search ? `?search=${encodeURIComponent(search)}` : ''
    return this.getJson(`/api/v1/models${qs}`, ModelsResponseSchema, key)
  }

  async generateWallet(key: ApiKey, req: GenerateWalletRequest) {
    return this.postJson('/api/v1/wallets/generate', req, GenerateWalletResponseSchema, key)
  }

  async chatCompletion(
    key: ApiKey, req: ChatCompletionRequest,
  ): Promise<Result<ChatResponseWithMeta, RestError>> {
    const url = `${this.apiBase}/v1/chat/completions`
    const res = await this.fetchSafe(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      body: JSON.stringify({ ...req, stream: false }),
    })
    if (!res.ok) return res
    const { response } = res.value
    const parsed = ChatCompletionResponseSchema.safeParse(await response.json())
    if (!parsed.success) {
      return Err({ kind: 'validation', issues: zodIssuesToZodLike(parsed.error.issues) })
    }
    return Ok({ data: parsed.data, meta: extractMeta(response.headers) })
  }

  async *chatCompletionStream(
    key: ApiKey, req: ChatCompletionRequest, signal: AbortSignal,
  ): AsyncGenerator<ChatStreamChunk, void, void> {
    const url = `${this.apiBase}/v1/chat/completions`
    const res = await fetch(url, {
      method: 'POST',
      signal,
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${key}`,
        accept: 'text/event-stream',
      },
      body: JSON.stringify({ ...req, stream: true }),
    })
    if (!res.ok || !res.body) {
      return
    }
    let full = ''
    for await (const ev of parseSseStream(res.body)) {
      if (ev.data === '[DONE]') {
        yield { kind: 'done', fullText: full, meta: extractMeta(res.headers) }
        return
      }
      try {
        const chunk = JSON.parse(ev.data) as { choices?: { delta?: { content?: string } }[] }
        const delta = chunk.choices?.[0]?.delta?.content ?? ''
        if (delta) {
          full += delta
          yield { kind: 'delta', text: delta }
        }
      } catch { /* ignore malformed chunks */ }
    }
    yield { kind: 'done', fullText: full, meta: extractMeta(res.headers) }
  }

  async sendTx(key: ApiKey, req: TxSendRequest) {
    return this.postJson('/v1/tx/send', req, TxSendResponseSchema, key)
  }

  async claimPlaygroundCredit(req: ClaimRequest) {
    return this.postJson('/api/v1/playground/claim', req, ClaimResponseSchema)
  }

  async listTransactions(
    key: ApiKey, params: Readonly<{ type?: 'deposit' | 'usage' | 'refund'; limit?: number; offset?: number }>,
  ) {
    const qs = new URLSearchParams()
    if (params.type) qs.set('type', params.type)
    if (params.limit !== undefined) qs.set('limit', String(params.limit))
    if (params.offset !== undefined) qs.set('offset', String(params.offset))
    const suffix = qs.toString() ? `?${qs.toString()}` : ''
    return this.getJson(`/api/v1/transactions${suffix}`, TransactionsResponseSchema, key)
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

function extractMeta(headers: Headers): ChatResponseMeta {
  const costStr = headers.get('x-cost-usd-cents')
  const inStr = headers.get('x-tokens-input')
  const outStr = headers.get('x-tokens-output')
  const balStr = headers.get('x-balance-remaining-cents')
  const reqId = headers.get('x-request-id') ?? undefined
  const meta: { costCents?: number; tokensInput?: number; tokensOutput?: number; balanceRemainingCents?: number; requestId?: string } = {}
  if (costStr !== null) meta.costCents = Number(costStr)
  if (inStr !== null) meta.tokensInput = Number(inStr)
  if (outStr !== null) meta.tokensOutput = Number(outStr)
  if (balStr !== null) meta.balanceRemainingCents = Number(balStr)
  if (reqId !== undefined) meta.requestId = reqId
  return meta
}
