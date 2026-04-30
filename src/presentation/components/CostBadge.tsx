import type { ChatResponseMeta } from '@/application/ports'
import { useT } from '@/presentation/hooks/useT'

const SEP = ' · '

function fmtNum(n: number): string {
  return n.toLocaleString('en-US')
}

export function CostBadge({ meta }: { meta: ChatResponseMeta | undefined }): React.JSX.Element | null {
  const t = useT()
  if (!meta) return null

  const parts: React.ReactNode[] = []

  if (meta.costCents !== undefined) {
    parts.push(
      <span key="cost" className="font-medium text-foreground tabular-nums">
        ${(meta.costCents / 100).toFixed(4)}
      </span>
    )
  }
  if (meta.tokensInput !== undefined) {
    parts.push(
      <span key="in">
        in: <span className="font-medium text-foreground tabular-nums">{fmtNum(meta.tokensInput)}</span>
      </span>
    )
  }
  if (meta.tokensOutput !== undefined) {
    parts.push(
      <span key="out">
        out: <span className="font-medium text-foreground tabular-nums">{fmtNum(meta.tokensOutput)}</span>
      </span>
    )
  }
  if (meta.balanceRemainingCents !== undefined) {
    parts.push(
      <span key="remaining">
        remaining:{' '}
        <span className="font-medium text-emerald-600 dark:text-emerald-400 tabular-nums">
          ${(meta.balanceRemainingCents / 100).toFixed(2)}
        </span>
      </span>
    )
  }
  if (meta.reasoningTokens && meta.reasoningTokens > 0) {
    parts.push(
      <span
        key="thinking"
        className="text-amber-600 dark:text-amber-400"
        title="Reasoning tokens (included in completion_tokens, billed at the model's output price)"
      >
        {t('chat.cost.reasoningTokens', { n: meta.reasoningTokens })}
      </span>
    )
  }

  return (
    <div className="text-xs text-muted-foreground whitespace-nowrap">
      {parts.reduce<React.ReactNode[]>((acc, node, i) => {
        if (i > 0) acc.push(<span key={`sep-${i}`}>{SEP}</span>)
        acc.push(node)
        return acc
      }, [])}
    </div>
  )
}
