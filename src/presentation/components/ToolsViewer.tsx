import { useEffect, useRef, useState } from 'react'
import { EyeIcon, WrenchIcon, SearchIcon, GlobeIcon } from 'lucide-react'
import { CHAT_TOOLS, type ChatToolDef } from '@/domain/chatTools'

export function ToolsViewer() {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    const onDocClick = (e: MouseEvent): void => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onEsc = (e: KeyboardEvent): void => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onEsc)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onEsc)
    }
  }, [open])

  const searchTools = CHAT_TOOLS.filter((t) => t.category === 'search')
  const scraperTools = CHAT_TOOLS.filter((t) => t.category === 'scraper')

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`h-9 rounded-lg border px-3 text-xs flex items-center gap-1.5 transition-colors ${open ? 'border-primary bg-primary/10 text-foreground' : 'border-border bg-background text-muted-foreground hover:text-foreground'}`}
        title="See available tools"
        aria-label="View available tools"
      >
        <EyeIcon className="size-3.5" />
        View tools
        <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium text-foreground">{CHAT_TOOLS.length}</span>
      </button>

      {open ? (
        <div className="absolute z-40 mt-1 right-0 w-[min(26rem,calc(100vw-2rem))] rounded-lg border border-border bg-popover text-popover-foreground shadow-lg overflow-hidden">
          <div className="px-3 py-2 border-b border-border">
            <div className="text-sm font-semibold">Available tools</div>
            <p className="text-xs text-muted-foreground mt-0.5">
              The agent decides when to call them based on your question.
            </p>
          </div>

          <div className="max-h-[28rem] overflow-auto">
            <ToolGroup title="Search" icon={<SearchIcon className="size-3.5" />} tools={searchTools} />
            <ToolGroup title="Web scraper" icon={<GlobeIcon className="size-3.5" />} tools={scraperTools} />
          </div>

          <div className="px-3 py-2 border-t border-border bg-muted/20 text-[11px] text-muted-foreground flex items-center justify-between">
            <span>Each call is billed individually</span>
            <span>Max 5 iterations per turn</span>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function ToolGroup({ title, icon, tools }: { title: string; icon: React.ReactNode; tools: readonly ChatToolDef[] }): React.JSX.Element {
  return (
    <div>
      <div className="flex items-center gap-2 px-3 pt-3 pb-1.5 text-[10px] font-medium text-muted-foreground">
        {icon}
        <span>{title}</span>
        <span className="ml-auto">{tools.length}</span>
      </div>
      <ul className="pb-2">
        {tools.map((t) => (
          <li key={t.openai.function.name} className="px-3 py-2 hover:bg-muted/40 transition-colors">
            <div className="flex items-start gap-2">
              <WrenchIcon className="size-3.5 text-muted-foreground mt-0.5 flex-shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-mono font-medium truncate">{t.openai.function.name}</span>
                  <span className="ml-auto text-[10px] tabular-nums text-muted-foreground flex-shrink-0">{t.costPerCall}/call</span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
                  {t.openai.function.description}
                </p>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
