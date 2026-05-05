import { useT } from '@/presentation/hooks/useT'
import type { CouncilSnapshot } from '@/presentation/hooks/useCouncilStore'
import type { CouncilPlan } from '@/domain/council'

const PLAN_EMOJI: Record<CouncilPlan, string> = {
  lite: '🪶',
  pro: '⚡',
  power: '🚀',
}

type Props = Readonly<{
  runs: ReadonlyArray<CouncilSnapshot>
  activeRunId: string | null
  onSelect: (runId: string) => void
  onDelete: (runId: string) => void
  onClearAll: () => void
}>

export function CouncilHistory({ runs, activeRunId, onSelect, onDelete, onClearAll }: Props) {
  const t = useT()

  if (runs.length === 0) return null

  return (
    <details className="rounded-lg border border-border bg-muted/20" open>
      <summary className="cursor-pointer px-4 py-2.5 text-sm font-medium select-none flex items-center justify-between gap-2">
        <span>
          {t('council.history')} <span className="text-muted-foreground">({runs.length})</span>
        </span>
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            if (window.confirm(t('council.clearAllConfirm'))) onClearAll()
          }}
          className="text-xs text-muted-foreground hover:text-destructive transition-colors"
        >
          {t('council.clearAll')}
        </button>
      </summary>
      <div className="border-t border-border divide-y divide-border">
        {runs.map((run) => {
          const isActive = run.id === activeRunId
          return (
            <div
              key={run.id}
              className={`flex items-center gap-2 px-3 py-2 text-xs transition-colors ${
                isActive ? 'bg-foreground/10' : 'hover:bg-accent/40'
              }`}
            >
              <button
                type="button"
                onClick={() => onSelect(run.id)}
                className="flex-1 min-w-0 text-left flex items-center gap-2"
              >
                <span className="text-base flex-shrink-0">{PLAN_EMOJI[run.plan]}</span>
                <span className="font-mono text-muted-foreground flex-shrink-0">
                  {new Date(run.timestamp).toLocaleString(undefined, {
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
                <span className="truncate flex-1 min-w-0" title={run.userTask}>
                  {run.userTask}
                </span>
                {run.error ? (
                  <span className="text-destructive flex-shrink-0">⚠</span>
                ) : null}
                <span className="font-mono text-muted-foreground flex-shrink-0">
                  ${(run.totalCostCents / 100).toFixed(4)}
                </span>
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  if (window.confirm(t('council.deleteRunConfirm'))) onDelete(run.id)
                }}
                className="text-muted-foreground hover:text-destructive transition-colors flex-shrink-0 px-1"
                aria-label={t('council.deleteRun')}
                title={t('council.deleteRun')}
              >
                ×
              </button>
            </div>
          )
        })}
      </div>
    </details>
  )
}
