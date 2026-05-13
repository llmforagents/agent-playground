import { describe, it, expect, vi } from 'vitest'
import { Model, ApiKey } from '@/domain/branded'
import { runDrafterTurnWithTools } from '@/application/runCouncilTurn'

// We mock the SDK module so the helper doesn't try to instantiate a real client.
// The mock factory returns a `sdk` whose `chat.conversation(opts).stream(msg)` is a
// configurable async iterable. Tests assign `mockStream` and `mockTools` per case.
let mockStream: AsyncIterable<unknown> = (async function* () {})()
let onToolCallCaptured: ((name: string, args: object) => boolean | Promise<boolean>) | undefined

vi.mock('@/infrastructure/sdk/sdkClient', () => ({
  createSdkClient: () => ({
    tools: {},
    chat: {
      conversation: (opts: { onToolCall?: typeof onToolCallCaptured }) => {
        onToolCallCaptured = opts.onToolCall
        return {
          stream: () => mockStream,
        }
      },
    },
  }),
}))

const baseDeps = { key: 'k_test' as unknown as ApiKey }
const baseParams = {
  model: 'gpt-x' as unknown as Model,
  systemPrompt: 'sys',
  history: [],
  userMessage: 'hello',
  allowedTools: ['google_search'] as const,
  maxToolCalls: 3,
}

describe('runDrafterTurnWithTools', () => {
  it('yields delta → tool_call → tool_result → delta and returns final content', async () => {
    mockStream = (async function* () {
      yield { type: 'text', content: 'hi ' }
      yield {
        type: 'tool_start',
        name: 'google_search',
        args: { q: 'foo' },
      }
      yield {
        type: 'tool_end',
        name: 'google_search',
        result: { content: [{ type: 'text', text: '3 results' }], isError: false },
        durationMs: 100,
      }
      yield { type: 'text', content: 'there' }
      yield {
        type: 'done',
        response: { content: 'hi there', toolCalls: [], usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 } },
      }
    })()

    const events: unknown[] = []
    const gen = runDrafterTurnWithTools(baseDeps, baseParams)
    let finalResult: { content: string; costCents: number } | undefined
    for (;;) {
      const r = await gen.next()
      if (r.done) {
        finalResult = r.value
        break
      }
      events.push(r.value)
    }

    expect(events.map((e) => (e as { kind: string }).kind)).toEqual([
      'delta',
      'tool_call',
      'tool_result',
      'delta',
    ])
    expect(finalResult?.content).toBe('hi there')
  })

  it('onToolCall rejects tools outside the allowed whitelist', async () => {
    mockStream = (async function* () {
      yield { type: 'done', response: { content: '', toolCalls: [], usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 } } }
    })()
    const gen = runDrafterTurnWithTools(baseDeps, baseParams)
    for await (const _ev of gen) { /* drain */ }

    // After the run, the captured onToolCall must reject tools not in allowed list.
    expect(onToolCallCaptured).toBeDefined()
    expect(await onToolCallCaptured!('generate_image', {})).toBe(false)
    expect(await onToolCallCaptured!('google_search', {})).toBe(true)
  })

  it('onToolCall rejects after maxToolCalls is reached', async () => {
    mockStream = (async function* () {
      yield { type: 'done', response: { content: '', toolCalls: [], usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 } } }
    })()
    const gen = runDrafterTurnWithTools(baseDeps, { ...baseParams, maxToolCalls: 2 })
    for await (const _ev of gen) { /* drain */ }

    expect(await onToolCallCaptured!('google_search', {})).toBe(true)  // 1
    expect(await onToolCallCaptured!('google_search', {})).toBe(true)  // 2
    expect(await onToolCallCaptured!('google_search', {})).toBe(false) // 3 → blocked
  })

  it('emits tool_result with ok=false when the tool returns isError:true', async () => {
    mockStream = (async function* () {
      yield {
        type: 'tool_start',
        name: 'google_search',
        args: { q: 'foo' },
      }
      yield {
        type: 'tool_end',
        name: 'google_search',
        result: { content: [{ type: 'text', text: 'service down' }], isError: true },
        durationMs: 50,
      }
      yield { type: 'done', response: { content: 'sorry', toolCalls: [], usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 } } }
    })()
    const events: unknown[] = []
    const gen = runDrafterTurnWithTools(baseDeps, baseParams)
    for await (const ev of gen) events.push(ev)

    const result = events.find((e) => (e as { kind: string }).kind === 'tool_result') as { ok: boolean; summary: string }
    expect(result.ok).toBe(false)
    expect(result.summary).toContain('service down')
  })

  it('correlates tool_call and tool_result via the same callId', async () => {
    mockStream = (async function* () {
      yield { type: 'tool_start', name: 'google_search', args: {} }
      yield { type: 'tool_end', name: 'google_search', result: { content: [{ type: 'text', text: 'r' }], isError: false }, durationMs: 1 }
      yield { type: 'done', response: { content: '', toolCalls: [], usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 } } }
    })()
    const events: { kind: string; callId?: string }[] = []
    for await (const ev of runDrafterTurnWithTools(baseDeps, baseParams)) {
      events.push(ev as { kind: string; callId?: string })
    }
    const callEv = events.find((e) => e.kind === 'tool_call')!
    const resultEv = events.find((e) => e.kind === 'tool_result')!
    expect(callEv.callId).toBeDefined()
    expect(callEv.callId).toBe(resultEv.callId)
  })
})
