import type { AgentId, ApiKey } from '@/domain/branded'
import type { ChatMessage } from '@/domain/chat'
import type { AppError, RestError } from '@/domain/errors'
import type { ChatResponseMeta, McpPort, RestApiPort } from '@/application/ports'
import type {
  ChatCompletionRequest,
  ChatMessageFull,
  ToolCall,
} from '@/infrastructure/schemas/rest'
import type { McpToolResult } from '@/infrastructure/schemas/mcp'
import { CHAT_TOOLS, findChatTool } from '@/domain/chatTools'

export type AgenticAbortReason = 'tool_failed' | 'tool_cap_reached'

export type AgenticEvent =
  | { readonly kind: 'thinking'; readonly iteration: number; readonly mode: DispatchMode }
  | { readonly kind: 'assistant_text'; readonly text: string }
  | { readonly kind: 'tool_call'; readonly callId: string; readonly toolName: string; readonly args: unknown }
  | { readonly kind: 'tool_result'; readonly callId: string; readonly toolName: string; readonly ok: boolean; readonly summary: string; readonly raw: unknown }
  | { readonly kind: 'final'; readonly text: string; readonly meta: ChatResponseMeta }
  | { readonly kind: 'mode_fallback'; readonly from: DispatchMode; readonly to: DispatchMode; readonly reason: string }
  | { readonly kind: 'max_iterations' }
  | { readonly kind: 'aborted'; readonly reason: AgenticAbortReason; readonly toolName: string; readonly detail: string }
  | { readonly kind: 'error'; readonly error: AppError }

export type DispatchMode = 'native' | 'prompt'

const DEFAULT_MAX_ITERATIONS = 5
const MAX_TOOL_CALLS_PER_RUN = 3
const MAX_TOOL_RESULT_CHARS = 4000

/** Slug prefixes for model families known to support OpenAI-style tool calling through the proxy. */
const NATIVE_TOOL_PREFIXES: readonly string[] = [
  'openai/',
  'anthropic/',
  'google/gemini-',
  'google/gemma',
  'meta-llama/llama-3',
  'meta-llama/llama-4',
  'mistralai/',
  'qwen/qwen',
  'deepseek/',
  'x-ai/grok',
  'cohere/',
  'nvidia/',
  'perplexity/',
  'microsoft/',
]

export function detectDispatchMode(modelSlug: string): DispatchMode {
  const s = modelSlug.toLowerCase()
  return NATIVE_TOOL_PREFIXES.some((p) => s.startsWith(p)) ? 'native' : 'prompt'
}

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
- CRITICAL for image tools: generate_image and edit_image succeed when they return an "image" content block. The image has already been rendered to the user by the client. After a successful image call, reply with ONE short confirmation sentence. Do NOT call the image tool again. Do NOT try to include the base64 in your reply. Do NOT describe what you drew unless the user asks.
- Never call the same tool with the same arguments twice in one conversation — the second call will cost money and return the same result.`

function buildToolsList(): string {
  return CHAT_TOOLS.map((t) => {
    const fn = t.openai.function
    const required = fn.parameters.required.length > 0 ? ` (required: ${fn.parameters.required.join(', ')})` : ''
    return `- ${fn.name}: ${fn.description}${required}`
  }).join('\n')
}

const PROMPT_MODE_INSTRUCTIONS = `=== Available tools ===
${buildToolsList()}

=== How to use tools ===
When you need to use a tool, respond with ONLY a JSON object on a single line in this exact shape, nothing else:
{"tool_call": {"name": "<tool_name>", "arguments": {<arguments>}}}

Example: {"tool_call": {"name": "google_search", "arguments": {"q": "current bitcoin price"}}}

When you have enough info to answer the user, respond with plain text (no JSON wrapper). Do not mix tool calls with text — pick one.`

type ToolHistoryEntry = Readonly<{
  toolName: string
  args: unknown
  ok: boolean
  resultText: string
}>

function buildSystemPrompt(mode: DispatchMode, history: readonly ToolHistoryEntry[]): string {
  const base = mode === 'native'
    ? BASE_SYSTEM_PROMPT
    : `${BASE_SYSTEM_PROMPT}\n\n${PROMPT_MODE_INSTRUCTIONS}`
  if (history.length === 0) return base
  const log = history.map((h, i) => {
    const argsStr = safeStringify(h.args)
    const truncated = h.resultText.length > MAX_TOOL_RESULT_CHARS
      ? `${h.resultText.slice(0, MAX_TOOL_RESULT_CHARS)}\n…[truncated]`
      : h.resultText
    const status = h.ok ? 'RESULT' : 'ERROR'
    return `[${i + 1}] ${h.toolName}(${argsStr}) → ${status}:\n${truncated}`
  }).join('\n\n')
  return `${base}\n\n=== Tool call history (already executed, do NOT repeat these exact calls) ===\n${log}\n\nUse the information above to answer the user's question. Call additional tools only if you need more data.`
}

