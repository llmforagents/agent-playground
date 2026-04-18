import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Button } from '@/presentation/components/ui/button'
import { Card } from '@/presentation/components/ui/card'
import { ErrorView } from '@/presentation/components/ErrorView'
import { useAppStore } from '@/presentation/hooks/useAppStore'
import { useAppContainer } from '@/presentation/hooks/useAppContainer'
import type { HealthzResponse } from '@/infrastructure/schemas/rest'

export function Settings() {
  const theme = useAppStore((s) => s.theme)
  const toggleTheme = useAppStore((s) => s.toggleTheme)
  const ack = useAppStore((s) => s.mainnetBannerAck)
  const container = useAppContainer()
  const [lastPingAt, setLastPingAt] = useState<string | undefined>()
  const [confirmWipe, setConfirmWipe] = useState(false)

  const ping = useMutation({
    mutationFn: async (): Promise<HealthzResponse> => {
      const res = await container.useCases.healthCheck()
      if (!res.ok) throw res.error
      setLastPingAt(new Date().toLocaleString())
      return res.value
    },
  })

  const onWipe = async (): Promise<void> => {
    if (!confirmWipe) {
      setConfirmWipe(true)
      setTimeout(() => setConfirmWipe(false), 4000)
      return
    }
    try {
      const dbs = await indexedDB.databases()
      await Promise.all(dbs.map((d) =>
        d.name
          ? new Promise<void>((resolve) => {
              const req = indexedDB.deleteDatabase(d.name!)
              req.onsuccess = () => resolve()
              req.onerror = () => resolve()
              req.onblocked = () => resolve()
            })
          : Promise.resolve()
      ))
      localStorage.clear()
      toast.success('Local data wiped. Reloading…')
      setTimeout(() => window.location.reload(), 500)
    } catch (e) {
      toast.error('Wipe failed', { description: e instanceof Error ? e.message : String(e) })
      setConfirmWipe(false)
    }
  }

  const serverOk = ping.data?.status === 'ok'

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <SettingsSection
        title="Appearance"
        description="UI preferences. Stored in localStorage, per browser."
      >
        <Row
          label="Theme"
          hint="Light or dark. Applies immediately."
          action={
            <div className="rounded-lg border border-border bg-muted/30 p-1 grid grid-cols-2 gap-1">
              {(['light', 'dark'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => { if (theme !== t) toggleTheme() }}
                  className={`py-1.5 px-6 text-sm rounded-md transition-colors capitalize ${theme === t ? 'bg-background shadow-sm font-medium' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  {t}
                </button>
              ))}
            </div>
          }
        />
        <Row
          label="Mainnet banner"
          hint={ack ? 'You have acknowledged the mainnet warning.' : 'Banner is currently visible.'}
          action={
            <Button
              size="sm"
              variant="secondary"
              onClick={() => { useAppStore.setState({ mainnetBannerAck: false }) }}
              disabled={!ack}
            >
              {ack ? 'Reset acknowledgement' : 'Already visible'}
            </Button>
          }
        />
      </SettingsSection>

      <SettingsSection
        title="System health"
        description="Ping the API to verify connectivity. Doesn't cost balance."
      >
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <span
                className={`size-2 rounded-full ${ping.isPending ? 'bg-amber-500 animate-pulse' : serverOk ? 'bg-emerald-500' : ping.error ? 'bg-destructive' : 'bg-muted-foreground/50'}`}
              />
              <span className="text-sm">
                {ping.isPending ? 'Pinging…' :
                  serverOk ? 'Server reachable' :
                  ping.error ? 'Ping failed' : 'Not checked'}
              </span>
            </div>
            <Button size="sm" onClick={() => ping.mutate()} disabled={ping.isPending}>
              {ping.isPending ? 'Pinging…' : 'Ping /healthz'}
            </Button>
          </div>

          {ping.data ? (
            <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
              <InfoLine label="Status" value={ping.data.status} mono />
              <InfoLine label="Service" value={ping.data.service} mono />
              <InfoLine label="Server time" value={new Date(ping.data.timestamp).toLocaleString()} />
              <InfoLine label="Client time" value={lastPingAt ?? '—'} />
            </div>
          ) : null}

          {ping.error ? <ErrorView error={ping.error} /> : null}
        </div>
      </SettingsSection>

      <SettingsSection
        title="Danger zone"
        description="Irreversible actions on local storage. Will NOT delete anything on the backend."
        tone="destructive"
      >
        <Row
          label="Wipe local data"
          hint="Deletes all IndexedDB databases (agents, wallets, history, sessions) and clears localStorage."
          action={
            <Button
              size="sm"
              variant="destructive"
              onClick={() => { void onWipe() }}
            >
              {confirmWipe ? 'Click to confirm' : 'Wipe local data'}
            </Button>
          }
        />
      </SettingsSection>
    </div>
  )
}

function SettingsSection({
  title,
  description,
  tone,
  children,
}: {
  title: string
  description?: string
  tone?: 'destructive'
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <Card className={`p-6 ${tone === 'destructive' ? 'border-destructive/40 bg-destructive/5' : ''}`}>
      <div className="mb-4">
        <h2 className={`text-lg font-semibold ${tone === 'destructive' ? 'text-destructive' : ''}`}>{title}</h2>
        {description ? <p className="text-xs text-muted-foreground mt-1">{description}</p> : null}
      </div>
      <div className="space-y-4">
        {children}
      </div>
    </Card>
  )
}

function Row({
  label,
  hint,
  action,
}: {
  label: string
  hint?: string
  action: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="flex items-start justify-between gap-4 flex-wrap border-t border-border first:border-0 first:pt-0 pt-4">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">{label}</div>
        {hint ? <div className="text-xs text-muted-foreground mt-0.5">{hint}</div> : null}
      </div>
      <div className="flex-shrink-0">{action}</div>
    </div>
  )
}

function InfoLine({ label, value, mono = false }: { label: string; value: string; mono?: boolean }): React.JSX.Element {
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-[10px] text-muted-foreground w-24 flex-shrink-0">{label}</span>
      <span className={`text-xs ${mono ? 'font-mono' : ''} truncate`}>{value}</span>
    </div>
  )
}
