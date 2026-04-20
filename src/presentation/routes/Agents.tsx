import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/presentation/components/ui/button'
import { Input } from '@/presentation/components/ui/input'
import { Card } from '@/presentation/components/ui/card'
import { ErrorView } from '@/presentation/components/ErrorView'
import { useAgents } from '@/presentation/hooks/useAgents'
import { useAppStore } from '@/presentation/hooks/useAppStore'
import { CopyButton } from '@/presentation/components/CopyButton'
import { useT } from '@/presentation/hooks/useT'
import type { Agent } from '@/domain/agent'
import type { AgentId } from '@/domain/branded'

function pickColor(seed: string): string {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0
  const hue = Math.abs(h) % 360
  return `hsl(${hue} 70% 50%)`
}

function maskKey(k: string): string {
  if (k.length <= 10) return k.replace(/./g, '•')
  return `${k.slice(0, 4)}${'•'.repeat(Math.max(4, k.length - 8))}${k.slice(-4)}`
}

export function Agents() {
  const t = useT()
  const { listQuery, register, remove } = useAgents()
  const active = useAppStore((s) => s.activeAgentId)
  const setActive = useAppStore((s) => s.setActiveAgent)
  const [name, setName] = useState('')

  const onCreate = async (): Promise<void> => {
    if (!name.trim()) return
    try {
      await register.mutateAsync({ name: name.trim(), color: pickColor(name) })
      toast.success(t('agents.registered'), { description: name.trim() })
      setName('')
    } catch {
      /* error shown via register.error */
    }
  }

  const err = register.error
  const list = listQuery.data ?? []

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Card className="p-6">
        <div className="text-center mb-4">
          <h2 className="text-lg font-semibold">{t('agents.registerTitle')}</h2>
          <p className="text-xs text-muted-foreground mt-1">{t('agents.registerSubtitle')}</p>
        </div>

        <div className="mx-auto max-w-xl space-y-3">
          <div>
            <label className="text-xs text-muted-foreground block mb-1">{t('agents.nameLabel')}</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('agents.nameHolder')}
              onKeyDown={(e) => { if (e.key === 'Enter' && name.trim()) void onCreate() }}
            />
          </div>
          <Button className="w-full" onClick={() => { void onCreate() }} disabled={register.isPending || !name.trim()}>
            {register.isPending ? t('agents.registering') : t('agents.register')}
          </Button>
          {err ? <ErrorView error={err} /> : null}
        </div>
      </Card>

      <section>
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h2 className="text-lg font-semibold">{t('agents.yourAgents')}</h2>
          <span className="text-xs text-muted-foreground">{t('agents.saved', { n: list.length })}</span>
        </div>

        {listQuery.isLoading ? (
          <Card className="p-6 text-center text-sm text-muted-foreground">{t('common.loading')}</Card>
        ) : list.length === 0 ? (
          <Card className="p-8 text-center">
            <p className="text-sm text-muted-foreground">{t('agents.empty')}</p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {list.map((a) => (
              <AgentCard
                key={a.id}
                agent={a}
                isActive={active === a.id}
                onActivate={() => setActive(a.id)}
                onDelete={() => remove.mutate(a.id)}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

function AgentCard({
  agent,
  isActive,
  onActivate,
  onDelete,
}: {
  agent: Agent
  isActive: boolean
  onActivate: () => void
  onDelete: () => void
}): React.JSX.Element {
  const t = useT()
  const [revealKey, setRevealKey] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const handleDelete = (): void => {
    if (!confirmDelete) { setConfirmDelete(true); setTimeout(() => setConfirmDelete(false), 3000); return }
    onDelete()
    setConfirmDelete(false)
  }

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-start gap-3">
        <div className="size-8 rounded-full flex-shrink-0" style={{ background: agent.color }} />
        <div className="min-w-0 flex-1">
          <div className="font-medium truncate">{agent.name}</div>
          <div className="text-[10px] text-muted-foreground font-mono truncate" title={agent.id}>
            {agent.id satisfies AgentId}
          </div>
        </div>
        {isActive ? (
          <span className="text-[10px] rounded-md bg-emerald-500/15 text-emerald-600 px-2 py-0.5 font-semibold">
            {t('agents.active').toLowerCase()}
          </span>
        ) : null}
      </div>

      <div>
        <div className="text-[10px] text-muted-foreground mb-1">{t('agents.apiKey')}</div>
        <input
          readOnly
          value={revealKey ? agent.apiKey : maskKey(agent.apiKey)}
          onFocus={(e) => { if (revealKey) e.currentTarget.select() }}
          className="w-full font-mono text-xs rounded-lg border border-border bg-muted/30 px-2.5 py-2 select-all outline-none focus:ring-3 focus:ring-ring/50"
        />
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <Button size="sm" variant="ghost" onClick={() => setRevealKey((v) => !v)}>
          {revealKey ? t('agents.hideKey') : t('agents.showKey')}
        </Button>
        <CopyButton text={agent.apiKey} label={t('agents.copyKey')} size="sm" variant="ghost" />
        <CopyButton text={agent.id} label={t('agents.copyId')} size="sm" variant="ghost" />
        <div className="flex-1" />
        {isActive ? null : (
          <Button size="sm" variant="secondary" onClick={onActivate}>
            {t('agents.activate')}
          </Button>
        )}
        <Button
          size="sm"
          onClick={handleDelete}
          className="bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/40"
        >
          {confirmDelete ? t('agents.deleteConfirm') : t('common.delete')}
        </Button>
      </div>
    </Card>
  )
}
