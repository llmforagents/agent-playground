import { useState, useMemo } from 'react'
import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Card } from '@/presentation/components/ui/card'
import { Button } from '@/presentation/components/ui/button'
import { Input } from '@/presentation/components/ui/input'
import { Textarea } from '@/presentation/components/ui/textarea'
import { ErrorView } from '@/presentation/components/ErrorView'
import { JsonView } from '@/presentation/components/JsonView'
import { CopyButton } from '@/presentation/components/CopyButton'
import { useAppContainer } from '@/presentation/hooks/useAppContainer'
import { useActiveAgent } from '@/presentation/hooks/useActiveAgent'
import { useBalance } from '@/presentation/hooks/useBalance'
import { useT } from '@/presentation/hooks/useT'
import {
  POLYGON_TOKENS, type Erc20Token,
  isHexAddress, toBaseUnits, encodeErc20Transfer,
} from '@/domain/erc20'
import { TX_SEND_CHAINS, type TxSendRequest, type TxSendResponse } from '@/infrastructure/schemas/rest'

type Mode = 'erc20' | 'raw'

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

  const [mode, setMode] = useState<Mode>('erc20')

  // ERC-20 mode
  const [token, setToken] = useState<Erc20Token>(POLYGON_TOKENS[0]!)
  const [recipient, setRecipient] = useState('')
  const [amountHuman, setAmountHuman] = useState('')

  // Raw mode
  const [rawTo, setRawTo] = useState('')
  const [rawData, setRawData] = useState('0x')
  const [rawValue, setRawValue] = useState('0')

  const chain = TX_SEND_CHAINS[0]

  const previewData = useMemo(() => {
    if (mode !== 'erc20') return null
    if (!isHexAddress(recipient)) return null
    const base = toBaseUnits(amountHuman, token.decimals)
    if (base === null) return null
    try { return encodeErc20Transfer(recipient, base) } catch { return null }
  }, [mode, recipient, amountHuman, token])

  const canSubmit = useMemo(() => {
    if (mode === 'erc20') return previewData !== null
    if (!isHexAddress(rawTo)) return false
    if (!/^0x[a-fA-F0-9]*$/.test(rawData)) return false
    if (!/^\d+$/.test(rawValue)) return false
    return true
  }, [mode, previewData, rawTo, rawData, rawValue])

  const send = useMutation({
    mutationFn: async (): Promise<TxSendResponse> => {
      if (!agent) throw new Error('no agent')
      const req: TxSendRequest = mode === 'erc20'
        ? { chain, to: token.address, data: previewData ?? '0x' }
        : { chain, to: rawTo, data: rawData || '0x', value: rawValue || '0' }
      const res = await container.useCases.sendSponsoredTransaction(agent.id, agent.apiKey, req)
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

        <div className="rounded-lg border border-border bg-muted/30 p-1 grid grid-cols-2 gap-1 mb-5 max-w-sm mx-auto">
          <button
            type="button"
            onClick={() => setMode('erc20')}
            className={`py-1.5 text-sm rounded-md transition-colors ${mode === 'erc20' ? 'bg-foreground/15 text-foreground shadow-sm font-medium ring-1 ring-foreground/10' : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'}`}
          >
            {t('tx.send.modeErc20')}
          </button>
          <button
            type="button"
            onClick={() => setMode('raw')}
            className={`py-1.5 text-sm rounded-md transition-colors ${mode === 'raw' ? 'bg-foreground/15 text-foreground shadow-sm font-medium ring-1 ring-foreground/10' : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'}`}
          >
            {t('tx.send.modeRaw')}
          </button>
        </div>

        <div className="mx-auto max-w-xl space-y-4">
          <div>
            <label className="text-xs text-muted-foreground block mb-1">{t('tx.send.chain')}</label>
            <div className="rounded-lg border border-border bg-muted/20 px-3 py-2 text-sm font-medium">
              polygon <span className="text-xs text-muted-foreground ml-2">chainId 137</span>
            </div>
          </div>

          {mode === 'erc20' ? (
            <>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">{t('tx.send.token')}</label>
                <div className="flex flex-wrap gap-1.5">
                  {POLYGON_TOKENS.map((tk) => {
                    const isActive = token.symbol === tk.symbol
                    return (
                      <button
                        key={tk.symbol}
                        type="button"
                        onClick={() => setToken(tk)}
                        className={`rounded-md px-2.5 py-1 text-xs transition-colors ${isActive ? 'bg-foreground/15 text-foreground shadow-sm font-medium ring-1 ring-foreground/10' : 'bg-muted text-muted-foreground hover:text-foreground'}`}
                      >
                        {tk.symbol}
                      </button>
                    )
                  })}
                </div>
                <p className="text-[10px] text-muted-foreground mt-1 font-mono truncate">{token.address}</p>
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
                  {t('tx.send.amount')} <span className="text-muted-foreground/60">({token.symbol}, {token.decimals} dec)</span>
                </label>
                <Input
                  value={amountHuman}
                  onChange={(e) => setAmountHuman(e.target.value)}
                  placeholder="0.5"
                  inputMode="decimal"
                />
              </div>
              {previewData ? (
                <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-1">
                  <div className="text-[10px] text-muted-foreground">{t('tx.send.calldataPreview')}</div>
                  <pre className="font-mono text-[10px] whitespace-pre-wrap break-all">{previewData}</pre>
                </div>
              ) : null}
            </>
          ) : (
            <>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">{t('tx.send.to')}</label>
                <Input
                  value={rawTo}
                  onChange={(e) => setRawTo(e.target.value)}
                  placeholder="0x…"
                  className="font-mono text-xs"
                />
                {rawTo && !isHexAddress(rawTo) ? (
                  <p className="text-xs text-destructive mt-1">{t('tx.send.invalidAddr')}</p>
                ) : null}
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">
                  {t('tx.send.data')} <span className="normal-case text-muted-foreground/60">0x (default)</span>
                </label>
                <Textarea
                  rows={3}
                  value={rawData}
                  onChange={(e) => setRawData(e.target.value)}
                  placeholder="0x"
                  className="font-mono text-xs"
                />
                {rawData && !/^0x[a-fA-F0-9]*$/.test(rawData) ? (
                  <p className="text-xs text-destructive mt-1">{t('tx.send.invalidHex')}</p>
                ) : null}
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">
                  {t('tx.send.value')} <span className="normal-case text-muted-foreground/60">{t('tx.send.valueHint')}</span>
                </label>
                <Input
                  value={rawValue}
                  onChange={(e) => setRawValue(e.target.value)}
                  placeholder="0"
                  inputMode="numeric"
                  className="font-mono text-xs"
                />
                {rawValue && !/^\d+$/.test(rawValue) ? (
                  <p className="text-xs text-destructive mt-1">{t('tx.send.invalidDecimal')}</p>
                ) : null}
              </div>
            </>
          )}

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
            <ReceiptRow label={t('tx.send.userOpHash')} value={send.data.userOpHash} copy mono />
            <ReceiptRow label={t('tx.send.from')} value={send.data.from} copy mono />
            <ReceiptRow label="chainId" value={String(send.data.chainId)} />
            <ReceiptRow label={t('tx.send.gasUsed')} value={send.data.gasUsed} mono />
            <ReceiptRow label={t('tx.send.actualGasCostWei')} value={send.data.actualGasCostWei} mono />
            <ReceiptRow label={t('tx.send.charged')} value={fmtCents(send.data.chargedCents)} emphasize />
            <ReceiptRow label={t('tx.send.refunded')} value={fmtCents(send.data.refundedCents)} />
          </div>
          <a
            href={`https://polygonscan.com/tx/${send.data.txHash}`}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-primary underline"
          >
            {t('tx.send.openOnExplorer')} ↗
          </a>
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
