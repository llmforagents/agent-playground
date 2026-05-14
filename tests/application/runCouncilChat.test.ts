import { describe, it, expect } from 'vitest'
import {
  runCouncilChat,
  splitChairmanOutput,
  type ChatPort,
  type ChatPortChunk,
  type ChatPortArgs,
} from '@/application/runCouncilChat'
import { Ok, Err } from '@/domain/result'
import { COUNCIL_PLANS } from '@/domain/council'
import type { CouncilEvent } from '@/domain/councilEvents'

type StreamImpl = (args: ChatPortArgs) => AsyncGenerator<ChatPortChunk, void, void>

function fakeChat(impl: StreamImpl): ChatPort {
  return { completionStream: impl }
}

async function collect(
  gen: AsyncGenerator<CouncilEvent, unknown, void>,
): Promise<CouncilEvent[]> {
  const out: CouncilEvent[] = []
  for await (const e of gen) out.push(e)
  return out
}

function isDebateRequest(messages: ReadonlyArray<{ content: string }>): boolean {
  return messages.some((m) => /Other drafters'.*(drafts|previous debate)/i.test(m.content))
}

function isSynthesisRequest(messages: ReadonlyArray<{ content: string }>): boolean {
  return messages.some((m) => m.content.includes('Full debate'))
}

async function* singleChunk(
  content: string,
  costCents = 1,
): AsyncGenerator<ChatPortChunk, void, void> {
  yield { kind: 'delta', text: content }
  yield { kind: 'done', content, costCents }
}

function errorStream(): AsyncGenerator<ChatPortChunk, void, void> {
  return (async function* () {
    throw new Error('boom')
  })()
}

describe('runCouncilChat', () => {
  it('happy path with 2 debate rounds (default lite) emits expected event sequence', async () => {
    const chat = fakeChat((args) => {
      const isSynth = isSynthesisRequest(args.messages)
      const isDeb = !isSynth && isDebateRequest(args.messages)
      const content = isSynth ? 'final' : isDeb ? 'debate' : 'draft'
      return singleChunk(content)
    })

    const events = await collect(
      runCouncilChat({ chat }, { config: COUNCIL_PLANS.lite, userTask: 't' }),
    )

    const kinds = events.map((e) => e.kind)
    expect(kinds[0]).toBe('council_started')
    // 3 drafts done
    expect(kinds.filter((k) => k === 'draft_done')).toHaveLength(3)
    // 2 rounds × 3 debaters = 6 debate_done
    expect(kinds.filter((k) => k === 'debate_done')).toHaveLength(6)
    // 2 round_started events
    expect(kinds.filter((k) => k === 'debate_round_started')).toHaveLength(2)
    expect(kinds).toContain('synthesis_done')
    expect(kinds[kinds.length - 1]).toBe('council_done')
  })

  it('respects MAX_DEBATE_ROUNDS by clamping config.debateRounds', async () => {
    const chat = fakeChat((args) => {
      const isSynth = isSynthesisRequest(args.messages)
      const isDeb = !isSynth && isDebateRequest(args.messages)
      return singleChunk(isSynth ? 'f' : isDeb ? 'd' : 'dr')
    })
    const events = await collect(
      runCouncilChat(
        { chat },
        { config: { ...COUNCIL_PLANS.lite, debateRounds: 50 }, userTask: 't' },
      ),
    )
    expect(events.filter((e) => e.kind === 'debate_round_started')).toHaveLength(5)
  })

  it('streams deltas before done events', async () => {
    const chat = fakeChat((args) => {
      const isSynth = isSynthesisRequest(args.messages)
      const isDeb = !isSynth && isDebateRequest(args.messages)
      const content = isSynth ? 'final' : isDeb ? 'debate' : 'draft'
      return singleChunk(content)
    })
    const events = await collect(
      runCouncilChat({ chat }, { config: COUNCIL_PLANS.lite, userTask: 't' }),
    )
    expect(events.some((e) => e.kind === 'draft_delta')).toBe(true)
    expect(events.some((e) => e.kind === 'debate_delta')).toBe(true)
    expect(events.some((e) => e.kind === 'synthesis_delta')).toBe(true)
  })

  it('aborts when 2 of 3 drafters fail', async () => {
    let drafts = 0
    const chat = fakeChat((args) => {
      const isSynth = isSynthesisRequest(args.messages)
      const isDeb = !isSynth && isDebateRequest(args.messages)
      const isDraft = !isSynth && !isDeb
      if (isDraft) {
        drafts++
        if (drafts <= 2) return errorStream()
      }
      return singleChunk('x')
    })
    const events = await collect(
      runCouncilChat({ chat }, { config: COUNCIL_PLANS.lite, userTask: 't' }),
    )
    expect(events.some((e) => e.kind === 'council_failed')).toBe(true)
    expect(events.some((e) => e.kind === 'synthesis_done')).toBe(false)
  })

  it('continues when 1 of 3 drafters fails', async () => {
    let drafts = 0
    const chat = fakeChat((args) => {
      const isSynth = isSynthesisRequest(args.messages)
      const isDeb = !isSynth && isDebateRequest(args.messages)
      const isDraft = !isSynth && !isDeb
      if (isDraft) {
        drafts++
        if (drafts === 1) return errorStream()
      }
      return singleChunk('x')
    })
    const events = await collect(
      runCouncilChat({ chat }, { config: COUNCIL_PLANS.lite, userTask: 't' }),
    )
    expect(events.some((e) => e.kind === 'draft_failed')).toBe(true)
    expect(events.some((e) => e.kind === 'council_done')).toBe(true)
  })

  it('debate prompt does not leak the debater own slot label', async () => {
    const seenDebatePrompts: string[] = []
    const chat = fakeChat((args) => {
      const userMsg = args.messages.find((m) => m.role === 'user')?.content ?? ''
      if (isDebateRequest(args.messages) && !isSynthesisRequest(args.messages)) {
        seenDebatePrompts.push(userMsg)
      }
      return singleChunk('x')
    })
    await collect(
      runCouncilChat({ chat }, { config: COUNCIL_PLANS.lite, userTask: 't' }),
    )
    expect(seenDebatePrompts.length).toBeGreaterThan(0)
    for (const p of seenDebatePrompts) {
      expect(p).not.toMatch(/Drafter [ABC]\b/)
    }
  })

  it('aborts when chairman fails with partial cost preserved', async () => {
    const chat = fakeChat((args) => {
      if (isSynthesisRequest(args.messages)) return errorStream()
      return singleChunk('x')
    })
    const events = await collect(
      runCouncilChat({ chat }, { config: COUNCIL_PLANS.lite, userTask: 't' }),
    )
    const failed = events.find((e) => e.kind === 'council_failed')
    expect(failed).toBeTruthy()
    if (failed && failed.kind === 'council_failed') {
      // 3 drafts + (2 rounds × 3 debaters) = 9 cents accumulated before chairman
      expect(failed.partialCostCents).toBe(9)
    }
  })

  // Use Err just to keep import warnings quiet in case the test file gets pruned later.
  void Err
  void Ok
})

describe('runCouncilChat — billed total via balance diff', () => {
  it('overrides totalCostCents with balanceBefore - balanceAfter when getBalanceCents is provided', async () => {
    const chat = fakeChat((args) => {
      const isSynth = isSynthesisRequest(args.messages)
      const isDeb = !isSynth && isDebateRequest(args.messages)
      const content = isSynth ? 'final\n===COUNCIL_REASONING===\nbecause' : isDeb ? 'd' : 'dr'
      return singleChunk(content, 1) // SDK reports 1 cent per call
    })
    // 10 calls × 1 cent = 10 SDK cents.  But the backend (per fixture) charged 25.
    let calls = 0
    const getBalanceCents = async (): Promise<number> => {
      calls++
      if (calls === 1) return 100 // before
      return 75                    // after — backend billed 25 cents
    }

    const events = await collect(
      runCouncilChat({ chat, getBalanceCents }, { config: COUNCIL_PLANS.lite, userTask: 't' }),
    )
    const done = events.find((e) => e.kind === 'council_done')
    expect(done && 'totalCostCents' in done && done.totalCostCents).toBe(25)
  })

  it('falls back to SDK sum when getBalanceCents is not provided', async () => {
    const chat = fakeChat((args) => {
      const isSynth = isSynthesisRequest(args.messages)
      const isDeb = !isSynth && isDebateRequest(args.messages)
      const content = isSynth ? 'final\n===COUNCIL_REASONING===\nbecause' : isDeb ? 'd' : 'dr'
      return singleChunk(content, 1)
    })
    const events = await collect(
      runCouncilChat({ chat }, { config: COUNCIL_PLANS.lite, userTask: 't' }),
    )
    const done = events.find((e) => e.kind === 'council_done')
    // Lite default: 3 drafts + 2*3 debates + 1 synth = 10 calls × 1 cent
    expect(done && 'totalCostCents' in done && done.totalCostCents).toBe(10)
  })

  it('falls back to SDK sum if the balance probe throws', async () => {
    const chat = fakeChat((args) => {
      const isSynth = isSynthesisRequest(args.messages)
      const isDeb = !isSynth && isDebateRequest(args.messages)
      const content = isSynth ? 'f\n===COUNCIL_REASONING===\nx' : isDeb ? 'd' : 'dr'
      return singleChunk(content, 1)
    })
    const getBalanceCents = async () => {
      throw new Error('network down')
    }
    const events = await collect(
      runCouncilChat({ chat, getBalanceCents }, { config: COUNCIL_PLANS.lite, userTask: 't' }),
    )
    const done = events.find((e) => e.kind === 'council_done')
    expect(done && 'totalCostCents' in done && done.totalCostCents).toBe(10)
  })
})

describe('runCouncilChat — tools branch', () => {
  it('with tools.stages=[] does NOT enter the tools branch', async () => {
    // baseline: plan lite has tools.stages=[]. The existing happy path already covers this.
    const chat = fakeChat((args) => {
      const isSynth = isSynthesisRequest(args.messages)
      const isDeb = !isSynth && isDebateRequest(args.messages)
      return singleChunk(isSynth ? 'final' : isDeb ? 'debate' : 'draft')
    })
    const events = await collect(
      runCouncilChat({ chat }, { config: COUNCIL_PLANS.lite, userTask: 't' }),
    )
    expect(events.some((e) => e.kind === 'draft_tool_call')).toBe(false)
    expect(events.some((e) => e.kind === 'debate_tool_call')).toBe(false)
  })
})

describe('runCouncilChat — empty-content cost guard', () => {
  it('reclassifies a drafter with empty content as draft_failed and still bills the cost', async () => {
    let n = 0
    const chat = fakeChat((args) => {
      const isSynth = isSynthesisRequest(args.messages)
      const isDeb = !isSynth && isDebateRequest(args.messages)
      if (isSynth) return singleChunk('final', 0)
      if (isDeb) return singleChunk('debate', 1)
      // Draft stage: first drafter is empty (cost 5), the other two are fine.
      n += 1
      return n === 1 ? singleChunk('', 5) : singleChunk('good draft', 1)
    })

    const events = await collect(
      runCouncilChat({ chat }, { config: COUNCIL_PLANS.lite, userTask: 't' }),
    )

    const draftFailed = events.filter((e) => e.kind === 'draft_failed')
    const draftDone = events.filter((e) => e.kind === 'draft_done')
    const councilDone = events.find((e) => e.kind === 'council_done')
    expect(draftFailed).toHaveLength(1)
    expect(draftDone).toHaveLength(2)
    // The validation issue carries the empty-content reason.
    const failed = draftFailed[0]!
    expect(failed.kind === 'draft_failed' && failed.error.kind === 'validation').toBe(true)
    // The 5¢ spent by the empty drafter is billed in the council total.
    expect(councilDone?.kind === 'council_done' && councilDone.totalCostCents >= 5).toBe(true)
  })

  it('aborts with council_failed when ALL drafters return empty content, billing partial cost', async () => {
    const chat = fakeChat((args) => {
      const isSynth = isSynthesisRequest(args.messages)
      const isDeb = !isSynth && isDebateRequest(args.messages)
      if (isSynth) return singleChunk('never reached', 0)
      if (isDeb) return singleChunk('never reached', 0)
      return singleChunk('', 7) // every drafter returns empty, billed 7¢ each
    })

    const events = await collect(
      runCouncilChat({ chat }, { config: COUNCIL_PLANS.lite, userTask: 't' }),
    )

    const councilFailed = events.find((e) => e.kind === 'council_failed')
    const councilDone = events.find((e) => e.kind === 'council_done')
    expect(councilDone).toBeUndefined()
    expect(councilFailed).toBeDefined()
    // 3 drafters × 7¢ = 21¢ billed before the MIN_LIVE_DRAFTS guard trips.
    expect(
      councilFailed?.kind === 'council_failed' && councilFailed.partialCostCents >= 21,
    ).toBe(true)
    // No debate or synthesis events should be emitted.
    expect(events.some((e) => e.kind === 'debate_started')).toBe(false)
    expect(events.some((e) => e.kind === 'synthesis_started')).toBe(false)
  })

  it('regression: a debater with empty content emits debate_failed but does NOT abort the run', async () => {
    let debateCount = 0
    const chat = fakeChat((args) => {
      const isSynth = isSynthesisRequest(args.messages)
      const isDeb = !isSynth && isDebateRequest(args.messages)
      if (isSynth) return singleChunk('final', 0)
      if (isDeb) {
        debateCount += 1
        // First debater of round 1 returns empty; others fine. Run must continue.
        return debateCount === 1 ? singleChunk('', 3) : singleChunk('rebuttal', 1)
      }
      return singleChunk('draft', 1)
    })

    const events = await collect(
      runCouncilChat({ chat }, { config: COUNCIL_PLANS.lite, userTask: 't' }),
    )

    const debateFailed = events.filter((e) => e.kind === 'debate_failed')
    expect(debateFailed.length).toBeGreaterThanOrEqual(1)
    const empty = debateFailed.find(
      (e) => e.kind === 'debate_failed' && e.error.kind === 'validation',
    )
    expect(empty).toBeDefined()
    expect(events.find((e) => e.kind === 'council_done')).toBeDefined()
  })
})

describe('splitChairmanOutput', () => {
  it('returns full text as answer and null reasoning when marker is missing', () => {
    const r = splitChairmanOutput('Just an answer with no marker.')
    expect(r.answer).toBe('Just an answer with no marker.')
    expect(r.reasoning).toBeNull()
  })

  it('splits answer and reasoning around the marker', () => {
    const raw = 'The capital is Lima.\n\n===COUNCIL_REASONING===\n\nDrafter A and C agreed; B was off-topic.'
    const r = splitChairmanOutput(raw)
    expect(r.answer).toBe('The capital is Lima.')
    expect(r.reasoning).toBe('Drafter A and C agreed; B was off-topic.')
  })

  it('returns null reasoning when marker is present but reasoning section is empty', () => {
    const r = splitChairmanOutput('The answer.\n===COUNCIL_REASONING===\n   ')
    expect(r.answer).toBe('The answer.')
    expect(r.reasoning).toBeNull()
  })
})
