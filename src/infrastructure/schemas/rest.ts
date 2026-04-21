import { z } from 'zod'

export const HealthzSchema = z.object({
  status: z.string(),
  service: z.string(),
  timestamp: z.string(),
}).loose()
export type HealthzResponse = z.infer<typeof HealthzSchema>

export const RegisterAgentRequestSchema = z.object({
  name: z.string().min(1).max(100),
})
export type RegisterAgentRequest = z.infer<typeof RegisterAgentRequestSchema>

export const RegisterAgentResponseSchema = z.object({
  uuid: z.string().uuid(),
  apiKey: z.string().min(1),
  name: z.string(),
  createdAt: z.string(),
}).loose()
export type RegisterAgentResponse = z.infer<typeof RegisterAgentResponseSchema>

const numOrStringNum = z.union([z.number(), z.string()]).transform((v) => {
  if (typeof v === 'number') return v
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
})

export const BalanceResponseSchema = z.object({
  uuid: z.string().optional(),
  availableUsdCents: z.number().nonnegative(),
  availableUsd: z.string().optional(),
  totalDepositedUsd: numOrStringNum,
  totalSpentUsd: numOrStringNum,
  wallets: z.array(z.unknown()).optional(),
  requestId: z.string().optional(),
}).loose()
export type BalanceResponse = z.infer<typeof BalanceResponseSchema>

export const GenerateWalletRequestSchema = z.object({
  chain: z.enum(['solana', 'polygon']),
  token: z.enum(['USDT', 'USDC']),
})
export type GenerateWalletRequest = z.infer<typeof GenerateWalletRequestSchema>

export const GenerateWalletResponseSchema = z.object({
  chain: z.enum(['solana', 'polygon']),
  token: z.enum(['USDT', 'USDC']),
  address: z.string().min(1),
  createdAt: z.string(),
  requestId: z.string().optional(),
}).loose()
export type GenerateWalletResponse = z.infer<typeof GenerateWalletResponseSchema>

export const ModelInfoSchema = z.object({
  slug: z.string(),
  displayName: z.string(),
  provider: z.string().optional(),
  feePct: z.number().optional(),
  inputPricePer1M: z.number().optional(),
  outputPricePer1M: z.number().optional(),
  effectiveInputPricePer1M: z.number().optional(),
  effectiveOutputPricePer1M: z.number().optional(),
  contextWindow: z.number().int().positive(),
  lastSyncedAt: z.string().optional(),
  enabled: z.boolean().optional(),
}).loose().transform((raw) => ({
  slug: raw.slug,
  displayName: raw.displayName,
  provider: raw.provider,
  feePct: raw.feePct,
  inputPricePer1M: raw.inputPricePer1M ?? raw.effectiveInputPricePer1M ?? 0,
  outputPricePer1M: raw.outputPricePer1M ?? raw.effectiveOutputPricePer1M ?? 0,
  contextWindow: raw.contextWindow,
  lastSyncedAt: raw.lastSyncedAt,
  enabled: raw.enabled,
}))
export type ModelInfo = z.infer<typeof ModelInfoSchema>

export const ModelsResponseSchema = z.object({
  models: z.array(ModelInfoSchema),
  feePct: z.number().optional(),
  requestId: z.string().optional(),
}).loose()
export type ModelsResponse = z.infer<typeof ModelsResponseSchema>

export const ToolCallSchema = z.object({
  id: z.string(),
  type: z.literal('function').optional().default('function'),
  function: z.object({
    name: z.string(),
    arguments: z.string(),
  }),
}).loose()
export type ToolCall = z.infer<typeof ToolCallSchema>

export const ChatMessageSchema = z.object({
  role: z.enum(['system', 'user', 'assistant', 'tool']),
  content: z.string().nullable().optional(),
  name: z.string().optional(),
  tool_calls: z.array(ToolCallSchema).optional(),
  tool_call_id: z.string().optional(),
}).loose()

export const ToolDefSchema = z.object({
  type: z.literal('function'),
  function: z.object({
    name: z.string(),
    description: z.string().optional(),
    parameters: z.unknown().optional(),
  }).loose(),
}).loose()

export const ChatCompletionRequestSchema = z.object({
  model: z.string().min(1),
  messages: z.array(ChatMessageSchema).min(1),
  temperature: z.number().min(0).max(2).optional(),
  max_tokens: z.number().int().positive().optional(),
  stream: z.boolean().optional(),
  tools: z.array(ToolDefSchema).optional(),
  tool_choice: z.union([z.enum(['auto', 'none', 'required']), z.object({ type: z.literal('function'), function: z.object({ name: z.string() }) })]).optional(),
})
export type ChatCompletionRequest = z.infer<typeof ChatCompletionRequestSchema>

