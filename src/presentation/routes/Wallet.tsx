import { useEffect, useRef, useState } from 'react'
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
import type { GenerateWalletResponse } from '@/infrastructure/schemas/rest'

const POLL_INTERVAL_MS = 8_000
const MAX_POLL_MS = 10 * 60_000
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
  const agent = useActiveAgent()
  const container = useAppContainer()
  const balance = useBalance()
  const wallets = useWallets()
  const [chain, setChain] = useState<(typeof CHAINS)[number]>('solana')
  const [token, setToken] = useState<(typeof TOKENS)[number]>('USDC')
  const [watching, setWatching] = useState(false)
  const [elapsedMs, setElapsedMs] = useState(0)
  const watchStartRef = useRef<{ startCents: number; startedAt: number } | null>(null)

  const gen = useMutation({
    mutationFn: async (): Promise<GenerateWalletResponse> => {
      if (!agent) throw new Error('no agent')
      const res = await container.useCases.generateWallet(agent.id, agent.apiKey, { chain, token })
      if (!res.ok) throw res.error
      return res.value
    },
    onSuccess: (w) => {
      void wallets.invalidate()
      toast.success('Wallet ready', { description: `${w.chain.toUpperCase()} · ${w.token}` })
    },
  })

  const syncAll = useMutation({
    mutationFn: async (): Promise<number> => {
      if (!agent) throw new Error('no agent')
      const combos: { chain: typeof CHAINS[number]; token: typeof TOKENS[number] }[] = []
      for (const c of CHAINS) for (const t of TOKENS) combos.push({ chain: c, token: t })
      let ok = 0
      for (const combo of combos) {
        const res = await container.useCases.generateWallet(agent.id, agent.apiKey, combo)
        if (res.ok) ok++
      }
      return ok
    },
    onSuccess: (count) => {
      void wallets.invalidate()
      toast.success(`Synced ${count} wallet${count === 1 ? '' : 's'}`, {
        description: 'Fetched all chain/token combinations.',
      })
    },
    onError: (e) => {
      toast.error('Sync failed', { description: e instanceof Error ? e.message : String(e) })
    },
  })

  useEffect(() => {
    if (!watching) return
    const pollId = setInterval(() => { void balance.refetch() }, POLL_INTERVAL_MS)
    const tickId = setInterval(() => {
      const started = watchStartRef.current?.startedAt
      if (started) setElapsedMs(Date.now() - started)
    }, 1000)
    return () => { clearInterval(pollId); clearInterval(tickId) }
  }, [watching, balance])

  useEffect(() => {
    if (!watching || !balance.data || !watchStartRef.current) return
    const current = balance.data.availableUsdCents
    const start = watchStartRef.current.startCents
    if (current > start) {
      toast.success('Deposit received', {
        description: `${fmtUsd(start)} → ${fmtUsd(current)} (+${fmtUsd(current - start)})`,
      })
      setWatching(false)
      watchStartRef.current = null
    } else if (Date.now() - watchStartRef.current.startedAt > MAX_POLL_MS) {
      toast.warning('Stopped watching', { description: `No deposit detected after ${Math.round(MAX_POLL_MS / 60_000)} minutes.` })
      setWatching(false)
      watchStartRef.current = null
    }
  }, [balance.data, watching])

  const startWatching = (): void => {
    if (!balance.data) { toast.error('Balance not loaded yet. Click Refresh first.'); return }
    watchStartRef.current = { startCents: balance.data.availableUsdCents, startedAt: Date.now() }
    setElapsedMs(0)
    setWatching(true)
  }
  const stopWatching = (): void => { setWatching(false); watchStartRef.current = null }

  if (!agent) return <p className="text-sm text-muted-foreground">Select an agent first.</p>

  const err = gen.error
  const elapsedSec = Math.floor(elapsedMs / 1000)
  const nextPollIn = POLL_INTERVAL_MS - (elapsedMs % POLL_INTERVAL_MS)
  const list = wallets.listQuery.data ?? []

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Card className="p-6 flex flex-col items-center text-center gap-3 bg-gradient-to-br from-primary/10 to-transparent border-primary/20">
        <div className="text-xs text-muted-foreground">Available balance</div>
        <div className="text-4xl sm:text-5xl font-bold tabular-nums break-all">
          {balance.data ? fmtUsd(balance.data.availableUsdCents) : '—'}
        </div>
        {balance.data ? (
          <div className="text-xs text-muted-foreground flex gap-4">
            <span>Deposited <b>${Number(balance.data.totalDepositedUsd).toFixed(2)}</b></span>
            <span>Spent <b>${Number(balance.data.totalSpentUsd).toFixed(2)}</b></span>
          </div>
        ) : null}
        <div className="flex items-center gap-2 flex-wrap justify-center mt-2">
          <Button size="sm" variant="secondary" onClick={() => { void balance.refetch() }} disabled={balance.isFetching}>
            {balance.isFetching ? 'Refreshing…' : 'Refresh'}
          </Button>
          {watching ? (
            <>
              <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                </span>
                Watching… {elapsedSec}s · next in {Math.ceil(nextPollIn / 1000)}s
              </span>
              <Button size="sm" variant="destructive" onClick={stopWatching}>Stop</Button>
            </>
          ) : (
            <Button size="sm" onClick={startWatching} disabled={!balance.data}>Watch for deposit</Button>
          )}
        </div>
      </Card>

      <Card className="p-6">
        <div className="text-center mb-4">
          <h2 className="text-lg font-semibold">Generate deposit wallet</h2>
          <p className="text-xs text-muted-foreground mt-1">Same chain + token returns the same address (idempotent)</p>
        </div>

        <div className="mx-auto max-w-xl space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground block mb-1 text-center">Chain</label>
              <div className="grid grid-cols-2 gap-1 rounded-lg border border-border bg-muted/30 p-1">
                {CHAINS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setChain(c)}
                    className={`py-1.5 text-sm rounded-md transition-colors ${chain === c ? 'bg-foreground/10 text-foreground shadow-sm font-medium' : 'text-muted-foreground hover:text-foreground'}`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1 text-center">Token</label>
              <div className="grid grid-cols-2 gap-1 rounded-lg border border-border bg-muted/30 p-1">
                {TOKENS.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setToken(t)}
                    className={`py-1.5 text-sm rounded-md transition-colors ${token === t ? 'bg-foreground/10 text-foreground shadow-sm font-medium' : 'text-muted-foreground hover:text-foreground'}`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <Button className="w-full" onClick={() => gen.mutate()} disabled={gen.isPending}>
            {gen.isPending ? 'Generating…' : `Generate ${chain} · ${token} wallet`}
          </Button>
          {err ? <ErrorView error={err} /> : null}
        </div>
      </Card>

      <section>
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h2 className="text-lg font-semibold">Your deposit addresses</h2>
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground">{list.length} saved</span>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => syncAll.mutate()}
              disabled={syncAll.isPending}
              title="Fetch all 4 chain/token combinations from the backend"
            >
              {syncAll.isPending ? 'Syncing…' : 'Sync all'}
            </Button>
          </div>
        </div>

        {wallets.listQuery.isLoading ? (
          <Card className="p-6 text-center text-sm text-muted-foreground">Loading…</Card>
        ) : list.length === 0 ? (
          <Card className="p-8 text-center space-y-2">
            <p className="text-sm text-muted-foreground">
              No addresses yet. Generate one above to start receiving deposits.
            </p>
            <p className="text-xs text-muted-foreground">
              Already generated wallets for this agent on another session? Click <b>Sync all</b> above to pull them.
            </p>
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
                  <div className="text-[10px] text-muted-foreground mb-1">Address</div>
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
                  <CopyButton text={w.address} label="Copy address" size="sm" variant="secondary" />
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => wallets.remove.mutate({ chain: w.chain, token: w.token })}
                  >
                    Remove local
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
