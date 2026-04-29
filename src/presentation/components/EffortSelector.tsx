import { detectReasoningFamily, type Effort, type ReasoningFamily } from '@/domain/reasoning'
import { useT } from '@/presentation/hooks/useT'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/presentation/components/ui/select'

type Props = {
  model: string
  value: Effort
  onChange: (next: Effort) => void
}

const ORDER: readonly Effort[] = ['off', 'low', 'medium', 'high'] as const

const TOOLTIP_BY_FAMILY: Readonly<Record<ReasoningFamily, 'chat.effort.tooltip' | 'chat.effort.tooltipBoolean' | 'chat.effort.tooltipTokenBudget'>> = {
  enum_effort:    'chat.effort.tooltip',
  boolean_toggle: 'chat.effort.tooltipBoolean',
  token_budget:   'chat.effort.tooltipTokenBudget',
}

export function EffortSelector({ model, value, onChange }: Props): React.JSX.Element | null {
  const t = useT()
  const family = detectReasoningFamily(model)
  if (family === undefined) return null

  const labelFor = (e: Effort): string => {
    switch (e) {
      case 'off':    return t('chat.effort.off')
      case 'low':    return t('chat.effort.low')
      case 'medium': return t('chat.effort.medium')
      case 'high':   return t('chat.effort.high')
    }
  }

  return (
    <div className="flex items-center gap-2 min-w-0" title={t(TOOLTIP_BY_FAMILY[family])}>
      <span className="hidden sm:inline text-xs text-muted-foreground flex-shrink-0">
        💭 {t('chat.effort.label')}
      </span>
      {/* SelectItem values come from ORDER (readonly Effort[]), so v is always a valid Effort. */}
      <Select value={value} onValueChange={(v) => onChange(v as Effort)}>
        <SelectTrigger size="sm" className="h-9 min-w-[6rem]" aria-label={t('chat.effort.label')}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {ORDER.map((e) => (
            <SelectItem key={e} value={e}>{labelFor(e)}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
