import { LLM4AgentsError } from '@llmforagents/sdk'
import { Err, Ok, type Result } from '@/domain/result'
import type { RestError } from '@/domain/errors'

export function translateSdkError(e: unknown): RestError {
  if (e instanceof LLM4AgentsError) {
    switch (e.code) {
      case 'auth_error':
        return { kind: 'unauthorized' }
      case 'insufficient_balance':
        return { kind: 'insufficient_balance' }
      case 'rate_limited':
        // The SDK doesn't expose retry-after; fall back to 1s — matches the
        // default in classifyHttpError when the header is missing.
        return { kind: 'rate_limited', retryAfterMs: 1000 }
      case 'timeout':
        return { kind: 'timeout', endpoint: 'sdk' }
      case 'network_error':
        return { kind: 'network' }
      default:
        return { kind: 'upstream_error', status: e.statusCode ?? 500, body: e.message }
    }
  }
  if (e instanceof Error) {
    if (e.name === 'AbortError') return { kind: 'timeout', endpoint: 'sdk' }
    return {
      kind: 'unknown',
      message: `${e.name}: ${e.message}`,
      raw: { name: e.name, message: e.message, stack: e.stack },
    }
  }
  let message: string
  try { message = typeof e === 'string' ? e : JSON.stringify(e) } catch { message = String(e) }
  return { kind: 'unknown', message: message || 'SDK call failed', raw: e }
}

export async function callSdk<T>(fn: () => Promise<T>): Promise<Result<T, RestError>> {
  try {
    return Ok(await fn())
  } catch (e) {
    return Err(translateSdkError(e))
  }
}
