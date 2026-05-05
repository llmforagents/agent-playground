import { useState } from 'react'
import {
  type CouncilConfig,
  COUNCIL_EXPENSIVE_THRESHOLD_CENTS,
  DEFAULT_COUNCIL_CONFIG,
  estimateCouncilCostCents,
} from '@/domain/council'
import { Model } from '@/domain/branded'
import { useT } from '@/presentation/hooks/useT'
import { Button } from '@/presentation/components/ui/button'
import { Textarea } from '@/presentation/components/ui/textarea'
import { Input } from '@/presentation/components/ui/input'
import { Label } from '@/presentation/components/ui/label'

type Props = Readonly<{
  disabled: boolean
  onStart: (args: { config: CouncilConfig; userTask: string }) => void
}>

export function CouncilSetup({ disabled, onStart }: Props) {
  const t = useT()
  const [task, setTask] = useState('')
  const [config, setConfig] = useState<CouncilConfig>(DEFAULT_COUNCIL_CONFIG)

  const estimatedCents = estimateCouncilCostCents(config)
  const isExpensive = estimatedCents >= COUNCIL_EXPENSIVE_THRESHOLD_CENTS

  const handleStart = (): void => {
    if (!task.trim()) return
    if (isExpensive) {
      const ok = window.confirm(
        t('council.expensiveConfirm', { cost: (estimatedCents / 100).toFixed(2) }),
      )
      if (!ok) return
    }
    onStart({ config, userTask: task })
  }

  const updateDrafter = (idx: number, value: string): void => {
    const next = config.drafters.slice() as Array<ReturnType<typeof Model>>
    if (!value) return
    next[idx] = Model(value)
    setConfig({ ...config, drafters: next })
  }

  return (
    <div className="space-y-4">
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

      <div className="space-y-2">
        <Label>{t('council.draftersLabel')}</Label>
        {config.drafters.map((m, i) => (
          <Input
            key={i}
            value={String(m)}
            onChange={(e) => updateDrafter(i, e.target.value)}
            disabled={disabled}
            spellCheck={false}
          />
        ))}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="council-chairman">{t('council.chairmanLabel')}</Label>
        <Input
          id="council-chairman"
          value={String(config.chairman)}
          onChange={(e) =>
            e.target.value && setConfig({ ...config, chairman: Model(e.target.value) })
          }
          disabled={disabled}
          spellCheck={false}
        />
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
