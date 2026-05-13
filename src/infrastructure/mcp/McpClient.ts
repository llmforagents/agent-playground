import { Err, Ok, type Result } from '@/domain/result'
import type { McpError, ZodLikeIssue } from '@/domain/errors'
import type { ApiKey } from '@/domain/branded'
import type { McpToolName } from '@/domain/scraper'
import { McpToolResultSchema, type McpToolResult } from '@/infrastructure/schemas/mcp'
import { classifyHttpError } from '@/infrastructure/rest/classifyError'
import type { McpPort } from '@/application/ports'

type JsonRpcRequest = Readonly<{
  jsonrpc: '2.0'
  id: number
  method: string
  params: unknown
}>

type JsonRpcResponse =
  | { readonly jsonrpc: '2.0'; readonly id: number; readonly result: unknown }
  | { readonly jsonrpc: '2.0'; readonly id: number; readonly error: { code: number; message: string; data?: unknown } }

// 90s (vs 60s for REST) gives headroom for browser-driven scraper tools
// (screenshot, pdf, session_exec) that load and render full pages upstream.
const DEFAULT_TIMEOUT_MS = 90_000

function zodIssuesToZodLike(
  issues: readonly { readonly path: readonly PropertyKey[]; readonly message: string }[],
): readonly ZodLikeIssue[] {
  return issues.map(i => ({
    path: i.path.filter((p): p is string | number =>
      typeof p === 'string' || typeof p === 'number'),
    message: i.message,
  }))
}

export class McpClient implements McpPort {
  private requestId = 0
  private readonly endpoint: string
  constructor(mcpBase: string) {
    // The MCP JSON-RPC endpoint lives at /mcp. Accept either form as base.
    const trimmed = mcpBase.replace(/\/+$/, '')
    this.endpoint = trimmed.endsWith('/mcp') ? trimmed : `${trimmed}/mcp`
  }

  async callTool(
    key: ApiKey, tool: McpToolName, params: unknown, signal?: AbortSignal,
  ): Promise<Result<McpToolResult, McpError>> {
    this.requestId += 1
    const body: JsonRpcRequest = {
      jsonrpc: '2.0',
      id: this.requestId,
      method: 'tools/call',
      params: { name: tool, arguments: params },
    }
    const localController = new AbortController()
    const timer = setTimeout(() => localController.abort(), DEFAULT_TIMEOUT_MS)
    const combined = signal ? anySignal([signal, localController.signal]) : localController.signal
    try {
      const response = await fetch(this.endpoint, {
        method: 'POST',
        signal: combined,
        headers: {
          'content-type': 'application/json',
          accept: 'application/json, text/event-stream',
          authorization: `Bearer ${key}`,
        },
        body: JSON.stringify(body),
      })
      if (!response.ok) {
        const headersObj: Record<string, string> = {}
        response.headers.forEach((v, k) => { headersObj[k.toLowerCase()] = v })
        const text = await response.text()
        let parsedBody: unknown = null
        try { parsedBody = JSON.parse(text) } catch { parsedBody = text }
        return Err(classifyHttpError(response.status, parsedBody, headersObj))
      }
      const json = await response.json() as JsonRpcResponse
      if ('error' in json) {
        return Err({ kind: 'jsonrpc_error', code: json.error.code, message: json.error.message })
      }
      const normalized = normalizeMcpResult(json.result)
      // eslint-disable-next-line no-console
      console.debug('[mcp] ← tools/call', { tool, contentTypes: describeContent(normalized) })
      const parsed = McpToolResultSchema.safeParse(normalized)
      if (!parsed.success) {
        // eslint-disable-next-line no-console
        console.debug('[mcp] validation failed', { issues: parsed.error.issues, raw: normalized })
        return Err({ kind: 'validation', issues: zodIssuesToZodLike(parsed.error.issues) })
      }
      // MCP servers signal per-tool failures with isError:true + a text item
      // explaining what went wrong, even though the HTTP call and JSON-RPC
      // envelope are both 200/OK. Surface that as a normal tool failure so
      // the cost guards trigger and the user sees the error.
      if (parsed.data.isError) {
        const first = parsed.data.content[0]
        const msg = first?.type === 'text' ? first.text : 'Tool reported an error'
        return Err({ kind: 'upstream_error', status: 502, body: msg })
      }
      return Ok(parsed.data)
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') {
        return Err({ kind: 'timeout', endpoint: this.endpoint })
      }
      return Err({ kind: 'network' })
    } finally {
      clearTimeout(timer)
    }
  }
}

