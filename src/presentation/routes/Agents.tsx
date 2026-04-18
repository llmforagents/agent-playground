import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/presentation/components/ui/button'
import { Input } from '@/presentation/components/ui/input'
import { Card } from '@/presentation/components/ui/card'
import { ErrorView } from '@/presentation/components/ErrorView'
import { useAgents } from '@/presentation/hooks/useAgents'
import { useAppStore } from '@/presentation/hooks/useAppStore'
import { CopyButton } from '@/presentation/components/CopyButton'
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
  const { listQuery, register, remove } = useAgents()
  const active = useAppStore((s) => s.activeAgentId)
  const setActive = useAppStore((s) => s.setActiveAgent)
  const [name, setName] = useState('')

  const onCreate = async (): Promise<void> => {
    if (!name.trim()) return
    try {
      await register.mutateAsync({ name: name.trim(), color: pickColor(name) })
      toast.success('Agent registered', { description: name.trim() })
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
          <h2 className="text-lg font-semibold">Register new agent</h2>
          <p className="text-xs text-muted-foreground mt-1">
            Each agent has its own API key, balance and history. Register one per use-case.
          </p>
        </div>

        <div className="mx-auto max-w-xl space-y-3">
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Name</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="my-agent"
              onKeyDown={(e) => { if (e.key === 'Enter' && name.trim()) void onCreate() }}
            />
          </div>
          <Button className="w-full" onClick={() => { void onCreate() }} disabled={register.isPending || !name.trim()}>
            {register.isPending ? 'Registering…' : 'Register agent'}
          </Button>
          {err ? <ErrorView error={err} /> : null}
        </div>
      </Card>

      <section>
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h2 className="text-lg font-semibold">Your agents</h2>
          <span className="text-xs text-muted-foreground">{list.length} saved</span>
        </div>

        {listQuery.isLoading ? (
          <Card className="p-6 text-center text-sm text-muted-foreground">Loading…</Card>
        ) : list.length === 0 ? (
          <Card className="p-8 text-center">
            <p className="text-sm text-muted-foreground">No agents yet. Register one above to begin testing.</p>
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
            active
          </span>
        ) : null}
      </div>

      <div>
        <div className="text-[10px] text-muted-foreground mb-1">API key</div>
        <input
          readOnly
          value={revealKey ? agent.apiKey : maskKey(agent.apiKey)}
          onFocus={(e) => { if (revealKey) e.currentTarget.select() }}
          className="w-full font-mono text-xs rounded-lg border border-border bg-muted/30 px-2.5 py-2 select-all outline-none focus:ring-3 focus:ring-ring/50"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="ghost" onClick={() => setRevealKey((v) => !v)}>
          {revealKey ? 'Hide key' : 'Show key'}
        </Button>
        <CopyButton text={agent.apiKey} label="Copy key" size="sm" variant="ghost" />
        <CopyButton text={agent.id} label="Copy ID" size="sm" variant="ghost" />
        <div className="flex-1" />
        <Button
          size="sm"
          variant={isActive ? 'default' : 'secondary'}
          onClick={onActivate}
          disabled={isActive}
        >
          {isActive ? 'Active' : 'Activate'}
        </Button>
        <Button size="sm" variant="destructive" onClick={handleDelete}>
          {confirmDelete ? 'Click to confirm' : 'Delete'}
        </Button>
      </div>
    </Card>
  )
}
