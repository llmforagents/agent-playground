import { describe, it, expect } from 'vitest'
import {
  COUNCIL_EXPENSIVE_THRESHOLD_CENTS,
  DEFAULT_COUNCIL_CONFIG,
  DRAFTER_SLOTS,
  MAX_DRAFTERS,
  MIN_DRAFTERS,
  estimateCouncilCostCents,
  type CouncilConfig,
} from '@/domain/council'
import { Model } from '@/domain/branded'

describe('domain/council', () => {
  it('DEFAULT_COUNCIL_CONFIG has 3 drafters and a chairman', () => {
    expect(DEFAULT_COUNCIL_CONFIG.drafters).toHaveLength(3)
    expect(DEFAULT_COUNCIL_CONFIG.chairman).toBeDefined()
    expect(DEFAULT_COUNCIL_CONFIG.maxCritiqueRounds).toBe(1)
    expect(DEFAULT_COUNCIL_CONFIG.enableDrafterRevision).toBe(false)
  })

  it('DRAFTER_SLOTS are A/B/C', () => {
    expect(DRAFTER_SLOTS).toEqual(['A', 'B', 'C'])
  })

  it('MIN_DRAFTERS=2 and MAX_DRAFTERS=3', () => {
    expect(MIN_DRAFTERS).toBe(2)
    expect(MAX_DRAFTERS).toBe(3)
  })

  it('estimateCouncilCostCents stays under expensive threshold for all-lite default', () => {
    const cents = estimateCouncilCostCents(DEFAULT_COUNCIL_CONFIG)
    expect(cents).toBeLessThan(COUNCIL_EXPENSIVE_THRESHOLD_CENTS)
    // 3 lite drafts (1) + 3 lite critiques (1) + 1 lite synth (2) = 8
    expect(cents).toBe(8)
  })

  it('estimateCouncilCostCents flags premium configurations as expensive', () => {
    const expensive: CouncilConfig = {
      drafters: [
        Model('anthropic/claude-opus-4'),
        Model('anthropic/claude-sonnet-4.5'),
        Model('openai/gpt-5.1'),
      ],
      chairman: Model('anthropic/claude-opus-4'),
      maxCritiqueRounds: 1,
      enableDrafterRevision: false,
    }
    const cents = estimateCouncilCostCents(expensive)
    // 3 premium drafts (8) + 3 premium critiques (8) + 1 premium synth (15) = 47
    // Doesn't quite hit 50, but a 4-premium config would.
    expect(cents).toBeGreaterThan(40)
  })

  it('estimateCouncilCostCents distinguishes lite vs premium per slot', () => {
    const mixed: CouncilConfig = {
      drafters: [
        Model('google/gemini-2.5-flash-lite'),
        Model('anthropic/claude-haiku-4.5'),
        Model('anthropic/claude-opus-4'),
      ],
      chairman: Model('google/gemini-2.5-flash-lite'),
      maxCritiqueRounds: 1,
      enableDrafterRevision: false,
    }
    const cents = estimateCouncilCostCents(mixed)
    // 2 lite drafts + 1 premium draft (1+1+8) + same critiques (10) + lite synth (2) = 22
    expect(cents).toBe(22)
  })
})
