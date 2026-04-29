import type { ChatResponseMeta } from '@/application/ports'
import { useT } from '@/presentation/hooks/useT'

export function CostBadge({ meta }: { meta: ChatResponseMeta | undefined }): React.JSX.Element | null {
  const t = useT()
  if (!meta) return null
  const parts: string[] = []
  if (meta.costCents !== undefined) parts.push(`$${(meta.costCents / 100).toFixed(4)}`)
  if (meta.tokensInput !== undefined) parts.push(`in: ${meta.tokensInput}`)
  if (meta.tokensOutput !== undefined) parts.push(`out: ${meta.tokensOutput}`)
  if (meta.balanceRemainingCents !== undefined)
    parts.push(`remaining: $${(meta.balanceRemainingCents / 100).toFixed(2)}`)

  return (
    <div className="text-xs text-muted-foreground">
      {parts.join(' • ')}
      {meta?.reasoningTokens && meta.reasoningTokens > 0 ? (
        <span
          className="text-amber-600 dark:text-amber-400"
          title="Reasoning tokens (included in completion_tokens, billed at the model's output price)"
        >
          {' • '}{t('chat.cost.reasoningTokens', { n: meta.reasoningTokens })}
        </span>
      ) : null}
    </div>
  )
}
