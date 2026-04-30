import { detectReasoningFamily, type Effort, type ReasoningFamily } from '@/domain/reasoning'
import { useT } from '@/presentation/hooks/useT'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/presentation/components/ui/select'

type Props = Readonly<{
  model: string
  value: Effort
  onChange: (next: Effort) => void
}>

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
    <div
      className="flex items-stretch h-9 rounded-lg border border-border bg-background overflow-hidden"
      title={t(TOOLTIP_BY_FAMILY[family])}
    >
      <span className="px-3 flex items-center text-xs font-medium text-foreground">
        {t('chat.effort.label')}
      </span>
      <div className="border-l border-border" />
      <Select value={value} onValueChange={(v) => onChange(v as Effort)}>
        <SelectTrigger
          size="sm"
          className="h-full !border-0 !rounded-none shadow-none focus-visible:!ring-0 focus-visible:!border-0 px-3 min-w-[5rem] bg-transparent text-xs"
          aria-label={t('chat.effort.label')}
        >
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
