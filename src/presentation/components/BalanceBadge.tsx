import { useBalance } from '@/presentation/hooks/useBalance'

export function BalanceBadge() {
  const q = useBalance()
  const hasData = !!q.data
  const usd = hasData ? (q.data!.availableUsdCents / 100).toFixed(2) : null
  const isZero = hasData && q.data!.availableUsdCents === 0
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-2 sm:px-3 py-1.5">
      <span className="hidden sm:inline text-[10px] text-muted-foreground">Balance</span>
      <span className={`text-sm font-semibold tabular-nums ${isZero ? 'text-muted-foreground' : 'text-foreground'}`}>
        {hasData ? `$${usd}` : '—'}
      </span>
    </div>
  )
}