function safeStringify(v: unknown): string {
  try { return JSON.stringify(v) } catch { return String(v) }
}

/** Parse a prompt-mode assistant response. Returns a tool call if the response is JSON matching the expected shape, else treats it as final text. */
function parsePromptResponse(text: string): { kind: 'tool_call'; name: string; args: unknown } | { kind: 'final'; text: string } {
  const trimmed = text.trim()
  // Find JSON object at the start of the response (allow surrounding markdown fences)
  const cleaned = trimmed
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()
  if (!cleaned.startsWith('{')) return { kind: 'final', text }
  try {
    const parsed = JSON.parse(cleaned) as { tool_call?: { name?: unknown; arguments?: unknown } }
    if (
      parsed
      && typeof parsed === 'object'
      && parsed.tool_call
      && typeof parsed.tool_call.name === 'string'
      && parsed.tool_call.name
    ) {
      return { kind: 'tool_call', name: parsed.tool_call.name, args: parsed.tool_call.arguments ?? {} }
    }
  } catch { /* fall through */ }
  return { kind: 'final', text }
}

export type RunAgenticParams = Readonly<{
  model: string
  messages: readonly ChatMessage[]
  maxIterations?: number
  signal?: AbortSignal
  mode?: DispatchMode
}>

export type RunAgenticDeps = Readonly<{
  rest: RestApiPort
  mcp: McpPort
  agent: AgentId
  key: ApiKey
}>

type IterationStep =
  | { readonly kind: 'tool_call'; readonly callId: string; readonly name: string; readonly args: unknown }
  | { readonly kind: 'final'; readonly text: string }
  | { readonly kind: 'error'; readonly error: RestError; readonly providerMightNotSupportTools: boolean }

function looksLikeUnsupportedToolsError(e: RestError): boolean {
  if (e.kind !== 'upstream_error') return false
  const body = typeof e.body === 'string' ? e.body : safeStringify(e.body)
  const t = body.toLowerCase()
  return (
    t.includes('tool_calls') ||
    t.includes('tool message') ||
    t.includes('does not support tools') ||
    t.includes('function calling') ||
    t.includes('tool calling')
  ) && (e.status === 400 || e.status === 404 || e.status === 501 || e.status === 502)
}

