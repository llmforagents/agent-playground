import { Err, Ok, type Result } from '@/domain/result'
import type { AppError } from '@/domain/errors'
import { coerceToAppError } from '@/domain/errors'
import type { Model, ApiKey } from '@/domain/branded'
import {
  type CouncilConfig,
  type DrafterSlot,
  DRAFTER_SLOTS,
  MAX_DRAFTERS,
  MIN_DRAFTERS,
} from '@/domain/council'
import type { CouncilEvent } from '@/domain/councilEvents'
import {
  buildDrafterMessages,
  buildCritiqueMessages,
  buildSynthesisMessages,
  anonymizeOthers,
  type ChatMessage,
} from './buildCouncilPrompts'
import type { RestApiPort } from './ports'

export type ChatPortArgs = Readonly<{
  model: Model
  messages: ReadonlyArray<ChatMessage>
}>

export type ChatPortResponse = Readonly<{
  content: string
  costCents: number
}>

export interface ChatPort {
  completion(args: ChatPortArgs): Promise<Result<ChatPortResponse, AppError>>
}

export function makeRestChatPort(rest: RestApiPort, key: ApiKey): ChatPort {
  return {
    async completion({ model, messages }) {
      const res = await rest.chatCompletion(key, {
        model: String(model),
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
      })
      if (!res.ok) return Err(res.error)
      const choice = res.value.data.choices[0]
      const rawContent = choice?.message.content ?? ''
      const content = typeof rawContent === 'string' ? rawContent : ''
      const costCents = res.value.meta.costCents ?? 0
      return Ok({ content, costCents })
    },
  }
}

const MIN_LIVE_DRAFTS_TO_PROCEED = 2

type DraftResult = Readonly<{
  slot: DrafterSlot
  model: Model
  content: string
  costCents: number
}>

type CritiqueResult = Readonly<{
  slot: DrafterSlot
  model: Model
  content: string
  costCents: number
}>

export type RunCouncilArgs = Readonly<{
  config: CouncilConfig
  userTask: string
}>

