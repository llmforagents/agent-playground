import { describe, expect, it } from 'vitest'
import {
  HealthzSchema, RegisterAgentResponseSchema, BalanceResponseSchema,
  GenerateWalletResponseSchema, ModelsResponseSchema,
  ChatCompletionResponseSchema, TransactionsResponseSchema,
} from '@/infrastructure/schemas/rest'
import * as fx from '../fixtures/rest'

describe('REST schemas', () => {
  it('parses healthz', () => {
    expect(HealthzSchema.parse(fx.fxHealthz)).toMatchObject({ status: 'ok' })
  })
  it('parses register agent', () => {
    expect(RegisterAgentResponseSchema.parse(fx.fxRegisterAgent).apiKey).toBe('sk_test_abc')
  })
  it('parses balance', () => {
    expect(BalanceResponseSchema.parse(fx.fxBalance).availableUsdCents).toBe(500)
  })
  it('parses wallet', () => {
    expect(GenerateWalletResponseSchema.parse(fx.fxWallet).chain).toBe('solana')
  })
  it('parses models', () => {
    expect(ModelsResponseSchema.parse(fx.fxModels).models[0]?.slug).toBe('gemini-2.5-flash-lite')
  })
  it('parses chat completion', () => {
    expect(ChatCompletionResponseSchema.parse(fx.fxChatCompletion).choices[0]?.message.content).toBe('Hello!')
  })
  it('parses transactions', () => {
    expect(TransactionsResponseSchema.parse(fx.fxTransactions).transactions[0]?.type).toBe('deposit')
  })
  it('rejects invalid balance', () => {
    expect(() => BalanceResponseSchema.parse({ availableUsdCents: 'nope' })).toThrow()
  })
})
