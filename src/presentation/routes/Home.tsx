import { Link } from 'react-router-dom'
import { Card } from '@/presentation/components/ui/card'
import { Button } from '@/presentation/components/ui/button'
import { useBalance } from '@/presentation/hooks/useBalance'
import { useTransactions } from '@/presentation/hooks/useTransactions'
import { useAgents } from '@/presentation/hooks/useAgents'
import { useActiveAgent } from '@/presentation/hooks/useActiveAgent'
import { useT } from '@/presentation/hooks/useT'
import type { TransactionInfo } from '@/infrastructure/schemas/rest'

function fmtUsd(cents: number): string {
  const usd = cents / 100
  if (usd !== 0 && Math.abs(usd) < 0.01) return `$${usd.toFixed(4)}`
  return `$${usd.toFixed(2)}`
}

function typeStyle(type: TransactionInfo['type']): string {
  switch (type) {
    case 'deposit': return 'bg-emerald-500/15 text-emerald-600'
    case 'usage': return 'bg-orange-500/15 text-orange-600'
    case 'refund': return 'bg-sky-500/15 text-sky-600'
  }
}

function amountClass(type: TransactionInfo['type']): string {
  if (type === 'deposit' || type === 'refund') return 'text-emerald-600'
  return 'text-orange-600'
}

function amountSign(type: TransactionInfo['type']): string {
  return type === 'deposit' || type === 'refund' ? '+' : '-'
}

export function Home() {
  const t = useT()
  const agent = useActiveAgent()
  const { listQuery } = useAgents()
  const balance = useBalance()
  const tx = useTransactions({ limit: 5 })

  const hasAgents = (listQuery.data ?? []).length > 0

  if (!agent) {
    return (
      <div className="mx-auto max-w-4xl">
        <Card className="p-10 text-center space-y-4">
          <div className="text-5xl">👋</div>
          <div>
            <h1 className="text-2xl font-semibold">
              {t('home.welcome')} <span className="font-bold">LLM4Agents</span>
            </h1>
            <p className="text-sm text-muted-foreground mt-2 max-w-md mx-auto">
              {t('home.welcomeBody')}
              <br />{t('home.welcomeWarning')}
            </p>
          </div>
          <div className="flex flex-wrap gap-2 justify-center pt-2">
            <Link to="/agents">
              <Button>{hasAgents ? t('home.selectAgent') : t('home.createFirstAgent')}</Button>
            </Link>
          </div>
        </Card>
      </div>
    )
  }

  const usdCents = balance.data?.availableUsdCents ?? 0
  const zeroBalance = balance.data !== undefined && usdCents === 0

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Card className="p-6 flex flex-col items-center text-center gap-3 bg-gradient-to-br from-primary/10 to-transparent border-primary/20">
        <div className="text-base sm:text-lg font-bold text-foreground">{t('home.availableBalance')}</div>
        <div className="text-4xl sm:text-5xl font-bold tabular-nums break-all">
          {balance.data ? fmtUsd(usdCents) : '—'}
        </div>
        {balance.data ? (
          <div className="text-xs text-muted-foreground flex gap-4 flex-wrap justify-center">
            <span>{t('home.deposited')} <b>${Number(balance.data.totalDepositedUsd).toFixed(2)}</b></span>
            <span>{t('home.spent')} <b>${Number(balance.data.totalSpentUsd).toFixed(2)}</b></span>
          </div>
        ) : null}
        <div className="flex items-center gap-2 flex-wrap justify-center mt-2">
          <Button size="sm" variant="secondary" onClick={() => { void balance.refetch() }} disabled={balance.isFetching}>
            {balance.isFetching ? t('home.refreshing') : t('common.refresh')}
          </Button>
          <Link to="/wallet"><Button size="sm" variant={zeroBalance ? 'default' : 'ghost'}>{t('home.manageWallet')}</Button></Link>
        </div>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Link to={zeroBalance ? '/wallet' : '/chat'} className="block">
          <QuickAction
            icon="💬"
            title={t('home.quickActionChat')}
            hint={zeroBalance ? t('home.quickActionChatHintNeedsBalance') : t('home.quickActionChatHint')}
            dim={zeroBalance}
          />
        </Link>
        <Link to="/scraper/one-shot" className="block">
          <QuickAction icon="🔎" title={t('home.quickActionScraper')} hint={t('home.quickActionScraperHint')} />
        </Link>
        <Link to="/models" className="block">
          <QuickAction icon="🧠" title={t('home.quickActionModels')} hint={t('home.quickActionModelsHint')} />
        </Link>
        <Link to="/transactions" className="block">
          <QuickAction icon="🧾" title={t('home.quickActionTransactions')} hint={t('home.quickActionTransactionsHint')} />
        </Link>
      </div>

      <section>
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h2 className="text-lg font-semibold">{t('home.recentTransactions')}</h2>
          <Link to="/transactions" className="text-xs text-muted-foreground hover:text-foreground">
            {t('home.viewAll')}
          </Link>
        </div>

        {tx.isLoading ? (
          <Card className="p-6 text-center text-sm text-muted-foreground">{t('common.loading')}</Card>
        ) : tx.data && tx.data.transactions.length > 0 ? (
          <Card className="p-0 overflow-hidden">
            <ul className="divide-y divide-border">
              {tx.data.transactions.map((txn) => (
                <li key={txn.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className={`rounded-md px-2 py-0.5 text-xs font-semibold flex-shrink-0 ${typeStyle(txn.type)}`}>
                      {txn.type}
                    </span>
                    <div className="min-w-0">
                      <div className="text-sm truncate">{txn.description ?? '—'}</div>
                      <div className="text-[10px] text-muted-foreground">
                        {new Date(txn.timestamp).toLocaleString()}
                      </div>
                    </div>
                  </div>
                  <span className={`text-sm font-medium tabular-nums flex-shrink-0 ${amountClass(txn.type)}`}>
                    {amountSign(txn.type)}{fmtUsd(Math.abs(txn.amountCents))}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        ) : (
          <Card className="p-6 text-center space-y-3">
            <p className="text-sm text-muted-foreground">{t('home.noTransactions')}</p>
            <Link to="/wallet" className="inline-block">
              <Button size="sm" variant="secondary">{t('common.goToWallet')}</Button>
            </Link>
          </Card>
        )}
      </section>
    </div>
  )
}

function QuickAction({
  icon, title, hint, dim = false,
}: { icon: string; title: string; hint: string; dim?: boolean }): React.JSX.Element {
  return (
    <Card className={`p-4 hover:bg-accent/40 transition-colors cursor-pointer h-full ${dim ? 'opacity-60' : ''}`}>
      <div className="flex items-center gap-3">
        <div className="text-2xl">{icon}</div>
        <div className="min-w-0">
          <div className="font-medium">{title}</div>
          <div className="text-xs text-muted-foreground truncate">{hint}</div>
        </div>
      </div>
    </Card>
  )
}
