import type { SessionId } from './branded'

export const PROXY_TIERS = ['none', 'datacenter', 'residential'] as const
export type ProxyTier = (typeof PROXY_TIERS)[number]

export const ONE_SHOT_TOOLS = [
  'fetch_html', 'markdown', 'links', 'screenshot', 'pdf', 'extract',
] as const
export type OneShotTool = (typeof ONE_SHOT_TOOLS)[number]

export const SESSION_TOOLS = [
  'session_create', 'session_exec', 'session_close', 'session_status',
] as const
export type SessionTool = (typeof SESSION_TOOLS)[number]

export const SEARCH_TOOLS = [
  'google_search', 'google_news', 'google_maps', 'google_batch_search',
] as const
export type SearchTool = (typeof SEARCH_TOOLS)[number]

export const IMAGE_TOOLS = [
  'generate_image', 'edit_image', 'analyze_image',
] as const
export type ImageTool = (typeof IMAGE_TOOLS)[number]

export type McpToolName = OneShotTool | SessionTool | SearchTool | ImageTool

export type McpSession = Readonly<{
  id: SessionId
  createdAt: Date
  proxyTier: ProxyTier
  initialUrl?: string
  lastActionAt?: Date
}>
