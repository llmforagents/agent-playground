import { useT } from '@/presentation/hooks/useT'
import { useCouncilStream } from '@/presentation/hooks/useCouncilStream'
import { useActiveAgent } from '@/presentation/hooks/useActiveAgent'
import { CouncilSetup } from '@/presentation/components/council/CouncilSetup'
import { CouncilStream } from '@/presentation/components/council/CouncilStream'
import { Card } from '@/presentation/components/ui/card'
import { Button } from '@/presentation/components/ui/button'

export function Council() {
  const t = useT()
  const agent = useActiveAgent()
  const { state, start, reset } = useCouncilStream()

  if (!agent) {
    return (
      <div className="mx-auto max-w-4xl">
        <Card className="p-6 text-center text-sm text-muted-foreground">
          {t('council.noAgent')}
        </Card>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">{t('council.title')}</h1>
        <p className="text-sm text-muted-foreground">{t('council.subtitle')}</p>
      </header>

      {!state.isRunning && state.events.length === 0 ? (
        <Card className="p-6">
          <CouncilSetup disabled={false} onStart={start} />
        </Card>
      ) : null}

      {(state.isRunning || state.events.length > 0) ? (
        <>
          <CouncilStream events={state.events} />
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <Button variant="outline" size="sm" onClick={reset} disabled={state.isRunning}>
              {t('council.newRun')}
            </Button>
            {state.totalCostCents > 0 ? (
              <span className="text-xs text-muted-foreground">
                {t('council.totalCost', { cost: (state.totalCostCents / 100).toFixed(4) })}
              </span>
            ) : null}
          </div>
        </>
      ) : null}

      {state.error ? (
        <Card className="p-4 border-destructive">
          <div className="text-sm text-destructive">{state.error}</div>
        </Card>
      ) : null}
    </div>
  )
}
