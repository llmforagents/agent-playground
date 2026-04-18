import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Button } from '@/presentation/components/ui/button'
import { Card } from '@/presentation/components/ui/card'
import { ErrorView } from '@/presentation/components/ErrorView'
import { useAppStore } from '@/presentation/hooks/useAppStore'
import { useAppContainer } from '@/presentation/hooks/useAppContainer'
import { useT } from '@/presentation/hooks/useT'
import { LOCALES, LOCALE_LABELS, type Locale } from '@/domain/i18n'
import type { HealthzResponse } from '@/infrastructure/schemas/rest'

export function Settings() {
  const t = useT()
  const theme = useAppStore((s) => s.theme)
  const toggleTheme = useAppStore((s) => s.toggleTheme)
  const locale = useAppStore((s) => s.locale)
  const setLocale = useAppStore((s) => s.setLocale)
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
      toast.success(t('settings.wiped'))
      setTimeout(() => window.location.reload(), 500)
    } catch (e) {
      toast.error(t('settings.wipeFailed'), { description: e instanceof Error ? e.message : String(e) })
      setConfirmWipe(false)
    }
  }

  const serverOk = ping.data?.status === 'ok'

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <SettingsSection
        title={t('settings.appearance')}
        description={t('settings.appearanceDesc')}
      >
        <Row
          label={t('settings.theme')}
          hint={t('settings.themeHint')}
          action={
            <div className="rounded-lg border border-border bg-muted/30 p-1 grid grid-cols-2 gap-1">
              {(['light', 'dark'] as const).map((th) => (
                <button
                  key={th}
                  type="button"
                  onClick={() => { if (theme !== th) toggleTheme() }}
                  className={`py-1.5 px-6 text-sm rounded-md transition-colors ${theme === th ? 'bg-foreground/10 text-foreground shadow-sm font-medium' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  {th === 'light' ? t('settings.light') : t('settings.dark')}
                </button>
              ))}
            </div>
          }
        />
        <Row
          label={t('settings.language')}
          hint={t('settings.languageHint')}
          action={
            <div className="rounded-lg border border-border bg-muted/30 p-1 flex">
              {LOCALES.map((l: Locale) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => setLocale(l)}
                  className={`py-1.5 px-4 text-sm rounded-md transition-colors ${locale === l ? 'bg-foreground/10 text-foreground shadow-sm font-medium' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  {LOCALE_LABELS[l]}
                </button>
              ))}
            </div>
          }
        />
        <Row
          label={t('settings.mainnetBanner')}
          hint={ack ? t('settings.mainnetAckYes') : t('settings.mainnetAckNo')}
          action={
            <Button
              size="sm"
              variant="secondary"
              onClick={() => { useAppStore.setState({ mainnetBannerAck: false }) }}
              disabled={!ack}
            >
              {ack ? t('settings.mainnetReset') : t('settings.mainnetAlready')}
            </Button>
          }
        />
      </SettingsSection>

      <SettingsSection
        title={t('settings.health')}
        description={t('settings.healthDesc')}
      >
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <span
                className={`size-2 rounded-full ${ping.isPending ? 'bg-amber-500 animate-pulse' : serverOk ? 'bg-emerald-500' : ping.error ? 'bg-destructive' : 'bg-muted-foreground/50'}`}
              />
              <span className="text-sm">
                {ping.isPending ? t('settings.healthPinging') :
                  serverOk ? t('settings.healthReachable') :
                  ping.error ? t('settings.healthFailed') : t('settings.healthUnknown')}
              </span>
            </div>
            <Button size="sm" onClick={() => ping.mutate()} disabled={ping.isPending}>
              {ping.isPending ? t('settings.healthPinging') : t('settings.healthPing')}
            </Button>
          </div>

          {ping.data ? (
            <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
              <InfoLine label={t('settings.healthStatus')} value={ping.data.status} mono />
              <InfoLine label={t('settings.healthService')} value={ping.data.service} mono />
              <InfoLine label={t('settings.healthServerTime')} value={new Date(ping.data.timestamp).toLocaleString()} />
              <InfoLine label={t('settings.healthClientTime')} value={lastPingAt ?? '—'} />
            </div>
          ) : null}

          {ping.error ? <ErrorView error={ping.error} /> : null}
        </div>
      </SettingsSection>

      <SettingsSection
        title={t('settings.danger')}
        description={t('settings.dangerDesc')}
        tone="destructive"
      >
        <Row
          label={t('settings.wipeLocal')}
          hint={t('settings.wipeHint')}
          action={
            <Button
              size="sm"
              variant="destructive"
              onClick={() => { void onWipe() }}
            >
              {confirmWipe ? t('agents.deleteConfirm') : t('settings.wipeLocal')}
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