export function normalizeMcpResult(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object') return raw
  const r = raw as Record<string, unknown>
  const content = r['content']
  if (!Array.isArray(content)) return raw
  const normalizedContent = content.map((item) => {
    if (!item || typeof item !== 'object') return item
    const copy = { ...(item as Record<string, unknown>) }
    // Accept snake_case mime_type as an alias for mimeType.
    if (copy['mime_type'] !== undefined && copy['mimeType'] === undefined) {
      copy['mimeType'] = copy['mime_type']
    }
    // Some servers nest the image under "image" instead of inline.
    if (copy['type'] === 'image' && typeof copy['data'] !== 'string' && typeof copy['image'] === 'string') {
      copy['data'] = copy['image']
    }
    // llm4agents image tools return a text content whose string IS a JSON
    // object carrying `imageBase64`. Promote those items to the standard
    // { type: 'image', data, mimeType } shape so downstream rendering works.
    if (copy['type'] === 'text' && typeof copy['text'] === 'string') {
      const parsed = tryParseJson(copy['text'])
      if (parsed && typeof parsed === 'object') {
        const obj = parsed as Record<string, unknown>
        const b64 = typeof obj['imageBase64'] === 'string'
          ? obj['imageBase64']
          : typeof obj['image_base64'] === 'string'
            ? obj['image_base64']
            : null
        if (b64) {
          const declared = typeof obj['mimeType'] === 'string'
            ? obj['mimeType']
            : typeof obj['mime_type'] === 'string'
              ? obj['mime_type']
              : null
          return {
            type: 'image',
            data: b64,
            mimeType: declared ?? sniffImageMime(b64),
          }
        }
        // The scraper screenshot tool wraps its PNG as { pngBase64, ... }.
        if (typeof obj['pngBase64'] === 'string') {
          return { type: 'image', data: obj['pngBase64'], mimeType: 'image/png' }
        }
        // The scraper pdf tool wraps its PDF as { pdfBase64, ... }. Convert
        // to the MCP "resource" variant so the ScraperOneShot preview can
        // render it via an iframe data URI.
        if (typeof obj['pdfBase64'] === 'string') {
          return {
            type: 'resource',
            resource: {
              uri: 'inline://pdf',
              mimeType: 'application/pdf',
              blob: obj['pdfBase64'],
            },
          }
        }
        // analyze_image and friends wrap the answer as
        // { "text": "...actual answer...", "costCents": n }. Unwrap so the
        // user sees the answer, not the JSON stringification.
        if (typeof obj['text'] === 'string') {
          return { type: 'text', text: obj['text'] }
        }
      }
    }
    return copy
  })
  return { ...r, content: normalizedContent }
}

function tryParseJson(s: string): unknown {
  try { return JSON.parse(s) } catch { return null }
}

/**
 * Detect an image mime type from the first bytes of a base64 payload.
 * The servers we call don't always tag images with a mimeType, so we sniff
 * magic bytes from the base64 prefix.
 */
function sniffImageMime(b64: string): string {
  const prefix = b64.slice(0, 16)
  if (prefix.startsWith('iVBORw0KGgo')) return 'image/png'
  if (prefix.startsWith('/9j/')) return 'image/jpeg'
  if (prefix.startsWith('R0lGOD')) return 'image/gif'
  if (prefix.startsWith('UklGR')) return 'image/webp'
  return 'image/png'
}

function describeContent(raw: unknown): readonly string[] {
  if (!raw || typeof raw !== 'object') return []
  const content = (raw as { content?: unknown }).content
  if (!Array.isArray(content)) return []
  return content.map((c) => {
    if (c && typeof c === 'object') {
      const o = c as Record<string, unknown>
      if (o['type'] === 'image') return `image:${o['mimeType'] ?? '?'}`
      if (o['type'] === 'text') {
        const text = typeof o['text'] === 'string' ? o['text'] : ''
        return `text:${text.length}chars`
      }
      return String(o['type'] ?? 'unknown')
    }
    return 'unknown'
  })
}

function anySignal(signals: readonly AbortSignal[]): AbortSignal {
  const controller = new AbortController()
  for (const s of signals) {
    if (s.aborted) { controller.abort(); return controller.signal }
    s.addEventListener('abort', () => controller.abort(), { once: true })
  }
  return controller.signal
}
