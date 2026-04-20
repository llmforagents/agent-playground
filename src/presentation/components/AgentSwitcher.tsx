import { Link } from 'react-router-dom'
import { PlusIcon } from 'lucide-react'
import { useAgents } from '@/presentation/hooks/useAgents'
import { useAppStore } from '@/presentation/hooks/useAppStore'
import { useT } from '@/presentation/hooks/useT'
import { AgentId } from '@/domain/branded'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/presentation/components/ui/select'

export function AgentSwitcher() {
  const t = useT()
  const { listQuery } = useAgents()
  const active = useAppStore((s) => s.activeAgentId)
  const setActive = useAppStore((s) => s.setActiveAgent)

  const agents = listQuery.data ?? []
  const activeAgent = agents.find((a) => a.id === active)

  const label = (
    <span className="hidden sm:inline text-xs text-muted-foreground flex-shrink-0">
      {t('topbar.agent')}
    </span>
  )

  // 0 agents → CTA to create one
  if (agents.length === 0) {
    return (
      <div className="flex items-center gap-2 min-w-0">
        {label}
        <Link
          to="/agents"
          className="h-9 inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          <PlusIcon className="size-3.5" />
          <span className="truncate">{t('topbar.noAgents')}</span>
        </Link>
      </div>
    )
  }

  // 1 agent → static badge linking to /agents (no meaningful switch)
  if (agents.length === 1) {
    const only = agents[0]!
    return (
      <div className="flex items-center gap-2 min-w-0">
        {label}
        <Link
          to="/agents"
          title={only.name}
          className="h-9 inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 text-sm hover:bg-muted transition-colors min-w-0 max-w-[14rem]"
        >
          <span
            className="size-2 rounded-full flex-shrink-0"
            style={{ background: only.color }}
            aria-hidden
          />
          <span className="truncate font-medium">{only.name}</span>
        </Link>
      </div>
    )
  }

  // 2+ agents → switcher
  const selectValue = activeAgent ? active : undefined
  return (
    <div className="flex items-center gap-2 min-w-0">
      {label}
      <Select
        {...(selectValue ? { value: selectValue } : {})}
        onValueChange={(v) => setActive(AgentId(v))}
      >
        <SelectTrigger
          size="sm"
          className="h-9 min-w-0 flex-1 sm:flex-initial max-w-[14rem] sm:max-w-none sm:min-w-[14rem]"
          aria-label={t('topbar.agent')}
        >
          <SelectValue placeholder={t('topbar.noneSelected')}>
            {activeAgent ? (
              <span className="flex items-center gap-2 min-w-0">
                <span
                  className="size-2 rounded-full flex-shrink-0"
                  style={{ background: activeAgent.color }}
                  aria-hidden
                />
                <span className="truncate">{activeAgent.name}</span>
              </span>
            ) : null}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {agents.map((a) => (
            <SelectItem key={a.id} value={a.id}>
              <span className="flex items-center gap-2">
                <span
                  className="size-2 rounded-full flex-shrink-0"
                  style={{ background: a.color }}
                  aria-hidden
                />
                {a.name}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
