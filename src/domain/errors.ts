export type ZodLikeIssue = Readonly<{
  path: readonly (string | number)[]
  message: string
}>

export type ClaimErrorKind =
  | 'validation_error'
  | 'turnstile_failed'
  | 'github_oauth_failed'
  | 'agent_not_found'
  | 'agent_inactive'
  | 'already_claimed'
  | 'provider_error'
  | 'rate_limited'

export type RestError =
  | { readonly kind: 'network' }
  | { readonly kind: 'timeout'; readonly endpoint: string }
  | { readonly kind: 'unauthorized' }
  | { readonly kind: 'insufficient_balance' }
  | { readonly kind: 'rate_limited'; readonly retryAfterMs: number }
  | { readonly kind: 'validation'; readonly issues: readonly ZodLikeIssue[] }
  | { readonly kind: 'claim_failed'; readonly code: ClaimErrorKind; readonly message: string; readonly requestId?: string; readonly retryAfterSeconds?: number }
  | { readonly kind: 'upstream_error'; readonly status: number; readonly body: unknown }
  | { readonly kind: 'unknown'; readonly message: string; readonly raw: unknown }

export type McpError =
  | { readonly kind: 'jsonrpc_error'; readonly code: number; readonly message: string }
  | { readonly kind: 'invalid_params'; readonly details: string }
  | RestError

export type AppError = RestError | McpError

export function describeError(e: AppError): string {
  switch (e.kind) {
    case 'network': return 'Network error — check your connection'
    case 'timeout': return `Request timed out at ${e.endpoint}`
    case 'unauthorized': return 'API key is invalid or expired'
    case 'insufficient_balance': return 'Insufficient balance to make this call'
    case 'rate_limited': return `Rate limited — retry in ${Math.ceil(e.retryAfterMs / 1000)}s`
    case 'validation': return `Validation failed: ${e.issues.length} issue(s)`
    case 'claim_failed': return e.message
    case 'upstream_error': return `Upstream error ${e.status}`
    case 'jsonrpc_error': return `MCP error ${e.code}: ${e.message}`
    case 'invalid_params': return `Invalid params: ${e.details}`
    case 'unknown': return `Unexpected error: ${e.message}`
  }
}

export function coerceToAppError(e: unknown): AppError {
  if (e && typeof e === 'object' && 'kind' in e && typeof (e as { kind: unknown }).kind === 'string') {
    return e as AppError
  }
  if (e instanceof Error) {
    return { kind: 'unknown', message: `${e.name}: ${e.message}`, raw: { name: e.name, message: e.message, stack: e.stack } }
  }
  let message: string
  try { message = typeof e === 'string' ? e : JSON.stringify(e) } catch { message = String(e) }
  return { kind: 'unknown', message: message || '(empty error)', raw: e }
}
