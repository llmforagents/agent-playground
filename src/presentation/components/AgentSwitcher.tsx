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

const NONE_VALUE = '__none__'

export function AgentSwitcher() {
  const t = useT()
  const { listQuery } = useAgents()
  const active = useAppStore((s) => s.activeAgentId)
  const setActive = useAppStore((s) => s.setActiveAgent)

  const agents = listQuery.data ?? []
  const activeAgent = agents.find((a) => a.id === active)
  const disabled = agents.length === 0
  const placeholder = disabled ? t('topbar.noAgents') : t('topbar.noneSelected')

  return (
    <div className="flex items-center gap-2 min-w-0">
      <span className="hidden sm:inline text-xs text-muted-foreground flex-shrink-0">
        {t('topbar.agent')}
      </span>
      <Select
        value={active ?? NONE_VALUE}
        onValueChange={(v) => setActive(v === NONE_VALUE ? undefined : AgentId(v))}
        disabled={disabled}
      >
        <SelectTrigger
          size="sm"
          className="h-9 min-w-0 flex-1 sm:flex-initial max-w-[12rem] sm:max-w-none sm:min-w-[14rem]"
          aria-label={t('topbar.agent')}
        >
          <div className="flex items-center gap-2 min-w-0">
            {activeAgent ? (
              <span
                className="size-2 rounded-full flex-shrink-0"
                style={{ background: activeAgent.color }}
                aria-hidden
              />
            ) : null}
            <SelectValue placeholder={placeholder} />
          </div>
        </SelectTrigger>
        <SelectContent>
          {agents.length > 0 ? (
            agents.map((a) => (
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
            ))
          ) : (
            <SelectItem value={NONE_VALUE} disabled>
              {t('topbar.noAgents')}
            </SelectItem>
          )}
        </SelectContent>
      </Select>
    </div>
  )
}
