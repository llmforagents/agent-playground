import type { Model, UsdCents } from './branded'

export type ChatRole = 'system' | 'user' | 'assistant'

export type ChatMessage = Readonly<{
  role: ChatRole
  content: string
}>

export type ChatParams = Readonly<{
  model: Model
  messages: readonly ChatMessage[]
  temperature?: number
  maxTokens?: number
  stream: boolean
}>

export type ChatUsage = Readonly<{
  tokensInput: number
  tokensOutput: number
  costCents: UsdCents
  balanceRemainingCents: UsdCents
  requestId: string
}>

export type ChatCompletionResult = Readonly<{
  content: string
  finishReason: string
  usage: ChatUsage
}>

export type ChatStreamEvent =
  | { readonly kind: 'delta'; readonly text: string }
  | { readonly kind: 'done'; readonly usage: ChatUsage; readonly fullText: string }

/** Native vs prompt-based tool dispatch — see runAgenticChat.ts. */
export type DispatchMode = 'native' | 'prompt'

/** A single step in an agentic run, persisted across reloads. */
export type AgenticStep =
  | { readonly kind: 'assistant_text'; readonly text: string; readonly reasoning?: string }
  | { readonly kind: 'mode_fallback'; readonly from: DispatchMode; readonly to: DispatchMode; readonly reason: string }
  | { readonly kind: 'tool'; readonly callId: string; readonly toolName: string; readonly args: unknown; readonly status: 'running' | 'ok' | 'error'; readonly summary?: string; readonly raw?: unknown }

/** A turn in the conversation: a plain user/assistant message or a multi-step agentic block. */
export type ConversationEntry =
  | { readonly kind: 'msg'; readonly role: ChatMessage['role']; readonly content: string; readonly reasoning?: string }
  | { readonly kind: 'agentic'; readonly steps: readonly AgenticStep[]; readonly finalText: string; readonly finalReasoning?: string }
