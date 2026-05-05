import { describe, it, expect } from 'vitest'
import { runCouncilChat, type ChatPort } from '@/application/runCouncilChat'
import { Ok, Err } from '@/domain/result'
import { DEFAULT_COUNCIL_CONFIG } from '@/domain/council'
import type { CouncilEvent } from '@/domain/councilEvents'

function fakeChat(impl: ChatPort['completion']): ChatPort {
  return { completion: impl }
}

async function collect(
  gen: AsyncGenerator<CouncilEvent, unknown, void>,
): Promise<CouncilEvent[]> {
  const out: CouncilEvent[] = []
  for await (const e of gen) out.push(e)
  return out
}

function isCritiqueRequest(messages: ReadonlyArray<{ content: string }>): boolean {
  return messages.some((m) => m.content.includes("Other drafters' answers"))
}

function isSynthesisRequest(messages: ReadonlyArray<{ content: string }>): boolean {
  return messages.some((m) => m.content.includes('Critiques:'))
}

describe('runCouncilChat', () => {
  it('happy path emits all expected events in order', async () => {
    const chat = fakeChat(async ({ messages }) => {
      const isSynth = isSynthesisRequest(messages)
      const isCrit = !isSynth && isCritiqueRequest(messages)
      const content = isSynth ? 'final' : isCrit ? 'critique' : 'draft'
      return Ok({ content, costCents: 1 })
    })

    const events = await collect(
      runCouncilChat({ chat }, { config: DEFAULT_COUNCIL_CONFIG, userTask: 't' }),
    )

    const kinds = events.map((e) => e.kind)
    expect(kinds[0]).toBe('council_started')
    expect(kinds.filter((k) => k === 'draft_done')).toHaveLength(3)
    expect(kinds.filter((k) => k === 'critique_done')).toHaveLength(3)
    expect(kinds).toContain('synthesis_done')
    expect(kinds[kinds.length - 1]).toBe('council_done')

    const done = events.find((e) => e.kind === 'council_done')
    expect(done && 'totalCostCents' in done && done.totalCostCents).toBe(7) // 3 drafts + 3 critiques + 1 synth
  })

  it('aborts when 2 of 3 drafters fail', async () => {
    let drafts = 0
    const chat = fakeChat(async ({ messages }) => {
      const isSynth = isSynthesisRequest(messages)
      const isCrit = !isSynth && isCritiqueRequest(messages)
      const isDraft = !isSynth && !isCrit
      if (isDraft) {
        drafts++
        if (drafts <= 2) {
          return Err({ kind: 'unknown', message: 'boom', raw: null })
        }
      }
      return Ok({ content: 'x', costCents: 1 })
    })

    const events = await collect(
      runCouncilChat({ chat }, { config: DEFAULT_COUNCIL_CONFIG, userTask: 't' }),
    )

    expect(events.find((e) => e.kind === 'council_failed')).toBeTruthy()
    expect(events.find((e) => e.kind === 'synthesis_done')).toBeUndefined()
  })

  it('continues when 1 of 3 drafters fails', async () => {
    let drafts = 0
    const chat = fakeChat(async ({ messages }) => {
      const isSynth = isSynthesisRequest(messages)
      const isCrit = !isSynth && isCritiqueRequest(messages)
      const isDraft = !isSynth && !isCrit
      if (isDraft) {
        drafts++
        if (drafts === 1) {
          return Err({ kind: 'unknown', message: 'boom', raw: null })
        }
      }
      return Ok({ content: 'x', costCents: 1 })
    })

    const events = await collect(
      runCouncilChat({ chat }, { config: DEFAULT_COUNCIL_CONFIG, userTask: 't' }),
    )

    expect(events.find((e) => e.kind === 'draft_failed')).toBeTruthy()
    expect(events.find((e) => e.kind === 'council_done')).toBeTruthy()
  })

  it('aborts when chairman fails with partialCostCents accumulated', async () => {
    const chat = fakeChat(async ({ messages }) => {
      if (isSynthesisRequest(messages)) {
        return Err({ kind: 'unknown', message: 'chairman blew up', raw: null })
      }
      return Ok({ content: 'x', costCents: 1 })
    })

    const events = await collect(
      runCouncilChat({ chat }, { config: DEFAULT_COUNCIL_CONFIG, userTask: 't' }),
    )

    const failed = events.find((e) => e.kind === 'council_failed')
    expect(failed).toBeTruthy()
    expect(failed && 'partialCostCents' in failed && failed.partialCostCents).toBe(6) // 3 drafts + 3 critiques, no synth
  })

  it('critique prompt does not leak the critic own slot label', async () => {
    const seenCritiqueMessages: string[] = []
    const chat = fakeChat(async ({ messages }) => {
      const userMsg = messages.find((m) => m.role === 'user')?.content ?? ''
      if (userMsg.includes("Other drafters' answers") && !userMsg.includes('Critiques:')) {
        seenCritiqueMessages.push(userMsg)
      }
      return Ok({ content: 'x', costCents: 1 })
    })

    await collect(
      runCouncilChat({ chat }, { config: DEFAULT_COUNCIL_CONFIG, userTask: 't' }),
    )

    expect(seenCritiqueMessages).toHaveLength(3)
    for (const msg of seenCritiqueMessages) {
      expect(msg).not.toMatch(/Drafter [ABC]\b/)
    }
  })
})
