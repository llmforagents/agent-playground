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

export const DEFAULT_COUNCIL_CONFIG: CouncilConfig = {
  drafters: [
    Model('google/gemini-2.5-flash-lite'),
    Model('anthropic/claude-haiku-4.5'),
    Model('openai/gpt-5-mini'),
  ],
  chairman: Model('google/gemini-2.5-flash-lite'),
  maxCritiqueRounds: 1,
  enableDrafterRevision: false,
}

export const COUNCIL_EXPENSIVE_THRESHOLD_CENTS = 50 as const

export function estimateCouncilCostCents(config: CouncilConfig): number {
  const isPremium = (m: Model): boolean => {
    const s = String(m).toLowerCase()
    return (
      s.includes('opus') ||
      s.includes('sonnet') ||
      s.includes('gpt-5.1') ||
      s.includes('gemini-3-pro')
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
