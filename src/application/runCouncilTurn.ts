import { LLM4AgentsError } from '@llmforagents/sdk'
import type { ApiKey, Model } from '@/domain/branded'
import type { CouncilToolName } from '@/domain/council'
import { COUNCIL_TOOL_NAMES } from '@/domain/council'
import type { AppError } from '@/domain/errors'
import { coerceToAppError } from '@/domain/errors'
import { createSdkClient, type SdkConfig } from '@/infrastructure/sdk/sdkClient'
import { translateSdkError } from '@/infrastructure/sdk/translateSdkError'

export type DrafterTurnEvent =
  | Readonly<{ kind: 'delta'; text: string }>
  | Readonly<{ kind: 'tool_call'; callId: string; toolName: CouncilToolName; args: unknown }>
  | Readonly<{ kind: 'tool_result'; callId: string; ok: boolean; summary: string }>

export type RunDrafterTurnDeps = Readonly<{
  key: ApiKey
  sdkConfig?: SdkConfig
}>

export type RunDrafterTurnParams = Readonly<{
  model: Model
  systemPrompt: string
  history: ReadonlyArray<Readonly<{ role: 'system' | 'user' | 'assistant'; content: string }>>
  userMessage: string
  allowedTools: ReadonlyArray<CouncilToolName>
  maxToolCalls: number
  signal?: AbortSignal
}>

export type RunDrafterTurnResult = Readonly<{
  content: string
  costCents: number
}>

function isAllowedTool(name: string, allowed: ReadonlyArray<CouncilToolName>): name is CouncilToolName {
  return (COUNCIL_TOOL_NAMES as ReadonlyArray<string>).includes(name) &&
    (allowed as ReadonlyArray<string>).includes(name)
}

function summarizeToolResult(result: unknown): { ok: boolean; summary: string } {
  if (!result || typeof result !== 'object') return { ok: false, summary: '(no result)' }
  const r = result as { isError?: boolean; content?: ReadonlyArray<unknown> }
  const ok = r.isError !== true
  const first = r.content?.[0] as { type?: string; text?: string; mimeType?: string } | undefined
  if (!first) return { ok, summary: ok ? '(empty result)' : 'tool returned isError without content' }
  if (first.type === 'text' && typeof first.text === 'string') {
    const t = first.text
    return { ok, summary: t.length > 120 ? `${t.slice(0, 120)}…` : t }
  }
  if (first.type === 'image' && typeof first.mimeType === 'string') {
    return { ok, summary: `Image (${first.mimeType})` }
  }
  return { ok, summary: `${first.type ?? 'unknown'} result` }
}

type SdkConversationStreamEvent =
  | { type: 'text'; content: string }
  | { type: 'reasoning'; content: string }
  | { type: 'meta'; meta: { costUsdCents?: number } }
  | { type: 'tool_start'; name: string; args: Readonly<Record<string, unknown>> }
  | { type: 'tool_end'; name: string; result: unknown; durationMs: number }
  | { type: 'fallback'; reason: string; model: string }
  | { type: 'done'; response: { content: string } }

export async function* runDrafterTurnWithTools(
  deps: RunDrafterTurnDeps,
  params: RunDrafterTurnParams,
): AsyncGenerator<DrafterTurnEvent, RunDrafterTurnResult, void> {
  const sdk = createSdkClient(deps.key, deps.sdkConfig)

  let callsUsed = 0
  let costCents = 0
  let callCounter = 0
  const callIdStack: string[] = []

  const onToolCall = (name: string): boolean => {
    if (!isAllowedTool(name, params.allowedTools)) return false
    if (callsUsed >= params.maxToolCalls) return false
    callsUsed += 1
    return true
  }

  const conv = sdk.chat.conversation({
    model: String(params.model),
    system: params.systemPrompt,
    tools: sdk.tools,
    history: params.history.map((m) => ({ role: m.role, content: m.content })),
    onToolCall,
    onRoundMeta: (m) => {
      if (typeof m.costUsdCents === 'number') costCents += m.costUsdCents
    },
    enablePromptToolFallback: true,
    // Leave at least 2 rounds of LLM headroom after the tool budget so the
    // model can read its accumulated tool results and produce the final text.
    // Setting this equal to maxToolCalls (previous behavior) made the SDK
    // hit tool_loop_limit empty when the model exhausted the budget on tool
    // calls, returning content: '' that we still billed for.
    maxToolRounds: Math.max(2, params.maxToolCalls + 2),
    ...(params.signal ? { signal: params.signal } : {}),
  })

  let finalContent = ''
  try {
    for await (const raw of conv.stream(params.userMessage)) {
      const ev = raw as SdkConversationStreamEvent
      switch (ev.type) {
        case 'text':
          yield { kind: 'delta', text: ev.content }
          finalContent += ev.content
          break
        case 'tool_start': {
          if (!isAllowedTool(ev.name, params.allowedTools)) break
          callCounter += 1
          const callId = `call_${callCounter}`
          callIdStack.push(callId)
          yield {
            kind: 'tool_call',
            callId,
            toolName: ev.name,
            args: ev.args,
          }
          break
        }
        case 'tool_end': {
          const callId = callIdStack.shift() ?? `call_${callCounter}`
          const { ok, summary } = summarizeToolResult(ev.result)
          yield { kind: 'tool_result', callId, ok, summary }
          break
        }
        case 'done':
          if (ev.response.content) finalContent = ev.response.content
          break
        // 'reasoning', 'meta', 'fallback' are intentionally ignored here;
        // meta is consumed by onRoundMeta above.
      }
    }
  } catch (e) {
    if (e instanceof LLM4AgentsError) {
      if (e.code === 'tool_loop_limit') {
        // Non-fatal: the loop ended naturally. Return whatever content we accumulated.
        return { content: finalContent, costCents }
      }
      // Translate and rethrow as AppError so runCouncilChat's try/catch can classify
      // it as a drafter failure.
      throw translateSdkError(e) satisfies AppError
    }
    throw coerceToAppError(e)
  }
  return { content: finalContent, costCents }
}
