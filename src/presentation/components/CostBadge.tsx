import type { ChatResponseMeta } from '@/application/ports'

export function CostBadge({ meta }: { meta: ChatResponseMeta | undefined }) {
  if (!meta) return null
  const parts: string[] = []
  if (meta.costCents !== undefined) parts.push(`$${(meta.costCents / 100).toFixed(4)}`)
  if (meta.tokensInput !== undefined) parts.push(`in: ${meta.tokensInput}`)
  if (meta.tokensOutput !== undefined) parts.push(`out: ${meta.tokensOutput}`)
  if (meta.balanceRemainingCents !== undefined)
    parts.push(`remaining: $${(meta.balanceRemainingCents / 100).toFixed(2)}`)
  return <div className="text-xs text-muted-foreground">{parts.join(' • ')}</div>
}
