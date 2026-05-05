import { Model } from './branded'

export type DrafterSlot = 'A' | 'B' | 'C'

export const DRAFTER_SLOTS: ReadonlyArray<DrafterSlot> = ['A', 'B', 'C'] as const

export type CouncilConfig = Readonly<{
  drafters: ReadonlyArray<Model>
  chairman: Model
  maxCritiqueRounds: 1
  enableDrafterRevision: false
}>

export const MAX_DRAFTERS = 3 as const
export const MIN_DRAFTERS = 2 as const

export type CouncilPlan = 'lite' | 'pro' | 'power'

export const COUNCIL_PLAN_ORDER: ReadonlyArray<CouncilPlan> = ['lite', 'pro', 'power'] as const

/**
 * Preset configurations.
 *
 * Lite (~$0.01/run):  fast, cheap, broad family diversity.
 * Pro (~$0.15/run):   better drafters than lite + Sonnet 4.6 chairman for synthesis quality.
 * Power (~$0.50–0.80/run): top-of-line frontier models verified live in the backend on 2026-05-05.
 *                          Always trips the council's expensive-confirm guardrail.
 */
export const COUNCIL_PLANS: Readonly<Record<CouncilPlan, CouncilConfig>> = {
  lite: {
    drafters: [
      Model('google/gemini-2.5-flash-lite'),
      Model('anthropic/claude-haiku-4.5'),
      Model('openai/gpt-5-mini'),
    ],
    chairman: Model('google/gemini-2.5-flash-lite'),
    maxCritiqueRounds: 1,
    enableDrafterRevision: false,
  },
  pro: {
    drafters: [
      Model('google/gemini-2.5-flash'),
      Model('anthropic/claude-haiku-4.5'),
      Model('openai/gpt-5'),
    ],
    chairman: Model('anthropic/claude-sonnet-4.6'),
    maxCritiqueRounds: 1,
    enableDrafterRevision: false,
  },
  power: {
    drafters: [
      Model('anthropic/claude-opus-4.7'),
      Model('openai/gpt-5.2'),
      Model('google/gemini-2.5-pro'),
    ],
    chairman: Model('anthropic/claude-opus-4.7'),
    maxCritiqueRounds: 1,
    enableDrafterRevision: false,
  },
}

export const DEFAULT_COUNCIL_PLAN: CouncilPlan = 'lite'

export const DEFAULT_COUNCIL_CONFIG: CouncilConfig = COUNCIL_PLANS[DEFAULT_COUNCIL_PLAN]

export const COUNCIL_EXPENSIVE_THRESHOLD_CENTS = 50 as const

export function estimateCouncilCostCents(config: CouncilConfig): number {
  const isPremium = (m: Model): boolean => {
    const s = String(m).toLowerCase()
    return (
      s.includes('opus') ||
      s.includes('sonnet') ||
      /gpt-5\.\d/.test(s) ||
      /gemini.*-pro/.test(s) ||
      /o3(-pro)?$/.test(s)
    )
  }
  const draftCost = config.drafters.reduce(
    (sum, m) => sum + (isPremium(m) ? 8 : 1),
    0,
  )
  const critiqueCost = config.drafters.reduce(
    (sum, m) => sum + (isPremium(m) ? 8 : 1),
    0,
  )
  const synthesisCost = isPremium(config.chairman) ? 15 : 2
  return draftCost + critiqueCost + synthesisCost
}
