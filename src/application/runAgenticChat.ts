import { LLM4AgentsError, type McpToolResult } from '@llmforagents/sdk'
import type { AgentId, ApiKey } from '@/domain/branded'
import type { ChatMessage, DispatchMode } from '@/domain/chat'
import type { AppError } from '@/domain/errors'
import { coerceToAppError } from '@/domain/errors'
import type { ChatResponseMeta } from '@/application/ports'
import { createSdkClient, type SdkConfig } from '@/infrastructure/sdk/sdkClient'
import { translateSdkError } from '@/infrastructure/sdk/translateSdkError'

export type { DispatchMode }

export type AgenticAbortReason = 'tool_failed' | 'tool_cap_reached'

export type AgenticEvent =
  | { readonly kind: 'thinking'; readonly iteration: number; readonly mode: DispatchMode }
  | { readonly kind: 'assistant_text'; readonly text: string; readonly reasoning?: string }
  | { readonly kind: 'tool_call'; readonly callId: string; readonly toolName: string; readonly args: unknown }
  | { readonly kind: 'tool_result'; readonly callId: string; readonly toolName: string; readonly ok: boolean; readonly summary: string; readonly raw: unknown }
  | { readonly kind: 'final'; readonly text: string; readonly meta: ChatResponseMeta }
  | { readonly kind: 'mode_fallback'; readonly from: DispatchMode; readonly to: DispatchMode; readonly reason: string }
  | { readonly kind: 'max_iterations' }
  | { readonly kind: 'aborted'; readonly reason: AgenticAbortReason; readonly toolName: string; readonly detail: string }
  | { readonly kind: 'error'; readonly error: AppError }

const DEFAULT_MAX_TOOL_ROUNDS = 3

const BASE_SYSTEM_PROMPT = `You are a helpful assistant with access to real-time tools:
- google_search, google_news, google_maps: for current events, facts, sports scores, prices, news, places, or anything time-sensitive.
- fetch_html, markdown, links, extract: to read and process specific web pages.
- generate_image, edit_image: to produce or modify PNG images. The rendered image is shown DIRECTLY to the user by the client.
- analyze_image: vision/OCR. Returns a text answer about an image.

IMPORTANT behavior:
- Whenever the user asks about current events, dates, prices, sports, news, places, or any fact that might be outdated, CALL a tool instead of answering from memory or asking for clarification.
- If the user mentions a date without a year, assume the current/upcoming season and search. Do not ask for the year — just search.
- If the user writes in Spanish, respond in Spanish. The tool arguments should be in the appropriate language for the query.
- After getting tool results, summarize the answer clearly and cite sources (URLs) when relevant.
- If a tool fails, briefly explain and try a different approach.
- Prefer ONE combined search query when asking about multiple related items (e.g. "Bitcoin Ethereum Solana price today" instead of three separate searches).
- CRITICAL for image tools: generate_image and edit_image succeed when they return an "image" content block. The image has already been rendered to the user by the client. After a successful image call, reply with ONE short confirmation sentence. Do NOT call the image tool again. Do NOT try to include the base64 in your reply. Do NOT describe what you drew unless the user asks.
- Never call the same tool with the same arguments twice in one conversation — the second call will cost money and return the same result.
- If a previous assistant message in the conversation starts with "⚠️", that turn FAILED. Do NOT re-execute or re-attempt that user request. Treat it as already-handled context and focus exclusively on the LATEST user message.`

export type RunAgenticParams = Readonly<{
  model: string
  messages: readonly ChatMessage[]
  maxIterations?: number
  signal?: AbortSignal
  reasoning?: { effort?: 'low' | 'medium' | 'high'; max_tokens?: number }
  include_reasoning?: boolean
}>

export type RunAgenticDeps = Readonly<{
  agent: AgentId
  key: ApiKey
  sdkConfig?: SdkConfig
}>

type ConversationOptions = Parameters<ReturnType<typeof createSdkClient>['chat']['conversation']>[0]
type ConversationHistory = NonNullable<ConversationOptions['history']>

