import { describe, it, expect } from 'vitest'
import { normalizeMcpResult } from '@/infrastructure/mcp/McpClient'

describe('normalizeMcpResult', () => {
  it('promotes a text content whose JSON carries imageBase64 to an image item', () => {
    const raw = {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            imageBase64: 'BASE64PNGDATA',
            width: 512,
            height: 512,
            costCents: 1,
          }),
        },
      ],
    }
    const out = normalizeMcpResult(raw) as { content: { type: string; data: string; mimeType: string }[] }
    expect(out.content[0]?.type).toBe('image')
    expect(out.content[0]?.data).toBe('BASE64PNGDATA')
    expect(out.content[0]?.mimeType).toBe('image/png')
  })

  it('accepts snake_case image_base64 and mime_type', () => {
    const raw = {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            image_base64: 'ABCD',
            mime_type: 'image/jpeg',
          }),
        },
      ],
    }
    const out = normalizeMcpResult(raw) as { content: { type: string; data: string; mimeType: string }[] }
    expect(out.content[0]?.type).toBe('image')
    expect(out.content[0]?.data).toBe('ABCD')
    expect(out.content[0]?.mimeType).toBe('image/jpeg')
  })

  it('leaves plain text responses untouched (e.g. error messages)', () => {
    const raw = {
      content: [{ type: 'text', text: 'A red dot on white background.' }],
    }
    const out = normalizeMcpResult(raw) as { content: { type: string; text: string }[] }
    expect(out.content[0]?.type).toBe('text')
    expect(out.content[0]?.text).toBe('A red dot on white background.')
  })

  it('unwraps the text field from a JSON-wrapped text response (analyze_image pattern)', () => {
    const raw = {
      content: [{
        type: 'text',
        text: JSON.stringify({ text: 'A black puppy sitting on wooden planks.', costCents: 0.6 }),
      }],
    }
    const out = normalizeMcpResult(raw) as { content: { type: string; text: string }[] }
    expect(out.content[0]?.type).toBe('text')
    expect(out.content[0]?.text).toBe('A black puppy sitting on wooden planks.')
  })

  it('leaves native image responses untouched', () => {
    const raw = {
      content: [{ type: 'image', data: 'PNG', mimeType: 'image/png' }],
    }
    const out = normalizeMcpResult(raw) as { content: { type: string; data: string; mimeType: string }[] }
    expect(out.content[0]?.type).toBe('image')
    expect(out.content[0]?.data).toBe('PNG')
  })

  it('coerces mime_type → mimeType on native image shape', () => {
    const raw = {
      content: [{ type: 'image', data: 'PNG', mime_type: 'image/png' }],
    }
    const out = normalizeMcpResult(raw) as { content: { type: string; mimeType: string }[] }
    expect(out.content[0]?.mimeType).toBe('image/png')
  })

  it('does not confuse a plain JSON text without imageBase64', () => {
    const raw = {
      content: [{ type: 'text', text: JSON.stringify({ ok: true, n: 1 }) }],
    }
    const out = normalizeMcpResult(raw) as { content: { type: string }[] }
    expect(out.content[0]?.type).toBe('text')
  })

  it('is a no-op on non-object input', () => {
    expect(normalizeMcpResult(null)).toBe(null)
    expect(normalizeMcpResult(42)).toBe(42)
    expect(normalizeMcpResult('hi')).toBe('hi')
  })

  it('is a no-op when content is missing or not an array', () => {
    expect(normalizeMcpResult({})).toEqual({})
    expect(normalizeMcpResult({ content: 'nope' })).toEqual({ content: 'nope' })
  })
})
