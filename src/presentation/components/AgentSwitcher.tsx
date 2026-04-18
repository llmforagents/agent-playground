import { useMemo } from 'react'
import { useAgents } from '@/presentation/hooks/useAgents'
import { useAppStore } from '@/presentation/hooks/useAppStore'
import { AgentId } from '@/domain/branded'

export function AgentSwitcher() {
  const { listQuery } = useAgents()
  const active = useAppStore((s) => s.activeAgentId)
  const setActive = useAppStore((s) => s.setActiveAgent)

  const agents = listQuery.data ?? []
  const activeAgent = useMemo(() => agents.find((a) => a.id === active), [agents, active])

  return (
    <div className="flex items-center gap-2 min-w-0">
      <span className="hidden sm:inline text-xs text-muted-foreground flex-shrink-0">Agent</span>
      <div className="relative flex items-center min-w-0 flex-1 sm:flex-initial">
        {activeAgent ? (
          <span
            className="absolute left-2.5 size-2 rounded-full pointer-events-none"
            style={{ background: activeAgent.color }}
          />
        ) : null}
        <select
          value={active ?? ''}
          onChange={(e) => setActive(e.target.value ? AgentId(e.target.value) : undefined)}
          className={`h-9 w-full max-w-[12rem] sm:max-w-none rounded-lg border border-border bg-background text-sm pr-8 outline-none focus:ring-3 focus:ring-ring/50 transition-colors ${activeAgent ? 'pl-6' : 'pl-2.5'} ${agents.length === 0 ? 'text-muted-foreground' : ''}`}
        >
          <option value="">{agents.length === 0 ? 'No agents' : '— none —'}</option>
          {agents.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
      </div>
    </div>
  )
}
