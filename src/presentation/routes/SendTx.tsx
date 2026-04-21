import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Card } from '@/presentation/components/ui/card'
import { Button } from '@/presentation/components/ui/button'
import { Input } from '@/presentation/components/ui/input'
import { ErrorView } from '@/presentation/components/ErrorView'
import { JsonView } from '@/presentation/components/JsonView'
import { CopyButton } from '@/presentation/components/CopyButton'
import { useAppContainer } from '@/presentation/hooks/useAppContainer'
import { useActiveAgent } from '@/presentation/hooks/useActiveAgent'
import { useBalance } from '@/presentation/hooks/useBalance'
import { useT } from '@/presentation/hooks/useT'
import { TX_SEND_CHAINS, TX_SEND_TOKENS, type TxSendToken, type TxSendResponse } from '@/infrastructure/schemas/rest'

function isHexAddress(s: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(s)
}

function isPositiveDecimal(s: string): boolean {
  if (!/^\d+(\.\d+)?$/.test(s)) return false
  if (parseFloat(s) <= 0) return false
  const [, frac = ''] = s.split('.')
  return frac.length <= 6
}

function fmtCents(n: number): string {
  const usd = n / 100
  if (usd !== 0 && Math.abs(usd) < 0.01) return `$${usd.toFixed(4)}`
  return `$${usd.toFixed(2)}`
}

function shortHex(s: string): string {
  if (s.length <= 14) return s
  return `${s.slice(0, 8)}…${s.slice(-6)}`
}

export function SendTx() {
  const t = useT()
  const agent = useActiveAgent()
  const container = useAppContainer()
  const balance = useBalance()

  const chain = TX_SEND_CHAINS[0]
  const [token, setToken] = useState<TxSendToken>(TX_SEND_TOKENS[0]!)
  const [recipient, setRecipient] = useState('')
  const [amount, setAmount] = useState('')

  const canSubmit = isHexAddress(recipient) && isPositiveDecimal(amount)

  const send = useMutation({
    mutationFn: async (): Promise<TxSendResponse> => {
      if (!agent) throw new Error('no agent')
      const res = await container.useCases.sendSponsoredTransaction(agent.id, agent.apiKey, {
        chain, token, to: recipient, amount,
      })
      if (!res.ok) throw res.error
      return res.value
    },
    onSuccess: (r) => {
      toast.success(t('tx.sent'), { description: shortHex(r.txHash) })
      void balance.refetch()
    },
  })

  if (!agent) return <p className="text-sm text-muted-foreground">{t('noAgent.select')}</p>
  const err = send.error

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Card className="p-6">
        <div className="text-center mb-4">
          <h2 className="text-lg font-semibold">{t('tx.send.title')}</h2>
          <p className="text-xs text-muted-foreground mt-1">{t('tx.send.subtitle')}</p>
          <p className="text-xs text-amber-600 dark:text-amber-400 mt-2 font-medium">
            {t('tx.send.warning')}
          </p>
        </div>

        <div className="mx-auto max-w-xl space-y-4">
          <div>
            <label className="text-xs text-muted-foreground block mb-1">{t('tx.send.chain')}</label>
            <div className="rounded-lg border border-border bg-muted/20 px-3 py-2 text-sm font-medium">
              polygon <span className="text-xs text-muted-foreground ml-2">chainId 137</span>
            </div>
          </div>

          <div>
            <label className="text-xs text-muted-foreground block mb-1">{t('tx.send.token')}</label>
            <div className="flex flex-wrap gap-1.5">
              {TX_SEND_TOKENS.map((tk) => {
                const isActive = token === tk
                return (
                  <button
                    key={tk}
                    type="button"
                    onClick={() => setToken(tk)}
                    className={`rounded-md px-2.5 py-1 text-xs transition-colors ${isActive ? 'bg-foreground/15 text-foreground shadow-sm font-medium ring-1 ring-foreground/10' : 'bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground'}`}
                  >
                    {tk}
                  </button>
                )
              })}
            </div>
          </div>

          <div>
            <label className="text-xs text-muted-foreground block mb-1">{t('tx.send.recipient')}</label>
            <Input
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              placeholder="0x…"
              className="font-mono text-xs"
            />
            {recipient && !isHexAddress(recipient) ? (
              <p className="text-xs text-destructive mt-1">{t('tx.send.invalidAddr')}</p>
            ) : null}
          </div>

          <div>
            <label className="text-xs text-muted-foreground block mb-1">
              {t('tx.send.amount')} <span className="text-muted-foreground/60">({token}, {t('tx.send.amountHint')})</span>
            </label>
            <Input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.5"
              inputMode="decimal"
            />
            {amount && !isPositiveDecimal(amount) ? (
              <p className="text-xs text-destructive mt-1">{t('tx.send.invalidAmount')}</p>
            ) : null}
          </div>

          <Button className="w-full" onClick={() => send.mutate()} disabled={!canSubmit || send.isPending}>
            {send.isPending ? t('tx.send.sending') : t('tx.send.send')}
          </Button>
          {err ? <ErrorView error={err} /> : null}
        </div>
      </Card>

      {send.data ? (
        <Card className="p-6 space-y-4">
          <h3 className="text-base font-semibold">{t('tx.send.receipt')}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <ReceiptRow label={t('tx.send.txHash')} value={send.data.txHash} copy mono />
            <ReceiptRow label={t('tx.send.from')} value={send.data.from} copy mono />
            <ReceiptRow label={t('tx.send.toLabel')} value={send.data.to} copy mono />
            <ReceiptRow label="chain" value={`${send.data.chain} · ${send.data.chainId}`} />
            <ReceiptRow label={t('tx.send.tokenLabel')} value={send.data.tokenAddress ? `${send.data.token} · ${shortHex(send.data.tokenAddress)}` : send.data.token} />
            <ReceiptRow label={t('tx.send.amountSent')} value={send.data.amount} mono emphasize />
            {send.data.feeFormatted ? (
              <ReceiptRow label={t('tx.send.fee')} value={send.data.feeFormatted + (send.data.feeCents !== undefined ? ` · ${fmtCents(send.data.feeCents)}` : '')} />
            ) : null}
            <ReceiptRow label={t('tx.send.charged')} value={fmtCents(send.data.chargedCents)} emphasize />
          </div>
          {send.data.explorerUrl ? (
            <a href={send.data.explorerUrl} target="_blank" rel="noreferrer" className="text-xs text-primary underline">
              {t('tx.send.openOnExplorer')} ↗
            </a>
          ) : null}
          <details className="text-xs">
            <summary className="cursor-pointer text-muted-foreground">{t('tx.send.rawJson')}</summary>
            <div className="mt-2">
              <JsonView value={send.data} maxHeight="20rem" />
            </div>
          </details>
        </Card>
      ) : null}
    </div>
  )
}

function ReceiptRow({ label, value, copy = false, mono = false, emphasize = false }: {
  label: string; value: string; copy?: boolean; mono?: boolean; emphasize?: boolean
}): React.JSX.Element {
  return (
    <div className="min-w-0">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className="flex items-center gap-2 min-w-0">
        <div
          className={`min-w-0 flex-1 truncate ${mono ? 'font-mono text-xs' : 'text-sm'} ${emphasize ? 'font-semibold' : ''}`}
          title={value}
        >
          {value}
        </div>
        {copy ? <CopyButton text={value} label="copy" size="sm" variant="ghost" /> : null}
      </div>
    </div>
  )
}