export async function* runAgenticChat(
  deps: RunAgenticDeps,
  params: RunAgenticParams,
): AsyncGenerator<AgenticEvent, void, void> {
  const sdk = createSdkClient(deps.key, deps.sdkConfig)

  // The playground passes a flat list ending in the new user message. The SDK
  // Conversation takes the prior turns as `history` and the latest as the
  // argument to `stream()`.
  const userVisible = params.messages.filter((m) => m.role !== 'system')
  const last = userVisible[userVisible.length - 1]
  if (!last || last.role !== 'user') {
    yield { kind: 'error', error: { kind: 'unknown', message: 'Last message must be user', raw: null } }
    return
  }
  const history: ConversationHistory = userVisible.slice(0, -1).map((m) => ({
    role: m.role,
    content: m.content,
  }))

  let currentMode: DispatchMode = 'native'
  let iteration = 0
  let bufferedText = ''
  let bufferedReasoning = ''
  let lastMeta: ChatResponseMeta = {}
  let callCounter = 0
  const inFlight: { id: string; name: string }[] = []
  let lastToolName = ''

  yield { kind: 'thinking', iteration, mode: currentMode }

  const conversationOpts: ConversationOptions = {
    model: params.model,
    system: BASE_SYSTEM_PROMPT,
    tools: sdk.tools,
    history,
    maxToolRounds: params.maxIterations ?? DEFAULT_MAX_TOOL_ROUNDS,
    enablePromptToolFallback: true,
    onRoundMeta: (m) => {
      lastMeta = mergeMeta(lastMeta, sdkMetaToChatMeta(m))
    },
    ...(params.signal ? { signal: params.signal } : {}),
  }
  const conv = sdk.chat.conversation(conversationOpts)

  try {
    for await (const ev of conv.stream(last.content)) {
      switch (ev.type) {
        case 'text':
          bufferedText += ev.content
          break
        case 'reasoning':
          bufferedReasoning += ev.content
          break
        case 'meta':
          lastMeta = mergeMeta(lastMeta, sdkMetaToChatMeta(ev.meta))
          break
        case 'tool_start': {
          const flushed = takeAssistantText(bufferedText, bufferedReasoning)
          bufferedText = ''
          bufferedReasoning = ''
          if (flushed) yield flushed
          callCounter += 1
          const id = `call_${callCounter}`
          inFlight.push({ id, name: ev.name })
          lastToolName = ev.name
          yield { kind: 'tool_call', callId: id, toolName: ev.name, args: ev.args }
          break
        }
        case 'tool_end': {
          const popped = inFlight.shift() ?? { id: `call_${callCounter}`, name: ev.name }
          yield {
            kind: 'tool_result',
            callId: popped.id,
            toolName: ev.name,
            ok: true,
            summary: describeToolResult(ev.result),
            raw: ev.result,
          }
          iteration += 1
          yield { kind: 'thinking', iteration, mode: currentMode }
          break
        }
        case 'fallback':
          currentMode = 'prompt'
          yield {
            kind: 'mode_fallback',
            from: 'native',
            to: 'prompt',
            reason: `Model ${ev.model} ignored native tool calls; using prompt-based JSON.`,
          }
          break
        case 'done': {
          const flushed = takeAssistantText(bufferedText, bufferedReasoning)
          bufferedText = ''
          bufferedReasoning = ''
          if (flushed && flushed.text !== ev.response.content) yield flushed
          yield { kind: 'final', text: ev.response.content, meta: lastMeta }
          return
        }
      }
    }
  } catch (e) {
    if (e instanceof LLM4AgentsError) {
      if (e.code === 'tool_loop_limit') {
        yield { kind: 'max_iterations' }
        return
      }
      if (e.code === 'tool_execution_error' || e.code === 'tool_not_found') {
        yield {
          kind: 'aborted',
          reason: 'tool_failed',
          toolName: lastToolName || 'unknown',
          detail: e.message,
        }
        return
      }
      yield { kind: 'error', error: translateSdkError(e) }
      return
    }
    if (e instanceof DOMException && e.name === 'AbortError') {
      yield { kind: 'error', error: { kind: 'timeout', endpoint: 'agentic' } }
      return
    }
    yield { kind: 'error', error: coerceToAppError(e) }
  }
}

type AssistantTextEvent = Extract<AgenticEvent, { kind: 'assistant_text' }>

function takeAssistantText(text: string, reasoning: string): AssistantTextEvent | null {
  if (!text && !reasoning) return null
  return reasoning
    ? { kind: 'assistant_text', text, reasoning }
    : { kind: 'assistant_text', text }
}

function describeToolResult(result: McpToolResult): string {
  const first = result.content[0]
  if (!first) return '(empty result)'
  if (first.type === 'text') {
    const t = first.text
    return t.length > 120 ? `${t.slice(0, 120)}…` : t
  }
  if (first.type === 'image') {
    return `Image rendered (${first.mimeType})`
  }
  if (first.type === 'resource') {
    return `Resource: ${first.mimeType ?? 'unknown'}`
  }
  return 'Unknown content'
}

type SdkResponseMeta = Readonly<{
  costUsdCents?: number | undefined
  tokensInput?: number | undefined
  tokensOutput?: number | undefined
  balanceRemainingCents?: number | undefined
  requestId?: string | undefined
}>

function sdkMetaToChatMeta(m: SdkResponseMeta): ChatResponseMeta {
  const out: { costCents?: number; tokensInput?: number; tokensOutput?: number; balanceRemainingCents?: number; requestId?: string } = {}
  if (m.costUsdCents !== undefined) out.costCents = m.costUsdCents
  if (m.tokensInput !== undefined) out.tokensInput = m.tokensInput
  if (m.tokensOutput !== undefined) out.tokensOutput = m.tokensOutput
  if (m.balanceRemainingCents !== undefined) out.balanceRemainingCents = m.balanceRemainingCents
  if (m.requestId !== undefined) out.requestId = m.requestId
  return out
}

// Cost-tracking fields accumulate across rounds; balance and requestId follow
// latest-wins. reasoning_tokens is not surfaced by SDK Conversation — known
// regression vs the prior in-house loop.
function mergeMeta(prev: ChatResponseMeta, next: ChatResponseMeta): ChatResponseMeta {
  const out: { costCents?: number; tokensInput?: number; tokensOutput?: number; balanceRemainingCents?: number; requestId?: string } = {}
  const sum = (a?: number, b?: number): number | undefined => {
    if (a === undefined && b === undefined) return undefined
    return (a ?? 0) + (b ?? 0)
  }
  const summedCost = sum(prev.costCents, next.costCents)
  const summedIn = sum(prev.tokensInput, next.tokensInput)
  const summedOut = sum(prev.tokensOutput, next.tokensOutput)
  if (summedCost !== undefined) out.costCents = summedCost
  if (summedIn !== undefined) out.tokensInput = summedIn
  if (summedOut !== undefined) out.tokensOutput = summedOut
  const bal = next.balanceRemainingCents ?? prev.balanceRemainingCents
  if (bal !== undefined) out.balanceRemainingCents = bal
  const rid = next.requestId ?? prev.requestId
  if (rid !== undefined) out.requestId = rid
  return out
}