async function runIteration(
  deps: RunAgenticDeps,
  params: { model: string; signal?: AbortSignal },
  mode: DispatchMode,
  userConversation: readonly ChatMessageFull[],
  toolHistory: readonly ToolHistoryEntry[],
): Promise<{ step: IterationStep; meta: ChatResponseMeta }> {
  const messages: ChatMessageFull[] = [
    { role: 'system', content: buildSystemPrompt(mode, toolHistory) },
    ...userConversation,
  ]
  const req: ChatCompletionRequest = {
    model: params.model,
    messages: messages as ChatCompletionRequest['messages'],
    stream: false,
    ...(mode === 'native' ? { tools: CHAT_TOOLS.map((t) => t.openai), tool_choice: 'auto' as const } : {}),
  }
  const t0 = Date.now()
  // eslint-disable-next-line no-console
  console.debug('[agentic] → chat.completion', { model: params.model, mode, nTools: mode === 'native' ? CHAT_TOOLS.length : 0, nMessages: messages.length })
  const res = await deps.rest.chatCompletion(deps.key, req)
  const dt = Date.now() - t0
  if (!res.ok) {
    // eslint-disable-next-line no-console
    console.debug('[agentic] ← chat.completion ERROR', { dt, error: res.error })
    return { step: { kind: 'error', error: res.error, providerMightNotSupportTools: looksLikeUnsupportedToolsError(res.error) }, meta: {} }
  }
  const meta = res.value.meta
  const choice = res.value.data.choices[0]
  if (!choice) {
    // eslint-disable-next-line no-console
    console.debug('[agentic] ← chat.completion NO CHOICES', { dt, raw: res.value.data })
    return { step: { kind: 'error', error: { kind: 'upstream_error', status: 500, body: 'no choices' }, providerMightNotSupportTools: false }, meta }
  }
  const msg = choice.message
  const assistantText = msg.content ?? ''
  // eslint-disable-next-line no-console
  console.debug('[agentic] ← chat.completion OK', { dt, finishReason: choice.finish_reason, nToolCalls: msg.tool_calls?.length ?? 0, textLen: assistantText.length, meta })

  if (mode === 'native') {
    const toolCalls: readonly ToolCall[] = msg.tool_calls ?? []
    if (toolCalls.length > 0) {
      const tc = toolCalls[0]!
      let args: unknown
      try { args = JSON.parse(tc.function.arguments) } catch { args = {} }
      return { step: { kind: 'tool_call', callId: tc.id, name: tc.function.name, args }, meta }
    }
    return { step: { kind: 'final', text: assistantText }, meta }
  }

  // prompt mode
  const parsed = parsePromptResponse(assistantText)
  if (parsed.kind === 'tool_call') {
    const callId = `prompt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    return { step: { kind: 'tool_call', callId, name: parsed.name, args: parsed.args }, meta }
  }
  return { step: { kind: 'final', text: parsed.text }, meta }
}

export async function* runAgenticChat(
  deps: RunAgenticDeps,
  params: RunAgenticParams,
): AsyncGenerator<AgenticEvent, void, void> {
  const maxIterations = params.maxIterations ?? DEFAULT_MAX_ITERATIONS
  const userConversation: ChatMessageFull[] = params.messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({ role: m.role, content: m.content }))
  const toolHistory: ToolHistoryEntry[] = []
  let lastMeta: ChatResponseMeta = {}
  let mode: DispatchMode = params.mode ?? detectDispatchMode(params.model)
  let hasFallenBack = false

  for (let i = 0; i < maxIterations; i++) {
    if (params.signal?.aborted) {
      yield { kind: 'error', error: { kind: 'timeout', endpoint: 'agentic' } }
      return
    }

    yield { kind: 'thinking', iteration: i, mode }

    const itParams: { model: string; signal?: AbortSignal } = params.signal
      ? { model: params.model, signal: params.signal }
      : { model: params.model }
    const { step, meta } = await runIteration(deps, itParams, mode, userConversation, toolHistory)
    lastMeta = meta

    if (step.kind === 'error') {
      // Auto-fallback: if native mode errored with something that looks like
      // unsupported tools, retry this iteration in prompt mode.
      if (mode === 'native' && !hasFallenBack && step.providerMightNotSupportTools) {
        yield { kind: 'mode_fallback', from: 'native', to: 'prompt', reason: 'Provider rejected native tool calling; falling back to prompt-based JSON.' }
        mode = 'prompt'
        hasFallenBack = true
        i -= 1
        continue
      }
      yield { kind: 'error', error: step.error as RestError }
      return
    }

    if (step.kind === 'final') {
      yield { kind: 'final', text: step.text, meta: lastMeta }
      return
    }

    // step.kind === 'tool_call'
    yield { kind: 'tool_call', callId: step.callId, toolName: step.name, args: step.args }

    const def = findChatTool(step.name)
    if (!def) {
      // Unknown tool — abort. Calling the LLM again would just cost tokens
      // without moving closer to a useful answer.
      const detail = `Unknown tool: ${step.name}`
      toolHistory.push({ toolName: step.name, args: step.args, ok: false, resultText: detail })
      yield { kind: 'tool_result', callId: step.callId, toolName: step.name, ok: false, summary: detail, raw: null }
      yield { kind: 'aborted', reason: 'tool_failed', toolName: step.name, detail }
      return
    }

    // Cost guard 1: refuse to re-invoke the same tool with the same arguments
    // (success OR failure). The second call would return the same result and
    // the intermediate chat completion would cost tokens for nothing.
    const argsKey = safeStringify(step.args)
    const priorCall = toolHistory.find(
      (h) => h.toolName === step.name && safeStringify(h.args) === argsKey,
    )
    if (priorCall) {
      const msg = priorCall.ok
        ? `Already called ${step.name} with the same arguments and it succeeded. The user has already seen that result. Reply to the user now.`
        : `Already called ${step.name} with the same arguments and it failed: ${priorCall.resultText.slice(0, 200)}. Do NOT retry with the same arguments.`
      toolHistory.push({ toolName: step.name, args: step.args, ok: priorCall.ok, resultText: msg })
      yield { kind: 'tool_result', callId: step.callId, toolName: step.name, ok: priorCall.ok, summary: msg, raw: null }
      // If this was a prior failure, also abort — the model is looping.
      if (!priorCall.ok) {
        yield { kind: 'aborted', reason: 'tool_failed', toolName: step.name, detail: msg }
        return
      }
      continue
    }

    // Cost guard 2: hard cap on total tool calls per run. Beyond this the
    // model is fishing and the token cost outweighs any likely result.
    const actualCallsSoFar = toolHistory.filter((h) => !h.resultText.startsWith('Already called')).length
    if (actualCallsSoFar >= MAX_TOOL_CALLS_PER_RUN) {
      const detail = `Tool call cap reached (${MAX_TOOL_CALLS_PER_RUN} per run). Stopping to prevent further charges.`
      toolHistory.push({ toolName: step.name, args: step.args, ok: false, resultText: detail })
      yield { kind: 'tool_result', callId: step.callId, toolName: step.name, ok: false, summary: detail, raw: null }
      yield { kind: 'aborted', reason: 'tool_cap_reached', toolName: step.name, detail }
      return
    }

    const mcpRes = await deps.mcp.callTool(deps.key, def.mcpName, step.args, params.signal)
    if (!mcpRes.ok) {
      // Cost guard 3: tool failed. Abort. Do NOT make another chat completion
      // call — that would cost tokens on the next round with no guarantee of
      // recovery. The user can re-send if they want another attempt.
      const errText = `Tool execution failed: ${safeStringify(mcpRes.error)}`
      const errSummary = mcpErrorSummary(mcpRes.error)
      toolHistory.push({ toolName: step.name, args: step.args, ok: false, resultText: errText })
      yield { kind: 'tool_result', callId: step.callId, toolName: step.name, ok: false, summary: errSummary, raw: mcpRes.error }
      yield { kind: 'aborted', reason: 'tool_failed', toolName: step.name, detail: errSummary }
      return
    }

    const { summary, content } = summarizeResult(mcpRes.value)
    toolHistory.push({ toolName: step.name, args: step.args, ok: true, resultText: content })
    yield { kind: 'tool_result', callId: step.callId, toolName: step.name, ok: true, summary, raw: mcpRes.value }

    // Short-circuit for terminal tools: image tools return the final answer
    // DIRECTLY — a PNG for generate/edit, text for analyze. Skipping the
    // synthesis round saves a whole chat.completion turn. For analyze_image
    // we surface the text as the final answer so it reads as the assistant's
    // reply; for generate/edit the image is already rendered inline and
    // finalText stays empty.
    if (def.category === 'image') {
      const first = mcpRes.value.content[0]
      const finalText = first?.type === 'text' ? first.text : ''
      yield { kind: 'final', text: finalText, meta: lastMeta }
      return
    }
  }

  yield { kind: 'max_iterations' }
}

function mcpErrorSummary(err: unknown): string {
  if (err && typeof err === 'object' && 'kind' in err) {
    const e = err as { kind: string; status?: number; message?: string; body?: unknown }
    switch (e.kind) {
      case 'network': return 'Network error reaching MCP endpoint'
      case 'timeout': return 'MCP call timed out'
      case 'unauthorized': return 'Unauthorized — check API key'
      case 'rate_limited': return 'Rate limited by MCP — retry in a few seconds'
      case 'validation': return 'MCP response failed schema validation'
      case 'upstream_error': {
        const body = e.body
        if (typeof body === 'string') return `MCP ${e.status ?? ''}: ${body.slice(0, 120)}`
        if (body && typeof body === 'object' && 'message' in body) {
          return `MCP ${e.status ?? ''}: ${String((body as { message: unknown }).message).slice(0, 160)}`
        }
        return `MCP error ${e.status ?? ''}`
      }
      case 'jsonrpc_error': return `MCP JSON-RPC ${e.message ?? 'error'}`
      case 'invalid_params': return 'Invalid tool arguments'
      default: return `MCP error (${e.kind})`
    }
  }
  return 'Tool call failed'
}

function summarizeResult(result: McpToolResult): { summary: string; content: string } {
  const first = result.content[0]
  if (!first) return { summary: '(empty result)', content: JSON.stringify({ empty: true }) }

  if (first.type === 'text') {
    const text = first.text
    const truncated = text.length > MAX_TOOL_RESULT_CHARS ? `${text.slice(0, MAX_TOOL_RESULT_CHARS)}\n…[truncated]` : text
    const summary = text.length > 120 ? `${text.slice(0, 120)}…` : text
    return { summary, content: truncated }
  }
  if (first.type === 'image') {
    const bytes = typeof first.data === 'string' ? first.data.length : 0
    return {
      summary: `Image rendered (${first.mimeType})`,
      content: `SUCCESS: The ${first.mimeType} image has been generated and is already displayed to the user inline (${bytes} base64 chars). Do NOT call this tool again. Reply with one short confirmation sentence to the user (e.g. "Done — here's the image.").`,
    }
  }
  if (first.type === 'resource') {
    return {
      summary: `Resource: ${first.resource.mimeType ?? 'unknown'}`,
      content: `SUCCESS: A ${first.resource.mimeType ?? 'binary'} resource was returned and rendered to the user. Do NOT call this tool again. Reply with one short confirmation sentence.`,
    }
  }
  return { summary: 'Unknown content', content: JSON.stringify(result) }
}
