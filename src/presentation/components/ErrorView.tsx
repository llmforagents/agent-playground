import type { AppError } from '@/domain/errors'
import { coerceToAppError, describeError } from '@/domain/errors'

export function ErrorView({ error }: { error: AppError | unknown }) {
  const safe = coerceToAppError(error)
  const msg = describeError(safe)
  const extra = 'body' in safe ? safe.body : 'raw' in safe ? safe.raw : undefined
  return (
    <div className="rounded border border-destructive/40 bg-destructive/10 text-destructive-foreground p-3 text-sm">
      <div className="font-semibold">{humanKind(safe)}</div>
      <div>{msg}</div>
      {extra !== undefined && extra !== null ? (
        <pre className="mt-2 text-xs overflow-auto">{safeStringify(extra)}</pre>
      ) : null}
    </div>
  )
}

function humanKind(e: AppError): string {
  switch (e.kind) {
    case 'network': return 'Network error'
    case 'timeout': return 'Timeout'
    case 'unauthorized': return 'Unauthorized'
    case 'insufficient_balance': return 'Insufficient balance'
    case 'rate_limited': return 'Rate limited'
    case 'validation': return 'Validation failed'
    case 'claim_failed': return 'Claim failed'
    case 'upstream_error': return 'Upstream error'
    case 'jsonrpc_error': return 'MCP JSON-RPC error'
    case 'invalid_params': return 'Invalid params'
    case 'unknown': return 'Unexpected error'
  }
}

function safeStringify(v: unknown): string {
  try { return JSON.stringify(v, null, 2) } catch { return String(v) }
}
