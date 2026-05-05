import type { AppError } from './errors'
import type { Model } from './branded'
import type { DrafterSlot } from './council'

export type CouncilEvent =
  | Readonly<{ kind: 'council_started'; totalDrafters: number; chairman: Model }>
  | Readonly<{ kind: 'draft_started'; slot: DrafterSlot; model: Model }>
  | Readonly<{
      kind: 'draft_done'
      slot: DrafterSlot
      model: Model
      content: string
      costCents: number
      durationMs: number
    }>
  | Readonly<{
      kind: 'draft_failed'
      slot: DrafterSlot
      model: Model
      error: AppError
    }>
  | Readonly<{ kind: 'critique_started'; slot: DrafterSlot; model: Model }>
  | Readonly<{
      kind: 'critique_done'
      slot: DrafterSlot
      model: Model
      content: string
      costCents: number
      durationMs: number
    }>
  | Readonly<{
      kind: 'critique_failed'
      slot: DrafterSlot
      model: Model
      error: AppError
    }>
  | Readonly<{ kind: 'synthesis_started'; model: Model }>
  | Readonly<{
      kind: 'synthesis_done'
      model: Model
      content: string
      costCents: number
      durationMs: number
    }>
  | Readonly<{
      kind: 'council_done'
      finalAnswer: string
      totalCostCents: number
      totalDurationMs: number
    }>
  | Readonly<{ kind: 'council_failed'; error: AppError; partialCostCents: number }>
