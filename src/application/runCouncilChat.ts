import { Err, Ok, type Result } from '@/domain/result'
import type { AppError } from '@/domain/errors'
import { coerceToAppError } from '@/domain/errors'
import type { Model, ApiKey } from '@/domain/branded'
import {
  type CouncilConfig,
  type DrafterSlot,
  DRAFTER_SLOTS,
  MAX_DEBATE_ROUNDS,
  MAX_DRAFTERS,
  MIN_DEBATE_ROUNDS,
  MIN_DRAFTERS,
  COUNCIL_TOOL_NAMES,
} from '@/domain/council'
import type { CouncilEvent } from '@/domain/councilEvents'
import {
  buildDrafterMessages,
  buildDebateMessages,
  buildSynthesisMessages,
  anonymizeOthers,
  buildDrafterMessagesWithTools,
  buildDebateMessagesWithTools,
  type ChatMessage,
} from './buildCouncilPrompts'
import {
  runDrafterTurnWithTools,
  type DrafterTurnEvent,
} from './runCouncilTurn'
import type { SdkConfig } from '@/infrastructure/sdk/sdkClient'
import type { RestApiPort } from './ports'

export type ChatPortArgs = Readonly<{
  model: Model
  messages: ReadonlyArray<ChatMessage>
  signal?: AbortSignal
}>

export type ChatPortChunk =
  | Readonly<{ kind: 'delta'; text: string }>
  | Readonly<{ kind: 'done'; content: string; costCents: number }>

export interface ChatPort {
  completionStream(args: ChatPortArgs): AsyncGenerator<ChatPortChunk, void, void>
}

/**
 * Per-call hard timeout for council streams. Five minutes covers worst-case
 * streaming for premium models on heavy prompts.
 */
const COUNCIL_STREAM_TIMEOUT_MS = 5 * 60 * 1000

/**
 * Idle timeout: if no chunk arrives within this window, we treat the stream as
 * stuck and abort. Some providers send keep-alives or simply stop emitting
 * `[DONE]` after the model finishes, leaving the SSE connection open forever.
 * 60 s is generous enough not to fire during legitimate slow generation, while
 * still rescuing the UI from a permanently "Sintetizando…" state.
 */
const COUNCIL_STREAM_IDLE_MS = 60 * 1000

