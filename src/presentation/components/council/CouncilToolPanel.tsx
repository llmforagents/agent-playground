import { useState } from 'react'
import type { CouncilToolName } from '@/domain/council'
import type { ToolCallRecord } from './CouncilStream'
import { useT } from '@/presentation/hooks/useT'
import { ChevronRightIcon, ChevronDownIcon, SearchIcon, NewspaperIcon, FileIcon } from 'lucide-react'

type Props = Readonly<{
  toolCalls: ReadonlyArray<ToolCallRecord>
}>

// Return type inferred — TS6 + react-jsx infers JSX implicitly. Annotating with
// JSX.Element can break under verbatimModuleSyntax in some configs.
function iconFor(name: CouncilToolName) {
  if (name === 'google_search') return <SearchIcon className="size-3.5" />
  if (name === 'google_news') return <NewspaperIcon className="size-3.5" />
  return <FileIcon className="size-3.5" />
}

function countByTool(calls: ReadonlyArray<ToolCallRecord>): {
  search: number; news: number; fetch: number
} {
  let search = 0, news = 0, fetch = 0
  for (const c of calls) {
    if (c.toolName === 'google_search') search++
    else if (c.toolName === 'google_news') news++
    else if (c.toolName === 'fetch_html') fetch++
  }
  return { search, news, fetch }
}

function previewArgs(args: unknown): string {
  if (!args || typeof args !== 'object') return ''
  const a = args as Record<string, unknown>
  const primary =
    typeof a['q'] === 'string' ? a['q'] :
    typeof a['url'] === 'string' ? a['url'] :
    ''
  const s = String(primary)
  return s.length > 60 ? `${s.slice(0, 60)}…` : s
}

export function CouncilToolPanel({ toolCalls }: Props) {
  const t = useT()
  const [open, setOpen] = useState(false)

  if (toolCalls.length === 0) return null

  const { search, news, fetch } = countByTool(toolCalls)
  const counterText = t('council.toolsCounter', {
    search: String(search),
    news: String(news),
    fetch: String(fetch),
  })

  const listId = 'council-tool-panel-list'
  return (
    <div className="text-xs">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
        aria-expanded={open}
        aria-controls={listId}
      >
        {open ? <ChevronDownIcon className="size-3" aria-hidden="true" /> : <ChevronRightIcon className="size-3" aria-hidden="true" />}
        <span><span aria-hidden="true">🔎 </span>{counterText}</span>
      </button>
      {open ? (
        <ul id={listId} className="mt-1 space-y-0.5 border-l border-border pl-2">
          {toolCalls.map((tc) => (
            <li key={tc.callId} className="flex items-center gap-2 text-[11px]">
              <span aria-hidden="true">{iconFor(tc.toolName)}</span>
              <span className="font-mono text-muted-foreground truncate">
                {tc.toolName}("{previewArgs(tc.args)}")
              </span>
              {tc.result === null ? (
                <span className="text-muted-foreground" aria-label="pending">…</span>
              ) : tc.result.ok ? (
                <span className="text-emerald-600" aria-label="ok">✓</span>
              ) : (
                <span className="text-destructive" aria-label="failed">✗</span>
              )}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
