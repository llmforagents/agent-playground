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

export const EXTENDED_TOOLS = [
  'ai_summarize', 'ai_translate', 'ai_embed', 'ai_classify', 'ai_moderate', 'ai_rerank',
  'image_to_text', 'speech_to_text',
  'send_telegram', 'send_discord', 'send_slack', 'webhook_post', 'send_email', 'send_sms',
  'dns_lookup', 'ip_geolocate', 'url_unfurl', 'rss_parse', 'youtube_transcript', 'whois',
  'crypto_price', 'fx_convert', 'qr_generate', 'captcha_solve_create', 'captcha_solve_result',
  'vector_upsert', 'vector_query', 'vector_delete',
  'web_crawl',
  'memory_set', 'memory_get', 'memory_list', 'memory_delete',
  'token_balance', 'tx_status', 'nft_metadata', 'ens_resolve',
  'pdf_parse', 'doc_extract', 'article_extract',
] as const
export type ExtendedTool = (typeof EXTENDED_TOOLS)[number]

export type McpToolName = OneShotTool | SessionTool | SearchTool | ImageTool | ExtendedTool

export type McpSession = Readonly<{
  id: SessionId
  createdAt: Date
  proxyTier: ProxyTier
  initialUrl?: string
  lastActionAt?: Date
}>