export function makeRestChatPort(rest: RestApiPort, key: ApiKey): ChatPort {
  return {
    async *completionStream({ model, messages, signal }) {
      // Always keep a local AbortController so we can fire idle aborts ourselves.
      // We forward upstream aborts through it; the SDK only sees this controller's signal.
      const localController = new AbortController()
      const onUpstreamAbort = (): void => localController.abort('upstream')
      if (signal) {
        if (signal.aborted) localController.abort('upstream')
        else signal.addEventListener('abort', onUpstreamAbort)
      }

      let idleTimer: ReturnType<typeof setTimeout> | null = null
      const resetIdle = (): void => {
        if (idleTimer) clearTimeout(idleTimer)
        idleTimer = setTimeout(() => {
          localController.abort('idle')
        }, COUNCIL_STREAM_IDLE_MS)
      }
      resetIdle()

      try {
        const stream = rest.chatCompletionStream(
          key,
          {
            model: String(model),
            messages: messages.map((m) => ({ role: m.role, content: m.content })),
            stream: true,
          },
          localController.signal,
          COUNCIL_STREAM_TIMEOUT_MS,
        )
        let buffered = ''
        let sawDone = false
        for await (const chunk of stream) {
          resetIdle()
          if (chunk.kind === 'delta') {
            buffered += chunk.text
            yield { kind: 'delta', text: chunk.text }
          } else if (chunk.kind === 'done') {
            sawDone = true
            yield {
              kind: 'done',
              content: chunk.fullText || buffered,
              costCents: chunk.meta.costCents ?? 0,
            }
          }
        }
        // Some providers close the SSE connection without ever emitting a final
        // chunk. If we got text but no `done`, synthesise one so callers exit
        // their loops with the partial content instead of hanging.
        if (!sawDone && buffered.length > 0) {
          yield { kind: 'done', content: buffered, costCents: 0 }
        }
      } finally {
        if (idleTimer) clearTimeout(idleTimer)
        if (signal) signal.removeEventListener('abort', onUpstreamAbort)
      }
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

type DebateResult = Readonly<{
  slot: DrafterSlot
  model: Model
  content: string
  costCents: number
}>

export type RunCouncilArgs = Readonly<{
  config: CouncilConfig
  userTask: string
  signal?: AbortSignal
}>

export type RunCouncilDeps = Readonly<{
  chat: ChatPort
  /**
   * Returns the agent's available balance in USD cents. Optional.
   * When provided, runCouncilChat samples it before and after the run
   * and reports the difference as the authoritative total cost — this
   * captures backend per-call minimums, fee percentages and any markup
   * that the SDK's per-chunk usage doesn't surface.
   */
  getBalanceCents?: () => Promise<number | null>
  /** Required when any plan stage in config.tools.stages is non-empty. */
  apiKey?: ApiKey
  /** Optional SDK config forwarded to runDrafterTurnWithTools. */
  sdkConfig?: SdkConfig
}>

/**
 * Helper: collect a streaming completion into a final {content, costCents},
 * forwarding deltas to the caller via the provided onDelta callback.
 */
async function streamOne(
  chat: ChatPort,
  args: ChatPortArgs,
  onDelta: (text: string) => void,
): Promise<{ content: string; costCents: number }> {
  let content = ''
  let costCents = 0
  for await (const chunk of chat.completionStream(args)) {
    if (chunk.kind === 'delta') {
      onDelta(chunk.text)
      content += chunk.text
    } else if (chunk.kind === 'done') {
      content = chunk.content || content
      costCents = chunk.costCents
    }
  }
  return { content, costCents }
}

type ToolEventForDrafter =
  | Readonly<{ kind: 'tool_call'; slot: DrafterSlot; callId: string; toolName: import('@/domain/council').CouncilToolName; args: unknown }>
  | Readonly<{ kind: 'tool_result'; slot: DrafterSlot; callId: string; ok: boolean; summary: string }>

async function streamDrafterTurnInto(args: {
  apiKey: ApiKey
  sdkConfig?: SdkConfig
  model: Model
  systemPrompt: string
  history: ReadonlyArray<ChatMessage>
  userMessage: string
  maxToolCalls: number
  signal?: AbortSignal
  slot: DrafterSlot
  deltaQueue: Array<Readonly<{ slot: DrafterSlot; text: string }>>
  toolQueue: ToolEventForDrafter[]
}): Promise<{ content: string; costCents: number }> {
  const gen = runDrafterTurnWithTools(
    args.sdkConfig !== undefined
      ? { key: args.apiKey, sdkConfig: args.sdkConfig }
      : { key: args.apiKey },
    {
      model: args.model,
      systemPrompt: args.systemPrompt,
      history: args.history,
      userMessage: args.userMessage,
      allowedTools: COUNCIL_TOOL_NAMES,
      maxToolCalls: args.maxToolCalls,
      ...(args.signal ? { signal: args.signal } : {}),
    },
  )
  let content = ''
  let costCents = 0
  for (;;) {
    const r = await gen.next()
    if (r.done) {
      content = r.value.content
      costCents = r.value.costCents
      break
    }
    const ev: DrafterTurnEvent = r.value
    if (ev.kind === 'delta') {
      args.deltaQueue.push({ slot: args.slot, text: ev.text })
    } else if (ev.kind === 'tool_call') {
      args.toolQueue.push({
        kind: 'tool_call',
        slot: args.slot,
        callId: ev.callId,
        toolName: ev.toolName,
        args: ev.args,
      })
    } else if (ev.kind === 'tool_result') {
      args.toolQueue.push({
        kind: 'tool_result',
        slot: args.slot,
        callId: ev.callId,
        ok: ev.ok,
        summary: ev.summary,
      })
    }
  }
  return { content, costCents }
}

export async function* runCouncilChat(
  deps: RunCouncilDeps,
  args: RunCouncilArgs,
): AsyncGenerator<CouncilEvent, Result<{ finalAnswer: string }, AppError>, void> {
  const { chat, getBalanceCents } = deps
  const { config, userTask, signal } = args

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

  const debateRounds = Math.max(
    MIN_DEBATE_ROUNDS,
    Math.min(MAX_DEBATE_ROUNDS, config.debateRounds),
  )

  const startTime = Date.now()
  let totalCostCents = 0

  // Sample the agent's balance before the run so we can later report
  // the authoritative billed cost (= balanceBefore - balanceAfter).
  // The per-chunk SDK costs ignore backend minimums and fees, so this
  // is the only reliable total.
  const balanceBefore: number | null = getBalanceCents ? await getBalanceCents().catch(() => null) : null

  yield {
    kind: 'council_started',
    totalDrafters: config.drafters.length,
    chairman: config.chairman,
    debateRounds,
  }

  // ============== STAGE 1: Initial drafts (parallel, streamed) ==============
  const draftSlots: ReadonlyArray<{ slot: DrafterSlot; model: Model }> = config.drafters.map(
    (model, i) => ({ slot: (DRAFTER_SLOTS[i] ?? 'A') as DrafterSlot, model }),
  )

  for (const { slot, model } of draftSlots) {
    yield { kind: 'draft_started', slot, model }
  }

  // Each drafter has its own delta queue so events can be flushed in order from one place.
  // We can't yield from inside the parallel async functions, so each task pushes deltas
  // into a shared queue and resolves with its final result; we drain the queue between awaits.
  type DeltaItem = Readonly<{ slot: DrafterSlot; text: string }>
  const draftDeltaQueue: DeltaItem[] = []
  let draftDoneCount = 0

  const draftToolQueue: ToolEventForDrafter[] = []
  const useToolsInDrafts = config.tools.stages.includes('drafts') &&
    config.tools.maxCallsPerDrafter > 0

  const draftPromises = draftSlots.map(async ({ slot, model }) => {
    const t0 = Date.now()
    try {
      if (useToolsInDrafts) {
        if (!deps.apiKey) {
          throw new Error('runCouncilChat: tools enabled but apiKey not provided in deps')
        }
        const systemMsg = buildDrafterMessagesWithTools(
          userTask,
          COUNCIL_TOOL_NAMES,
          config.tools.maxCallsPerDrafter,
        )[0]
        const final = await streamDrafterTurnInto({
          apiKey: deps.apiKey,
          ...(deps.sdkConfig !== undefined ? { sdkConfig: deps.sdkConfig } : {}),
          model,
          systemPrompt: systemMsg?.content ?? '',
          history: [],
          userMessage: userTask,
          maxToolCalls: config.tools.maxCallsPerDrafter,
          ...(signal !== undefined ? { signal } : {}),
          slot,
          deltaQueue: draftDeltaQueue,
          toolQueue: draftToolQueue,
        })
        return {
          kind: 'ok' as const,
          slot,
          model,
          content: final.content,
          costCents: final.costCents,
          durationMs: Date.now() - t0,
        }
      } else {
        const messages = buildDrafterMessages(userTask)
        const final = await streamOne(
          chat,
          signal !== undefined ? { model, messages, signal } : { model, messages },
          (text) => {
            draftDeltaQueue.push({ slot, text })
          },
        )
        return {
          kind: 'ok' as const,
          slot,
          model,
          content: final.content,
          costCents: final.costCents,
          durationMs: Date.now() - t0,
        }
      }
    } catch (e) {
      return { kind: 'failed' as const, slot, model, error: coerceToAppError(e) }
    } finally {
      draftDoneCount++
    }
  })

  while (draftDoneCount < draftSlots.length) {
    if (draftDeltaQueue.length === 0 && draftToolQueue.length === 0) {
      await new Promise((r) => setTimeout(r, 50))
      continue
    }
    while (draftDeltaQueue.length > 0) {
      const item = draftDeltaQueue.shift()
      if (item) yield { kind: 'draft_delta', slot: item.slot, text: item.text }
    }
    while (draftToolQueue.length > 0) {
      const item = draftToolQueue.shift()
      if (!item) continue
      if (item.kind === 'tool_call') {
        yield {
          kind: 'draft_tool_call',
          slot: item.slot,
          callId: item.callId,
          toolName: item.toolName,
          args: item.args,
        }
      } else {
        yield {
          kind: 'draft_tool_result',
          slot: item.slot,
          callId: item.callId,
          ok: item.ok,
          summary: item.summary,
        }
      }
    }
  }
  // Tail flush after all drafters finished
  while (draftDeltaQueue.length > 0) {
    const item = draftDeltaQueue.shift()
    if (item) yield { kind: 'draft_delta', slot: item.slot, text: item.text }
  }
  while (draftToolQueue.length > 0) {
    const item = draftToolQueue.shift()
    if (!item) continue
    if (item.kind === 'tool_call') {
      yield {
        kind: 'draft_tool_call',
        slot: item.slot,
        callId: item.callId,
        toolName: item.toolName,
        args: item.args,
      }
    } else {
      yield {
        kind: 'draft_tool_result',
        slot: item.slot,
        callId: item.callId,
        ok: item.ok,
        summary: item.summary,
      }
    }
  }

  const draftSettlements = await Promise.all(draftPromises)
  const liveDrafts: DraftResult[] = []

  for (const settlement of draftSettlements) {
    if (settlement.kind === 'ok' && settlement.content.trim() !== '') {
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
    } else if (settlement.kind === 'ok') {
      // Drafter finished without throwing but produced no text. This happens
      // when the tool budget exhausts the SDK's round budget before the
      // model gets to write its answer. Bill what was actually spent (the
      // tool calls and LLM tokens are real) but surface it as a failure so
      // it doesn't feed an empty position into the debate.
      totalCostCents += settlement.costCents
      yield {
        kind: 'draft_failed',
        slot: settlement.slot,
        model: settlement.model,
        error: {
          kind: 'validation',
          issues: [
            { path: ['drafter', settlement.slot], message: 'Empty content after tool rounds' },
          ],
        },
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

  // ============== STAGE 2: Multi-round debate (parallel within a round, streamed) ==============
  // Track latest content per slot so each round feeds the next.
  // Round 1 sees the original drafts; round 2+ sees the previous debate output.
  const allDebateRounds: DebateResult[][] = []
  // Per-slot, the previous round's debate response (or null in round 1).
  const previousDebatePerSlot = new Map<DrafterSlot, string>()
  // Per-slot, what each OTHER slot is currently showing (drafts in r1, debate in r2+).
  const getLatestPerSlot = (round: number): ReadonlyArray<{ slot: DrafterSlot; content: string }> => {
    if (round === 1 || allDebateRounds.length === 0) {
      return liveDrafts.map(({ slot, content }) => ({ slot, content }))
    }
    return allDebateRounds[allDebateRounds.length - 1] ?? []
  }

  for (let round = 1; round <= debateRounds; round++) {
    yield { kind: 'debate_round_started', round, totalRounds: debateRounds }

    for (const { slot, model } of liveDrafts) {
      yield { kind: 'debate_started', round, slot, model }
    }

    const debateDeltaQueue: Array<Readonly<{ round: number; slot: DrafterSlot; text: string }>> = []
    let debateDoneCount = 0

    const latestPerSlot = getLatestPerSlot(round)

    type DebateToolEv =
      | Readonly<{ kind: 'tool_call'; round: number; slot: DrafterSlot; callId: string; toolName: import('@/domain/council').CouncilToolName; args: unknown }>
      | Readonly<{ kind: 'tool_result'; round: number; slot: DrafterSlot; callId: string; ok: boolean; summary: string }>
    const debateToolQueue: DebateToolEv[] = []
    const useToolsInDebate = config.tools.stages.includes('debate') &&
      config.tools.maxCallsPerDrafter > 0

    const debatePromises = liveDrafts.map(async (draft) => {
      const t0 = Date.now()
      try {
        const others = anonymizeOthers(latestPerSlot, draft.slot)
        if (useToolsInDebate) {
          if (!deps.apiKey) {
            throw new Error('runCouncilChat: tools enabled but apiKey not provided in deps')
          }
          const baseMsgs = buildDebateMessagesWithTools({
            userTask,
            myDraft: draft.content,
            myPreviousDebate: previousDebatePerSlot.get(draft.slot) ?? null,
            othersLatest: others,
            round,
            totalRounds: debateRounds,
            allowedTools: COUNCIL_TOOL_NAMES,
            maxCalls: config.tools.maxCallsPerDrafter,
          })
          const systemMsg = baseMsgs[0]
          const userMsg = baseMsgs[1]
          const slotInner = draft.slot
          const gen = runDrafterTurnWithTools(
            deps.sdkConfig !== undefined
              ? { key: deps.apiKey, sdkConfig: deps.sdkConfig }
              : { key: deps.apiKey },
            {
              model: draft.model,
              systemPrompt: systemMsg?.content ?? '',
              history: [],
              userMessage: userMsg?.content ?? '',
              allowedTools: COUNCIL_TOOL_NAMES,
              maxToolCalls: config.tools.maxCallsPerDrafter,
              ...(signal !== undefined ? { signal } : {}),
            },
          )
          let content = ''
          let costCents = 0
          for (;;) {
            const r = await gen.next()
            if (r.done) {
              content = r.value.content
              costCents = r.value.costCents
              break
            }
            const ev = r.value
            if (ev.kind === 'delta') {
              debateDeltaQueue.push({ round, slot: slotInner, text: ev.text })
            } else if (ev.kind === 'tool_call') {
              debateToolQueue.push({
                kind: 'tool_call',
                round,
                slot: slotInner,
                callId: ev.callId,
                toolName: ev.toolName,
                args: ev.args,
              })
            } else if (ev.kind === 'tool_result') {
              debateToolQueue.push({
                kind: 'tool_result',
                round,
                slot: slotInner,
                callId: ev.callId,
                ok: ev.ok,
                summary: ev.summary,
              })
            }
          }
          return {
            kind: 'ok' as const,
            slot: draft.slot,
            model: draft.model,
            content,
            costCents,
            durationMs: Date.now() - t0,
          }
        } else {
          const messages = buildDebateMessages({
            userTask,
            myDraft: draft.content,
            myPreviousDebate: previousDebatePerSlot.get(draft.slot) ?? null,
            othersLatest: others,
            round,
            totalRounds: debateRounds,
          })
          const final = await streamOne(
            chat,
            signal !== undefined ? { model: draft.model, messages, signal } : { model: draft.model, messages },
            (text) => {
              debateDeltaQueue.push({ round, slot: draft.slot, text })
            },
          )
          return {
            kind: 'ok' as const,
            slot: draft.slot,
            model: draft.model,
            content: final.content,
            costCents: final.costCents,
            durationMs: Date.now() - t0,
          }
        }
      } catch (e) {
        return {
          kind: 'failed' as const,
          slot: draft.slot,
          model: draft.model,
          error: coerceToAppError(e),
        }
      } finally {
        debateDoneCount++
      }
    })

    while (debateDoneCount < liveDrafts.length) {
      if (debateDeltaQueue.length === 0 && debateToolQueue.length === 0) {
        await new Promise((r) => setTimeout(r, 50))
        continue
      }
      while (debateDeltaQueue.length > 0) {
        const item = debateDeltaQueue.shift()
        if (item) yield { kind: 'debate_delta', round: item.round, slot: item.slot, text: item.text }
      }
      while (debateToolQueue.length > 0) {
        const item = debateToolQueue.shift()
        if (!item) continue
        if (item.kind === 'tool_call') {
          yield {
            kind: 'debate_tool_call',
            round: item.round,
            slot: item.slot,
            callId: item.callId,
            toolName: item.toolName,
            args: item.args,
          }
        } else {
          yield {
            kind: 'debate_tool_result',
            round: item.round,
            slot: item.slot,
            callId: item.callId,
            ok: item.ok,
            summary: item.summary,
          }
        }
      }
    }
    while (debateDeltaQueue.length > 0) {
      const item = debateDeltaQueue.shift()
      if (item) yield { kind: 'debate_delta', round: item.round, slot: item.slot, text: item.text }
    }
    while (debateToolQueue.length > 0) {
      const item = debateToolQueue.shift()
      if (!item) continue
      if (item.kind === 'tool_call') {
        yield {
          kind: 'debate_tool_call',
          round: item.round,
          slot: item.slot,
          callId: item.callId,
          toolName: item.toolName,
          args: item.args,
        }
      } else {
        yield {
          kind: 'debate_tool_result',
          round: item.round,
          slot: item.slot,
          callId: item.callId,
          ok: item.ok,
          summary: item.summary,
        }
      }
    }

    const settlements = await Promise.all(debatePromises)
    const liveDebatesThisRound: DebateResult[] = []

    for (const settlement of settlements) {
      if (settlement.kind === 'ok' && settlement.content.trim() !== '') {
        totalCostCents += settlement.costCents
        liveDebatesThisRound.push({
          slot: settlement.slot,
          model: settlement.model,
          content: settlement.content,
          costCents: settlement.costCents,
        })
        previousDebatePerSlot.set(settlement.slot, settlement.content)
        yield {
          kind: 'debate_done',
          round,
          slot: settlement.slot,
          model: settlement.model,
          content: settlement.content,
          costCents: settlement.costCents,
          durationMs: settlement.durationMs,
        }
      } else if (settlement.kind === 'ok') {
        // Same empty-content guard as drafts: bill what was spent but do
        // not propagate an empty position to the next round or to the
        // chairman.
        totalCostCents += settlement.costCents
        yield {
          kind: 'debate_failed',
          round,
          slot: settlement.slot,
          model: settlement.model,
          error: {
            kind: 'validation',
            issues: [
              { path: ['debater', settlement.slot, `round-${round}`], message: 'Empty content after tool rounds' },
            ],
          },
        }
      } else {
        yield {
          kind: 'debate_failed',
          round,
          slot: settlement.slot,
          model: settlement.model,
          error: settlement.error,
        }
      }
    }

    allDebateRounds.push(liveDebatesThisRound)
  }

  // ============== STAGE 3: Synthesis (chairman, streamed) ==============
  yield { kind: 'synthesis_started', model: config.chairman }

  const synthesisT0 = Date.now()
  const synthesisMessages: ReadonlyArray<ChatMessage> = buildSynthesisMessages({
    userTask,
    drafts: liveDrafts.map(({ slot, content }) => ({ slot, content })),
    debateRounds: allDebateRounds.map((r) => r.map(({ slot, content }) => ({ slot, content }))),
  })

  let synthesisContent = ''
  let synthesisCost = 0
  try {
    for await (const chunk of chat.completionStream(
      signal !== undefined
        ? { model: config.chairman, messages: synthesisMessages, signal }
        : { model: config.chairman, messages: synthesisMessages },
    )) {
      if (chunk.kind === 'delta') {
        synthesisContent += chunk.text
        yield { kind: 'synthesis_delta', text: chunk.text }
      } else if (chunk.kind === 'done') {
        synthesisContent = chunk.content || synthesisContent
        synthesisCost = chunk.costCents
      }
    }
  } catch (e) {
    const err = coerceToAppError(e)
    yield { kind: 'council_failed', error: err, partialCostCents: totalCostCents }
    return Err(err)
  }

  const synthesisDuration = Date.now() - synthesisT0
  totalCostCents += synthesisCost

  // Split chairman output into final answer and reasoning by the marker.
  const { answer: finalAnswerText, reasoning: chairmanReasoning } =
    splitChairmanOutput(synthesisContent)

  yield {
    kind: 'synthesis_done',
    model: config.chairman,
    content: finalAnswerText,
    reasoning: chairmanReasoning,
    costCents: synthesisCost,
    durationMs: synthesisDuration,
  }

  const totalDurationMs = Date.now() - startTime

  // Override SDK-summed total with billed total when we can sample the balance.
  // Backend applies per-call minimums and fees that don't surface in the
  // per-chunk usage data, so the SDK sum is consistently under-reported.
  let billedTotalCents = totalCostCents
  if (balanceBefore !== null && getBalanceCents) {
    const balanceAfter = await getBalanceCents().catch(() => null)
    if (balanceAfter !== null) {
      const diff = balanceBefore - balanceAfter
      if (diff >= 0) billedTotalCents = diff
    }
  }

  yield {
    kind: 'council_done',
    finalAnswer: finalAnswerText,
    totalCostCents: billedTotalCents,
    totalDurationMs,
  }

  return Ok({ finalAnswer: finalAnswerText })
}

const REASONING_MARKER = '===COUNCIL_REASONING==='

/**
 * Splits the chairman's raw output into the user-facing answer and
 * the reasoning section. If the marker is missing (some models drift),
 * returns the full text as the answer and `null` for reasoning.
 */
export function splitChairmanOutput(raw: string): { answer: string; reasoning: string | null } {
  const idx = raw.indexOf(REASONING_MARKER)
  if (idx < 0) return { answer: raw.trim(), reasoning: null }
  const answer = raw.slice(0, idx).trim()
  const reasoning = raw.slice(idx + REASONING_MARKER.length).trim()
  return { answer, reasoning: reasoning || null }
}
