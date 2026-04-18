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
