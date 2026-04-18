import { describe, expect, it } from 'vitest'
import {
  FetchHtmlParamsSchema, MarkdownParamsSchema, LinksParamsSchema,
  ScreenshotParamsSchema, PdfParamsSchema, ExtractParamsSchema,
  SessionCreateParamsSchema, SessionExecParamsSchema,
  SessionCloseParamsSchema, SessionStatusParamsSchema,
  McpToolResultSchema,
} from '@/infrastructure/schemas/mcp'

describe('MCP schemas', () => {
  it('fetch_html requires url + proxy_tier', () => {
    expect(FetchHtmlParamsSchema.parse({ url: 'https://a.com', proxy_tier: 'none' })).toBeDefined()
    expect(() => FetchHtmlParamsSchema.parse({ url: 'https://a.com' })).toThrow()
  })
  it('markdown optional selector', () => {
    expect(MarkdownParamsSchema.parse({ url: 'https://a.com', proxy_tier: 'datacenter' }).selector).toBeUndefined()
    expect(MarkdownParamsSchema.parse({ url: 'https://a.com', proxy_tier: 'datacenter', selector: '#main' }).selector).toBe('#main')
  })
  it('links same_origin_only is optional bool', () => {
    expect(LinksParamsSchema.parse({ url: 'https://a.com', proxy_tier: 'residential', same_origin_only: true })).toBeDefined()
  })
  it('screenshot viewport bounds enforced', () => {
    expect(() => ScreenshotParamsSchema.parse({
      url: 'https://a.com', proxy_tier: 'none', viewport: { width: 100, height: 100 },
    })).toThrow()
  })
  it('pdf format enum', () => {
    expect(PdfParamsSchema.parse({ url: 'https://a.com', proxy_tier: 'none', format: 'A4' }).format).toBe('A4')
  })
  it('extract requires selectors map', () => {
    expect(ExtractParamsSchema.parse({
      url: 'https://a.com', proxy_tier: 'none', selectors: { title: 'h1' },
    }).selectors['title']).toBe('h1')
  })
  it('session_create requires proxy_tier', () => {
    expect(SessionCreateParamsSchema.parse({ proxy_tier: 'datacenter' })).toBeDefined()
  })
  it('session_exec requires session_id + action', () => {
    expect(SessionExecParamsSchema.parse({
      session_id: 'sess_1', action: { type: 'goto', url: 'https://a.com' },
    })).toBeDefined()
  })
  it('session_close / session_status require session_id', () => {
    expect(SessionCloseParamsSchema.parse({ session_id: 'sess_1' })).toBeDefined()
    expect(SessionStatusParamsSchema.parse({ session_id: 'sess_1' })).toBeDefined()
  })
  it('generic tool result accepts content array', () => {
    expect(McpToolResultSchema.parse({ content: [{ type: 'text', text: '<html/>' }] })).toBeDefined()
  })
})
