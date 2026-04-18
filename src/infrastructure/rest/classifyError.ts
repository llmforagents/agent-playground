import type { RestError, ZodLikeIssue } from '@/domain/errors'

export function classifyHttpError(
  status: number,
  body: unknown,
  headers: Readonly<Record<string, string>>,
): RestError {
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
  if (status >= 500) return { kind: 'upstream_error', status, body }
  return { kind: 'upstream_error', status, body }
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
