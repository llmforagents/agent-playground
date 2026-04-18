import { describe, expect, it } from 'vitest'
import { parseSseStream } from '@/infrastructure/stream/sseParser'

function streamFromChunks(chunks: readonly string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder()
  let i = 0
  return new ReadableStream({
    pull(controller) {
      if (i >= chunks.length) { controller.close(); return }
      const chunk = chunks[i]
      i += 1
      if (chunk !== undefined) controller.enqueue(enc.encode(chunk))
    },
  })
}

describe('parseSseStream', () => {
  it('emits one event per data line', async () => {
    const stream = streamFromChunks([
      'data: {"a":1}\n\n',
      'data: {"a":2}\n\n',
    ])
    const events: string[] = []
    for await (const ev of parseSseStream(stream)) {
      events.push(ev.data)
    }
    expect(events).toEqual(['{"a":1}', '{"a":2}'])
  })

  it('handles chunk splits mid-event', async () => {
    const stream = streamFromChunks([
      'data: {"a"',
      ':1}\n\n',
    ])
    const events: string[] = []
    for await (const ev of parseSseStream(stream)) {
      events.push(ev.data)
    }
    expect(events).toEqual(['{"a":1}'])
  })

  it('stops at [DONE] sentinel', async () => {
    const stream = streamFromChunks([
      'data: {"a":1}\n\n',
      'data: [DONE]\n\n',
    ])
    const events: string[] = []
    for await (const ev of parseSseStream(stream)) {
      if (ev.data === '[DONE]') break
      events.push(ev.data)
    }
    expect(events).toEqual(['{"a":1}'])
  })
})