export async function* runCouncilChat(
  deps: Readonly<{ chat: ChatPort }>,
  args: RunCouncilArgs,
): AsyncGenerator<CouncilEvent, Result<{ finalAnswer: string }, AppError>, void> {
  const { chat } = deps
  const { config, userTask } = args

  if (config.drafters.length < MIN_DRAFTERS || config.drafters.length > MAX_DRAFTERS) {
    const err: AppError = {
      kind: 'validation',
      issues: [
        {
          path: ['drafters'],
          message: `Council requires ${MIN_DRAFTERS}–${MAX_DRAFTERS} drafters, got ${config.drafters.length}`,
        },
      ],
    }
    yield { kind: 'council_failed', error: err, partialCostCents: 0 }
    return Err(err)
  }

  const startTime = Date.now()
  let totalCostCents = 0

  yield {
    kind: 'council_started',
    totalDrafters: config.drafters.length,
    chairman: config.chairman,
  }

  const draftSlots: ReadonlyArray<{ slot: DrafterSlot; model: Model }> = config.drafters.map(
    (model, i) => ({ slot: (DRAFTER_SLOTS[i] ?? 'A') as DrafterSlot, model }),
  )

  for (const { slot, model } of draftSlots) {
    yield { kind: 'draft_started', slot, model }
  }

  const draftPromises = draftSlots.map(async ({ slot, model }) => {
    const t0 = Date.now()
    try {
      const messages = buildDrafterMessages(userTask)
      const result = await chat.completion({ model, messages })
      if (!result.ok) {
        return { kind: 'failed' as const, slot, model, error: result.error }
      }
      const durationMs = Date.now() - t0
      return {
        kind: 'ok' as const,
        slot,
        model,
        content: result.value.content,
        costCents: result.value.costCents,
        durationMs,
      }
    } catch (e) {
      return {
        kind: 'failed' as const,
        slot,
        model,
        error: coerceToAppError(e),
      }
    }
  })

  const draftSettlements = await Promise.all(draftPromises)
  const liveDrafts: DraftResult[] = []

  for (const settlement of draftSettlements) {
    if (settlement.kind === 'ok') {
      totalCostCents += settlement.costCents
      liveDrafts.push({
        slot: settlement.slot,
        model: settlement.model,
        content: settlement.content,
        costCents: settlement.costCents,
      })
      yield {
        kind: 'draft_done',
        slot: settlement.slot,
        model: settlement.model,
        content: settlement.content,
        costCents: settlement.costCents,
        durationMs: settlement.durationMs,
      }
    } else {
      yield {
        kind: 'draft_failed',
        slot: settlement.slot,
        model: settlement.model,
        error: settlement.error,
      }
    }
  }

  if (liveDrafts.length < MIN_LIVE_DRAFTS_TO_PROCEED) {
    const err: AppError = {
      kind: 'validation',
      issues: [
        {
          path: ['drafters'],
          message: `Only ${liveDrafts.length} drafter(s) succeeded, need ≥${MIN_LIVE_DRAFTS_TO_PROCEED}`,
        },
      ],
    }
    yield { kind: 'council_failed', error: err, partialCostCents: totalCostCents }
    return Err(err)
  }

  for (const { slot, model } of liveDrafts) {
    yield { kind: 'critique_started', slot, model }
  }

  const critiquePromises = liveDrafts.map(async (draft) => {
    const t0 = Date.now()
    try {
      const others = anonymizeOthers(liveDrafts, draft.slot)
      const messages = buildCritiqueMessages({
        userTask,
        myDraft: draft.content,
        othersDrafts: others,
      })
      const result = await chat.completion({ model: draft.model, messages })
      if (!result.ok) {
        return { kind: 'failed' as const, slot: draft.slot, model: draft.model, error: result.error }
      }
      const durationMs = Date.now() - t0
      return {
        kind: 'ok' as const,
        slot: draft.slot,
        model: draft.model,
        content: result.value.content,
        costCents: result.value.costCents,
        durationMs,
      }
    } catch (e) {
      return {
        kind: 'failed' as const,
        slot: draft.slot,
        model: draft.model,
        error: coerceToAppError(e),
      }
    }
  })

  const critiqueSettlements = await Promise.all(critiquePromises)
  const liveCritiques: CritiqueResult[] = []

  for (const settlement of critiqueSettlements) {
    if (settlement.kind === 'ok') {
      totalCostCents += settlement.costCents
      liveCritiques.push({
        slot: settlement.slot,
        model: settlement.model,
        content: settlement.content,
        costCents: settlement.costCents,
      })
      yield {
        kind: 'critique_done',
        slot: settlement.slot,
        model: settlement.model,
        content: settlement.content,
        costCents: settlement.costCents,
        durationMs: settlement.durationMs,
      }
    } else {
      yield {
        kind: 'critique_failed',
        slot: settlement.slot,
        model: settlement.model,
        error: settlement.error,
      }
    }
  }

  yield { kind: 'synthesis_started', model: config.chairman }

  const synthesisT0 = Date.now()
  const synthesisMessages: ReadonlyArray<ChatMessage> = buildSynthesisMessages({
    userTask,
    drafts: liveDrafts.map(({ slot, content }) => ({ slot, content })),
    critiques: liveCritiques.map(({ slot, content }) => ({ slot, content })),
  })

  const synthesisResult = await chat.completion({
    model: config.chairman,
    messages: synthesisMessages,
  })

  if (!synthesisResult.ok) {
    yield {
      kind: 'council_failed',
      error: synthesisResult.error,
      partialCostCents: totalCostCents,
    }
    return Err(synthesisResult.error)
  }

  const synthesisDuration = Date.now() - synthesisT0
  totalCostCents += synthesisResult.value.costCents

  yield {
    kind: 'synthesis_done',
    model: config.chairman,
    content: synthesisResult.value.content,
    costCents: synthesisResult.value.costCents,
    durationMs: synthesisDuration,
  }

  const totalDurationMs = Date.now() - startTime

  yield {
    kind: 'council_done',
    finalAnswer: synthesisResult.value.content,
    totalCostCents,
    totalDurationMs,
  }

  return Ok({ finalAnswer: synthesisResult.value.content })
}
