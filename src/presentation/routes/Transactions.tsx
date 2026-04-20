import { useMemo, useState } from 'react'
import { Card } from '@/presentation/components/ui/card'
import { Button } from '@/presentation/components/ui/button'
import { useTransactions } from '@/presentation/hooks/useTransactions'
import { ErrorView } from '@/presentation/components/ErrorView'
import { useT } from '@/presentation/hooks/useT'
import type { MessageKey } from '@/domain/i18n'
import type { TransactionInfo } from '@/infrastructure/schemas/rest'

const PAGE = 25
const FILTERS = ['all', 'deposit', 'usage', 'refund'] as const
type Filter = (typeof FILTERS)[number]

function fmtUsd(cents: number): string {
  const abs = Math.abs(cents) / 100
  const sign = cents < 0 ? '-' : ''
  const digits = abs !== 0 && abs < 0.01 ? 4 : 2
  return `${sign}$${abs.toFixed(digits)}`
}

function typeStyle(t: TransactionInfo['type']): string {
  switch (t) {
    case 'deposit': return 'bg-emerald-500/15 text-emerald-600'
    case 'usage': return 'bg-orange-500/15 text-orange-600'
    case 'refund': return 'bg-sky-500/15 text-sky-600'
  }
}

function amountSign(t: TransactionInfo['type'], cents: number): string {
  if (t === 'deposit' || t === 'refund') return cents >= 0 ? '+' : ''
  return cents > 0 ? '-' : ''
}

function amountClass(t: TransactionInfo['type']): string {
  if (t === 'deposit' || t === 'refund') return 'text-emerald-600'
  return 'text-orange-600'
}

const FILTER_LABELS: Record<Filter, MessageKey> = {
  all: 'tx.filterAll',
  deposit: 'tx.filterDeposit',
  usage: 'tx.filterUsage',
  refund: 'tx.filterRefund',
}

export function Transactions() {
  const t = useT()
  const [type, setType] = useState<Filter>('all')
  const [offset, setOffset] = useState(0)
  const q = useTransactions({
    ...(type !== 'all' ? { type } : {}),
    limit: PAGE,
    offset,
  })
  const err = q.error

  const txns = q.data?.transactions ?? []
  const total = q.data?.total ?? 0

  const totals = useMemo(() => {
    const agg = { deposit: 0, usage: 0, refund: 0 }
    for (const t of txns) agg[t.type] += t.amountCents
    return agg
  }, [txns])

  const from = total === 0 ? 0 : offset + 1
  const to = Math.min(offset + PAGE, total)
  const canPrev = offset > 0
  const canNext = offset + PAGE < total

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <StatCard label={t('tx.statsDeposits')} hint={t('tx.statsHint')} value={fmtUsd(totals.deposit)} accent="emerald" />
        <StatCard label={t('tx.statsUsage')} hint={t('tx.statsHint')} value={fmtUsd(totals.usage)} accent="orange" />
        <StatCard label={t('tx.statsRefunds')} hint={t('tx.statsHint')} value={fmtUsd(totals.refund)} accent="sky" />
      </div>

      <Card className="p-4">
        <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
          <h2 className="text-lg font-semibold">{t('tx.title')}</h2>
          <span className="text-xs text-muted-foreground">
            {total === 0 ? '0' : t('tx.rangeOf', { from, to, total })}
          </span>
        </div>

        <div className="rounded-lg border border-border bg-muted/30 p-1 grid grid-cols-4 gap-1 mb-4">
          {FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => { setType(f); setOffset(0) }}
              className={`py-1.5 text-sm rounded-md transition-colors ${type === f ? 'bg-foreground/10 text-foreground shadow-sm font-medium' : 'text-muted-foreground hover:text-foreground'}`}
            >
              {t(FILTER_LABELS[f])}
            </button>
          ))}
        </div>

        {err ? <div className="mb-4"><ErrorView error={err} /></div> : null}

        {q.isLoading ? (
          <Card className="p-6 text-center text-sm text-muted-foreground">{t('common.loading')}</Card>
        ) : txns.length === 0 ? (
          <Card className="p-8 text-center text-sm text-muted-foreground">
            {type === 'all' ? t('tx.emptyAll') : t('tx.emptyFiltered', { type })}
          </Card>
        ) : (
          <div className="rounded-lg border border-border overflow-x-auto">
            <table className="w-full min-w-[40rem] text-sm">
              <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">{t('tx.type')}</th>
                  <th className="px-3 py-2 font-medium text-right">{t('tx.amount')}</th>
                  <th className="px-3 py-2 font-medium">{t('tx.when')}</th>
                  <th className="px-3 py-2 font-medium">{t('tx.description')}</th>
                </tr>
              </thead>
              <tbody>
                {txns.map((txn) => (
                  <tr key={txn.id} className="border-t border-border hover:bg-muted/20 transition-colors">
                    <td className="px-3 py-2">
                      <span className={`inline-block rounded-md px-2 py-0.5 text-xs font-semibold ${typeStyle(txn.type)}`}>
                        {txn.type}
                      </span>
                    </td>
                    <td className={`px-3 py-2 text-right tabular-nums font-medium ${amountClass(txn.type)}`}>
                      {amountSign(txn.type, txn.amountCents)}{fmtUsd(Math.abs(txn.amountCents))}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                      {new Date(txn.timestamp).toLocaleString()}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {txn.description ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex items-center justify-between mt-4 flex-wrap gap-2">
          <span className="text-xs text-muted-foreground">
            {t('tx.pageOf', { page: Math.floor(offset / PAGE) + 1, total: Math.max(1, Math.ceil(total / PAGE)) })}
          </span>
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" disabled={!canPrev} onClick={() => setOffset(Math.max(0, offset - PAGE))}>
              {t('common.prev')}
            </Button>
            <Button size="sm" variant="secondary" disabled={!canNext} onClick={() => setOffset(offset + PAGE)}>
              {t('common.next')}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  )
}

function StatCard({ label, hint, value, accent }: { label: string; hint: string; value: string; accent: 'emerald' | 'orange' | 'sky' }): React.JSX.Element {
  const accentClass =
    accent === 'emerald' ? 'text-emerald-600' :
    accent === 'orange' ? 'text-orange-600' : 'text-sky-600'
  return (
    <Card className="p-4">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className="text-[10px] text-muted-foreground/70 mb-1">{hint}</div>
      <div className={`text-2xl font-semibold tabular-nums ${accentClass}`}>{value}</div>
    </Card>
  )
}
