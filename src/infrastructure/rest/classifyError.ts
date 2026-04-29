import type { RestError, ZodLikeIssue, ClaimErrorKind } from '@/domain/errors'

const CLAIM_CODES: ReadonlySet<ClaimErrorKind> = new Set([
  'validation_error',
  'turnstile_failed',
  'github_oauth_failed',
  'agent_not_found',
  'agent_inactive',
  'already_claimed',
  'provider_error',
  'rate_limited',
])

export function classifyHttpError(
  status: number,
  body: unknown,
  headers: Readonly<Record<string, string>>,
): RestError {
  const claim = tryClassifyClaim(body)
  if (claim) {
    if (claim.code === 'rate_limited') {
      const retryAfterMs = pickRetryAfterMs(headers, claim.retryAfterSeconds)
      return { kind: 'rate_limited', retryAfterMs }
    }
    return { kind: 'claim_failed', ...claim }
  }
  if (status === 401) return { kind: 'unauthorized' }
  if (status === 402) return { kind: 'insufficient_balance' }
  if (status === 429) {
    const retryAfter = headers['retry-after']
    const seconds = retryAfter ? Number(retryAfter) : NaN
    const retryAfterMs = Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 1000
    return { kind: 'rate_limited', retryAfterMs }
  }
  if (status === 422) {
    const issues: readonly ZodLikeIssue[] = extractIssues(body)
    return { kind: 'validation', issues }
  }
  return { kind: 'upstream_error', status, body }
}

type ClaimErrorBits = Readonly<{
  code: ClaimErrorKind
  message: string
  requestId?: string
  retryAfterSeconds?: number
}>

function tryClassifyClaim(body: unknown): ClaimErrorBits | undefined {
  if (!body || typeof body !== 'object') return undefined
  const b = body as Record<string, unknown>
  const code = typeof b['error'] === 'string' ? b['error'] : undefined
  if (!code || !CLAIM_CODES.has(code as ClaimErrorKind)) return undefined
  const message = typeof b['message'] === 'string' ? b['message'] : code
  const requestId = typeof b['requestId'] === 'string' ? b['requestId'] : undefined
  const details = typeof b['details'] === 'object' && b['details'] !== null
    ? (b['details'] as Record<string, unknown>)
    : undefined
  const retryRaw = details?.['retry_after_seconds']
  const retryAfterSeconds = typeof retryRaw === 'number' && retryRaw > 0 ? retryRaw : undefined
  const out: ClaimErrorBits = {
    code: code as ClaimErrorKind,
    message,
    ...(requestId !== undefined ? { requestId } : {}),
    ...(retryAfterSeconds !== undefined ? { retryAfterSeconds } : {}),
  }
  return out
}

function pickRetryAfterMs(
  headers: Readonly<Record<string, string>>,
  fromBody: number | undefined,
): number {
  if (fromBody && fromBody > 0) return fromBody * 1000
  const h = headers['retry-after']
  const n = h ? Number(h) : NaN
  return Number.isFinite(n) && n > 0 ? n * 1000 : 1000
}

function extractIssues(body: unknown): readonly ZodLikeIssue[] {
  if (body && typeof body === 'object' && 'issues' in body) {
    const raw = (body as { issues: unknown }).issues
    if (Array.isArray(raw)) {
      return raw
        .filter((i): i is { path: (string | number)[]; message: string } =>
          i !== null && typeof i === 'object' && 'message' in i && 'path' in i)
        .map(i => ({ path: i.path, message: i.message }))
    }
  }
  return []
}
