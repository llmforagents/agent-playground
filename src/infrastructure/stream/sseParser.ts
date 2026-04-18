export type SseEvent = Readonly<{
  event?: string
  data: string
  id?: string
}>

export async function* parseSseStream(
  stream: ReadableStream<Uint8Array>,
): AsyncGenerator<SseEvent, void, void> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) {
        if (buffer.trim().length > 0) {
          const ev = parseEvent(buffer)
          if (ev) yield ev
        }
        return
      }
      buffer += decoder.decode(value, { stream: true })
      let sepIndex: number
      while ((sepIndex = buffer.indexOf('\n\n')) !== -1) {
        const raw = buffer.slice(0, sepIndex)
        buffer = buffer.slice(sepIndex + 2)
        const ev = parseEvent(raw)
        if (ev) yield ev
      }
    }
  } finally {
    reader.releaseLock()
  }
}

function parseEvent(raw: string): SseEvent | null {
  const lines = raw.split('\n')
  let event: string | undefined
  let id: string | undefined
  const dataLines: string[] = []
  for (const line of lines) {
    if (line.startsWith(':')) continue
    const colon = line.indexOf(':')
    const field = colon === -1 ? line : line.slice(0, colon)
    const value = colon === -1 ? '' : line.slice(colon + 1).replace(/^ /, '')
    if (field === 'data') dataLines.push(value)
    else if (field === 'event') event = value
    else if (field === 'id') id = value
  }
  if (dataLines.length === 0) return null
  const data = dataLines.join('\n')
  const ev: { event?: string; data: string; id?: string } = { data }
  if (event !== undefined) ev.event = event
  if (id !== undefined) ev.id = id
  return ev
}
