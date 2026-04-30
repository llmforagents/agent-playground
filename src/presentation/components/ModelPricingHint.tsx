import type { ModelInfo } from '@/infrastructure/schemas/rest'

const SEP = ' · '

function fmtPrice(p: number): string {
  if (!Number.isFinite(p) || p <= 0) return '—'
  return p < 1 ? `$${p.toFixed(2)}` : `$${p.toFixed(2)}`
}

function fmtCtx(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '—'
  if (n >= 1_000_000) {
    const m = n / 1_000_000
    return `${m % 1 === 0 ? m.toFixed(0) : m.toFixed(1)}M`
  }
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`
  return String(n)
}

export function ModelPricingHint({ model }: { model: ModelInfo | undefined }): React.JSX.Element | null {
  if (!model) return null

  const parts: React.ReactNode[] = [
    <span key="in">
      in <span className="font-medium text-foreground tabular-nums">{fmtPrice(model.inputPricePer1M)}</span>/1M
    </span>,
    <span key="out">
      out <span className="font-medium text-foreground tabular-nums">{fmtPrice(model.outputPricePer1M)}</span>/1M
    </span>,
    <span key="ctx">
      <span className="font-medium text-foreground tabular-nums">{fmtCtx(model.contextWindow)}</span> ctx
    </span>,
  ]

  return (
    <div
      className="text-xs text-muted-foreground whitespace-nowrap"
      title={`${model.slug} · pricing per 1M tokens · context window`}
    >
      {parts.reduce<React.ReactNode[]>((acc, node, i) => {
        if (i > 0) acc.push(<span key={`sep-${i}`}>{SEP}</span>)
        acc.push(node)
        return acc
      }, [])}
    </div>
  )
}
