import { useState } from 'react'
import {
  type CouncilConfig,
  type CouncilPlan,
  COUNCIL_EXPENSIVE_THRESHOLD_CENTS,
  COUNCIL_PLANS,
  COUNCIL_PLAN_ORDER,
  DEFAULT_COUNCIL_PLAN,
  estimateCouncilCostCents,
} from '@/domain/council'
import { Model } from '@/domain/branded'
import { useT } from '@/presentation/hooks/useT'
import { useModels } from '@/presentation/hooks/useModels'
import { Button } from '@/presentation/components/ui/button'
import { Textarea } from '@/presentation/components/ui/textarea'
import { Label } from '@/presentation/components/ui/label'
import { ModelPicker } from '@/presentation/components/ModelPicker'
import type { MessageKey } from '@/domain/i18n'

type Props = Readonly<{
  disabled: boolean
  onStart: (args: { config: CouncilConfig; userTask: string; plan: CouncilPlan }) => void
}>

const PLAN_LABEL_KEY: Record<CouncilPlan, MessageKey> = {
  lite: 'council.planLite',
  pro: 'council.planPro',
  power: 'council.planPower',
}

const PLAN_HINT_KEY: Record<CouncilPlan, MessageKey> = {
  lite: 'council.planLiteHint',
  pro: 'council.planProHint',
  power: 'council.planPowerHint',
}

export function CouncilSetup({ disabled, onStart }: Props) {
  const t = useT()
  const models = useModels()
  const [task, setTask] = useState('')
  const [plan, setPlan] = useState<CouncilPlan>(DEFAULT_COUNCIL_PLAN)
  const [config, setConfig] = useState<CouncilConfig>(COUNCIL_PLANS[DEFAULT_COUNCIL_PLAN])

  const modelList = models.data?.models ?? []
  const estimatedCents = estimateCouncilCostCents(config)
  const isExpensive = estimatedCents >= COUNCIL_EXPENSIVE_THRESHOLD_CENTS

  const selectPlan = (next: CouncilPlan): void => {
    setPlan(next)
    setConfig(COUNCIL_PLANS[next])
  }

  const handleStart = (): void => {
    if (!task.trim()) return
    if (isExpensive) {
      const ok = window.confirm(
        t('council.expensiveConfirm', { cost: (estimatedCents / 100).toFixed(2) }),
      )
      if (!ok) return
    }
    onStart({ config, userTask: task, plan })
  }

  const updateDrafter = (idx: number, slug: string): void => {
    if (!slug) return
    const next = config.drafters.slice() as Array<ReturnType<typeof Model>>
    next[idx] = Model(slug)
    setConfig({ ...config, drafters: next })
  }

  const updateChairman = (slug: string): void => {
    if (!slug) return
    setConfig({ ...config, chairman: Model(slug) })
  }

  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <Label>{t('council.planLabel')}</Label>
        <div className="rounded-lg border border-border bg-muted/30 p-1 grid grid-cols-3 gap-1">
          {COUNCIL_PLAN_ORDER.map((p) => {
            const isActive = plan === p
            return (
              <button
                key={p}
                type="button"
                onClick={() => selectPlan(p)}
                disabled={disabled}
                className={`flex flex-col items-center gap-0.5 py-2 text-sm rounded-md transition-colors disabled:opacity-50 disabled:pointer-events-none ${
                  isActive
                    ? 'bg-foreground/15 text-foreground shadow-sm font-medium ring-1 ring-foreground/10'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                }`}
              >
                <span className="leading-tight">{t(PLAN_LABEL_KEY[p])}</span>
                <span
                  className={`text-[10px] leading-tight ${isActive ? 'text-foreground/70' : 'text-muted-foreground/80'}`}
                >
                  {t(PLAN_HINT_KEY[p])}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="council-task">{t('council.taskLabel')}</Label>
        <Textarea
          id="council-task"
          value={task}
          onChange={(e) => setTask(e.target.value)}
          placeholder={t('council.taskPlaceholder')}
          rows={4}
          disabled={disabled}
        />
      </div>

      <div className="space-y-3">
        <Label>{t('council.draftersLabel')}</Label>
        {config.drafters.map((m, i) => (
          <div key={i} className="rounded-lg border border-border bg-muted/20 p-3">
            <div className="text-xs font-mono text-muted-foreground mb-2">
              {t('council.drafter')} {(['A', 'B', 'C'] as const)[i] ?? '?'}
            </div>
            <ModelPicker
              models={modelList}
              value={String(m)}
              onChange={(slug) => updateDrafter(i, slug)}
            />
          </div>
        ))}
      </div>

      <div className="space-y-2">
        <Label>{t('council.chairmanLabel')}</Label>
        <div className="rounded-lg border border-border bg-muted/20 p-3">
          <ModelPicker
            models={modelList}
            value={String(config.chairman)}
            onChange={updateChairman}
          />
        </div>
      </div>

      <div className="text-sm text-muted-foreground">
        {t('council.estimatedCost', { cost: (estimatedCents / 100).toFixed(3) })}
        {isExpensive ? (
          <span className="ml-2 text-destructive font-medium">
            {t('council.expensiveWarning')}
          </span>
        ) : null}
      </div>

      <Button onClick={handleStart} disabled={disabled || !task.trim()} className="w-full sm:w-auto">
        {t('council.startButton')}
      </Button>
    </div>
  )
}
