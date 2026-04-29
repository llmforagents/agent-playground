import { useEffect, useRef, useState } from 'react'
import { ChevronDownIcon, ChevronRightIcon } from 'lucide-react'
import { useT } from '@/presentation/hooks/useT'

type Props = {
  reasoning: string
  isStreaming: boolean
}

export function ReasoningBlock({ reasoning, isStreaming }: Props): React.JSX.Element | null {
  const t = useT()
  const [expanded, setExpanded] = useState<boolean>(isStreaming)
  const [elapsedMs, setElapsedMs] = useState(0)
  const startRef = useRef<number | null>(null)
  const prevStreamingRef = useRef(isStreaming)

  // Auto-collapse when streaming flips false (and the user hasn't manually toggled
  // since the stream started). Simplest behavior: collapse once on the streaming → done transition.
  useEffect(() => {
    if (prevStreamingRef.current && !isStreaming) {
      setExpanded(false)
    }
    prevStreamingRef.current = isStreaming
  }, [isStreaming])

  // Live timer while streaming.
  useEffect(() => {
    if (!isStreaming) { startRef.current = null; setElapsedMs(0); return }
    if (startRef.current === null) startRef.current = Date.now()
    setElapsedMs(Date.now() - startRef.current)
    const id = setInterval(() => {
      if (startRef.current !== null) setElapsedMs(Date.now() - startRef.current)
    }, 500)
    return () => clearInterval(id)
  }, [isStreaming])

  if (!reasoning && !isStreaming) return null

  const elapsedSec = Math.floor(elapsedMs / 1000)
  const headerLabel = isStreaming
    ? `${t('chat.reasoning.label')} · ${t('chat.reasoning.thinking')} ${t('chat.reasoning.elapsed', { sec: elapsedSec })}`
    : t('chat.reasoning.label')

  return (
    <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 max-w-[85%] overflow-hidden mb-2">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-amber-500/10 transition-colors text-amber-700 dark:text-amber-400"
      >
        {expanded
          ? <ChevronDownIcon className="size-3.5 flex-shrink-0" />
          : <ChevronRightIcon className="size-3.5 flex-shrink-0" />}
        <span className="font-medium">{headerLabel}</span>
      </button>
      {expanded ? (
        <div className="px-3 py-2 border-t border-amber-500/20 max-h-64 overflow-auto">
          <pre className="font-mono text-[11px] text-foreground whitespace-pre-wrap break-words">
            {reasoning || <span className="italic text-muted-foreground">{t('chat.reasoning.empty')}</span>}
          </pre>
        </div>
      ) : null}
    </div>
  )
}
