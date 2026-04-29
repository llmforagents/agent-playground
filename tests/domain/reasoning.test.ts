import { describe, it, expect } from 'vitest'
import {
  detectReasoningFamily,
  buildReasoningPayload,
  type Effort,
} from '@/domain/reasoning'

describe('detectReasoningFamily', () => {
  it('matches Claude 4.x as enum_effort', () => {
    expect(detectReasoningFamily('anthropic/claude-sonnet-4')).toBe('enum_effort')
    expect(detectReasoningFamily('anthropic/claude-sonnet-4-20250513')).toBe('enum_effort')
    expect(detectReasoningFamily('anthropic/claude-opus-4')).toBe('enum_effort')
  })

  it('matches OpenAI o-series as enum_effort', () => {
    expect(detectReasoningFamily('openai/o1')).toBe('enum_effort')
    expect(detectReasoningFamily('openai/o3')).toBe('enum_effort')
    expect(detectReasoningFamily('openai/o4-mini')).toBe('enum_effort')
  })

  it('matches DeepSeek R1 and Qwen QwQ as boolean_toggle', () => {
    expect(detectReasoningFamily('deepseek/deepseek-r1')).toBe('boolean_toggle')
    expect(detectReasoningFamily('qwen/qwq-32b')).toBe('boolean_toggle')
  })

  it('matches Gemini 2.5 thinking as token_budget', () => {
    expect(detectReasoningFamily('google/gemini-2.5-flash-thinking')).toBe('token_budget')
    expect(detectReasoningFamily('google/gemini-2.5-pro-thinking')).toBe('token_budget')
  })

  it('returns undefined for unsupported models', () => {
    expect(detectReasoningFamily('google/gemini-2.5-flash-lite')).toBeUndefined()
    expect(detectReasoningFamily('openai/gpt-4o-mini')).toBeUndefined()
    expect(detectReasoningFamily('meta-llama/llama-3-70b')).toBeUndefined()
  })

  it('is case-insensitive on the model slug', () => {
    expect(detectReasoningFamily('ANTHROPIC/CLAUDE-SONNET-4')).toBe('enum_effort')
  })
})

describe('buildReasoningPayload', () => {
  it('returns empty object when effort is off', () => {
    expect(buildReasoningPayload('anthropic/claude-sonnet-4', 'off')).toEqual({})
    expect(buildReasoningPayload('openai/gpt-4o-mini', 'off')).toEqual({})
  })

  it('returns empty object when model is not compatible regardless of effort', () => {
    const efforts: readonly Effort[] = ['low', 'medium', 'high']
    for (const e of efforts) {
      expect(buildReasoningPayload('openai/gpt-4o-mini', e)).toEqual({})
    }
  })

  it('uses reasoning.effort for enum_effort family', () => {
    expect(buildReasoningPayload('anthropic/claude-sonnet-4', 'low')).toEqual({ reasoning: { effort: 'low' } })
    expect(buildReasoningPayload('openai/o3', 'medium')).toEqual({ reasoning: { effort: 'medium' } })
    expect(buildReasoningPayload('openai/o4-mini', 'high')).toEqual({ reasoning: { effort: 'high' } })
  })

  it('uses include_reasoning for boolean_toggle family (level ignored)', () => {
    expect(buildReasoningPayload('deepseek/deepseek-r1', 'low')).toEqual({ include_reasoning: true })
    expect(buildReasoningPayload('deepseek/deepseek-r1', 'medium')).toEqual({ include_reasoning: true })
    expect(buildReasoningPayload('qwen/qwq-32b', 'high')).toEqual({ include_reasoning: true })
  })

  it('maps level to max_tokens for token_budget family', () => {
    expect(buildReasoningPayload('google/gemini-2.5-flash-thinking', 'low')).toEqual({ reasoning: { max_tokens: 500 } })
    expect(buildReasoningPayload('google/gemini-2.5-flash-thinking', 'medium')).toEqual({ reasoning: { max_tokens: 2000 } })
    expect(buildReasoningPayload('google/gemini-2.5-flash-thinking', 'high')).toEqual({ reasoning: { max_tokens: 8000 } })
  })
})