export const ChatCompletionResponseSchema = z.object({
  id: z.string(),
  object: z.string().optional(),
  created: z.number().optional(),
  model: z.string(),
  choices: z.array(z.object({
    index: z.number().int(),
    message: ChatMessageSchema,
    finish_reason: z.string().nullable().optional(),
  }).loose()).min(1),
  usage: z.object({
    prompt_tokens: z.number().int().nonnegative(),
    completion_tokens: z.number().int().nonnegative(),
    total_tokens: z.number().int().nonnegative(),
  }).loose().optional(),
}).loose()
export type ChatCompletionResponse = z.infer<typeof ChatCompletionResponseSchema>
export type ChatMessageFull = z.infer<typeof ChatMessageSchema>

const stringOrNumber = z.union([z.string(), z.number()]).transform(String)

export const TransactionInfoSchema = z.object({
  id: stringOrNumber,
  type: z.enum(['deposit', 'usage', 'refund']),
  amountUsdCents: z.number().optional(),
  amountCents: z.number().optional(),
  createdAt: z.string().optional(),
  timestamp: z.string().optional(),
  description: z.string().nullable().optional(),
  model: z.string().nullable().optional(),
  promptTokens: z.number().nullable().optional(),
  completionTokens: z.number().nullable().optional(),
  totalTokens: z.number().nullable().optional(),
  chain: z.string().nullable().optional(),
  txHash: z.string().nullable().optional(),
}).loose().transform((raw) => ({
  id: raw.id,
  type: raw.type,
  amountCents: raw.amountUsdCents ?? raw.amountCents ?? 0,
  timestamp: raw.createdAt ?? raw.timestamp ?? new Date().toISOString(),
  description: raw.description ?? undefined,
  model: raw.model ?? undefined,
  promptTokens: raw.promptTokens ?? undefined,
  completionTokens: raw.completionTokens ?? undefined,
  totalTokens: raw.totalTokens ?? undefined,
  chain: raw.chain ?? undefined,
  txHash: raw.txHash ?? undefined,
}))
export type TransactionInfo = z.infer<typeof TransactionInfoSchema>

export const TransactionsResponseSchema = z.object({
  transactions: z.array(TransactionInfoSchema),
  total: z.number().int().nonnegative(),
  limit: z.number().int().positive(),
  offset: z.number().int().nonnegative(),
  requestId: z.string().optional(),
}).loose()
export type TransactionsResponse = z.infer<typeof TransactionsResponseSchema>

export const ErrorResponseSchema = z.object({
  error: z.object({
    code: z.string().optional(),
    message: z.string(),
  }).or(z.string()),
}).loose()

export const TX_SEND_CHAINS = ['polygon'] as const
export type TxSendChain = (typeof TX_SEND_CHAINS)[number]

export const TX_SEND_TOKENS = ['USDC'] as const
export type TxSendToken = (typeof TX_SEND_TOKENS)[number]

const HexAddressField = z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'must be 0x + 40 hex chars')
const PositiveDecimalField = z.string().regex(/^\d+(\.\d+)?$/, 'must be a positive decimal (up to 6 fraction digits)')
const Hex32Field = z.string().regex(/^0x[a-fA-F0-9]{64}$/)

export const TxSendRequestSchema = z.object({
  chain: z.enum(TX_SEND_CHAINS),
  token: z.string().min(1),
  to: HexAddressField,
  amount: PositiveDecimalField,
})
export type TxSendRequest = z.infer<typeof TxSendRequestSchema>

export const TxSendResponseSchema = z.object({
  txHash: Hex32Field,
  explorerUrl: z.string().url().optional(),
  from: HexAddressField,
  to: HexAddressField,
  chain: z.string(),
  chainId: z.number().int().positive(),
  token: z.string(),
  tokenAddress: HexAddressField.optional(),
  amount: z.string(),
  amountBaseUnits: z.string().optional(),
  feeBaseUnits: z.string().optional(),
  feeFormatted: z.string().optional(),
  feeCents: z.number().nonnegative().optional(),
  chargedCents: z.number().nonnegative(),
  requestId: z.string().optional(),
}).loose()
export type TxSendResponse = z.infer<typeof TxSendResponseSchema>
