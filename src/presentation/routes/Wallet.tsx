import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Button } from '@/presentation/components/ui/button'
import { Card } from '@/presentation/components/ui/card'
import { ErrorView } from '@/presentation/components/ErrorView'
import { CopyButton } from '@/presentation/components/CopyButton'
import { useAppContainer } from '@/presentation/hooks/useAppContainer'
import { useActiveAgent } from '@/presentation/hooks/useActiveAgent'
import { useBalance } from '@/presentation/hooks/useBalance'
import { useWallets } from '@/presentation/hooks/useWallets'
import { useT } from '@/presentation/hooks/useT'
import type { GenerateWalletResponse } from '@/infrastructure/schemas/rest'

const CHAINS = ['solana', 'polygon'] as const
const TOKENS = ['USDC', 'USDT'] as const

function fmtUsd(cents: number): string {
  const usd = cents / 100
  if (usd !== 0 && Math.abs(usd) < 0.01) return `$${usd.toFixed(4)}`
  return `$${usd.toFixed(2)}`
}

function shortAddr(addr: string): string {
  if (addr.length <= 14) return addr
  return `${addr.slice(0, 8)}…${addr.slice(-6)}`
}

export function Wallet() {
  const t = useT()
  const agent = useActiveAgent()
  const container = useAppContainer()
  const balance = useBalance()
  const wallets = useWallets()
  const [chain, setChain] = useState<(typeof CHAINS)[number]>('solana')
  const [token, setToken] = useState<(typeof TOKENS)[number]>('USDC')

  const gen = useMutation({
    mutationFn: async (): Promise<GenerateWalletResponse> => {
      if (!agent) throw new Error('no agent')
      const res = await container.useCases.generateWallet(agent.id, agent.apiKey, { chain, token })
      if (!res.ok) throw res.error
      return res.value
    },
    onSuccess: (w) => {
      void wallets.invalidate()
      toast.success(t('wallet.walletReady'), { description: `${w.chain.toUpperCase()} · ${w.token}` })
    },
  })

  const syncAll = useMutation({
    mutationFn: async (): Promise<number> => {
      if (!agent) throw new Error('no agent')
      const combos: { chain: typeof CHAINS[number]; token: typeof TOKENS[number] }[] = []
      for (const c of CHAINS) for (const tk of TOKENS) combos.push({ chain: c, token: tk })
      let ok = 0
      for (const combo of combos) {
        const res = await container.useCases.generateWallet(agent.id, agent.apiKey, combo)
        if (res.ok) ok++
      }
      return ok
    },
    onSuccess: (count) => {
      void wallets.invalidate()
      toast.success(t('wallet.syncedToast', { n: count }), {
        description: t('wallet.syncedBody'),
      })
    },
    onError: (e) => {
      toast.error(t('wallet.syncFailed'), { description: e instanceof Error ? e.message : String(e) })
    },
  })

  const refresh = useMutation({
    mutationFn: async (): Promise<number> => {
      const prev = balance.data?.availableUsdCents ?? 0
      const res = await balance.refetch()
      const next = res.data?.availableUsdCents ?? prev
      return next - prev
    },
    onSuccess: (diffCents) => {
      if (diffCents > 0) {
        toast.success(t('wallet.balanceUp'), { description: `+${fmtUsd(diffCents)}` })
      } else if (diffCents < 0) {
        toast.info(t('wallet.balanceDown'), { description: fmtUsd(diffCents) })
      } else {
        toast.info(t('wallet.balanceSame'))
      }
    },
  })

  if (!agent) return <p className="text-sm text-muted-foreground">{t('noAgent.select')}</p>

  const err = gen.error
  const list = wallets.listQuery.data ?? []

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Card className="p-6 flex flex-col items-center text-center gap-3 bg-gradient-to-br from-primary/10 to-transparent border-primary/20">
        <div className="text-base sm:text-lg font-bold text-foreground">{t('wallet.availableBalance')}</div>
        <div className="text-4xl sm:text-5xl font-bold tabular-nums break-all">
          {balance.data ? fmtUsd(balance.data.availableUsdCents) : '—'}
        </div>
        {balance.data ? (
          <div className="text-xs text-muted-foreground flex gap-4">
            <span>{t('wallet.deposited')} <b>${Number(balance.data.totalDepositedUsd).toFixed(2)}</b></span>
            <span>{t('wallet.spent')} <b>${Number(balance.data.totalSpentUsd).toFixed(2)}</b></span>
          </div>
        ) : null}
        <div className="flex items-center gap-2 flex-wrap justify-center mt-2">
          <Button size="sm" onClick={() => refresh.mutate()} disabled={refresh.isPending || balance.isFetching}>
            {refresh.isPending || balance.isFetching ? t('home.refreshing') : t('common.refresh')}
          </Button>
        </div>
      </Card>

      <Card className="p-6">
        <div className="text-center mb-4">
          <h2 className="text-lg font-semibold">{t('wallet.generateTitle')}</h2>
          <p className="text-xs text-muted-foreground mt-1">{t('wallet.generateSubtitle')}</p>
        </div>

        <div className="mx-auto max-w-xl space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground block mb-1 text-center">{t('wallet.chain')}</label>
              <div className="grid grid-cols-2 gap-1 rounded-lg border border-border bg-muted/30 p-1">
                {CHAINS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setChain(c)}
                    className={`py-1.5 text-sm rounded-md transition-colors ${chain === c ? 'bg-foreground/15 text-foreground shadow-sm font-medium ring-1 ring-foreground/10' : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'}`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1 text-center">{t('wallet.token')}</label>
              <div className="grid grid-cols-2 gap-1 rounded-lg border border-border bg-muted/30 p-1">
                {TOKENS.map((tk) => (
                  <button
                    key={tk}
                    type="button"
                    onClick={() => setToken(tk)}
                    className={`py-1.5 text-sm rounded-md transition-colors ${token === tk ? 'bg-foreground/15 text-foreground shadow-sm font-medium ring-1 ring-foreground/10' : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'}`}
                  >
                    {tk}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <Button className="w-full" onClick={() => gen.mutate()} disabled={gen.isPending}>
            {gen.isPending ? t('wallet.generating') : t('wallet.generate', { chain, token })}
          </Button>
          {err ? <ErrorView error={err} /> : null}
        </div>
      </Card>

      <section>
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h2 className="text-lg font-semibold">{t('wallet.yourAddresses')}</h2>
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground">{t('wallet.saved', { n: list.length })}</span>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => syncAll.mutate()}
              disabled={syncAll.isPending}
            >
              {syncAll.isPending ? t('wallet.syncing') : t('wallet.syncAll')}
            </Button>
          </div>
        </div>

        {wallets.listQuery.isLoading ? (
          <Card className="p-6 text-center text-sm text-muted-foreground">{t('common.loading')}</Card>
        ) : list.length === 0 ? (
          <Card className="p-8 text-center space-y-2">
            <p className="text-sm text-muted-foreground">{t('wallet.empty')}</p>
            <p className="text-xs text-muted-foreground">{t('wallet.emptyHint')}</p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {list.map((w) => (
              <Card key={`${w.chain}-${w.token}`} className="p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <span className={`rounded px-2 py-0.5 text-xs font-semibold ${w.chain === 'solana' ? 'bg-purple-500/15 text-purple-600' : 'bg-violet-500/15 text-violet-600'}`}>
                    {w.chain}
                  </span>
                  <span className="rounded bg-emerald-500/15 text-emerald-600 px-2 py-0.5 text-xs font-semibold">
                    {w.token}
                  </span>
                  <span className="ml-auto text-[10px] text-muted-foreground">
                    {new Date(w.createdAt).toLocaleDateString()}
                  </span>
                </div>
                <div>
                  <div className="text-[10px] text-muted-foreground mb-1">{t('wallet.address')}</div>
                  <input
                    readOnly
                    value={w.address}
                    onFocus={(e) => e.currentTarget.select()}
                    className="w-full font-mono text-xs rounded-lg border border-border bg-muted/30 px-2.5 py-2 select-all outline-none focus:ring-3 focus:ring-ring/50"
                    title={w.address}
                  />
                  <div className="text-[10px] text-muted-foreground mt-1 font-mono">{shortAddr(w.address)}</div>
                </div>
                <div className="flex gap-2">
                  <CopyButton text={w.address} label={t('wallet.copyAddress')} size="sm" variant="secondary" />
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => wallets.remove.mutate({ chain: w.chain, token: w.token })}
                  >
                    {t('wallet.removeLocal')}
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
