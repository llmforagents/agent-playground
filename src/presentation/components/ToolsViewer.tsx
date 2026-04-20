import { useEffect, useRef, useState } from 'react'
import { EyeIcon, WrenchIcon, SearchIcon, GlobeIcon, XIcon, ImageIcon } from 'lucide-react'
import { CHAT_TOOLS, type ChatToolDef } from '@/domain/chatTools'
import { useT } from '@/presentation/hooks/useT'

export function ToolsViewer() {
  const t = useT()
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
  const imageTools = CHAT_TOOLS.filter((t) => t.category === 'image')

  return (
    <>
      <div ref={rootRef} className="relative">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className={`h-9 rounded-lg border px-3 text-xs flex items-center gap-1.5 transition-colors ${open ? 'border-primary bg-primary/10 text-foreground' : 'border-border bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground'}`}
          title={t('chat.seeTools')}
          aria-label={t('chat.seeTools')}
        >
          <EyeIcon className="size-3.5" />
          <span className="hidden sm:inline">{t('chat.viewTools')}</span>
          <span className="sm:hidden">{t('chat.toolsLabel')}</span>
          <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium text-foreground">{CHAT_TOOLS.length}</span>
        </button>

        {/* Desktop popover (≥ sm): absolute from trigger */}
        {open ? (
          <div className="hidden sm:block absolute z-40 mt-1 right-0 w-[min(26rem,calc(100vw-2rem))] rounded-lg border border-border bg-popover text-popover-foreground shadow-lg overflow-hidden">
            <ToolsList searchTools={searchTools} scraperTools={scraperTools} imageTools={imageTools} t={t} />
          </div>
        ) : null}
      </div>

      {/* Mobile overlay (< sm): fixed full-width bottom sheet */}
      {open ? (
        <div
          className="sm:hidden fixed inset-0 z-50 flex items-end bg-black/40"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-h-[80vh] rounded-t-xl border-t border-x border-border bg-popover text-popover-foreground shadow-lg overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-3 py-2 border-b border-border flex items-start gap-2">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold">{t('chat.availableTools')}</div>
                <p className="text-xs text-muted-foreground mt-0.5">{t('chat.toolsSubtitle')}</p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label={t('common.close')}
                className="flex-shrink-0 size-7 rounded-md hover:bg-muted flex items-center justify-center"
              >
                <XIcon className="size-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <ToolGroup title={t('chat.toolsSearch')} icon={<SearchIcon className="size-3.5" />} tools={searchTools} />
              <ToolGroup title={t('chat.toolsWebScraper')} icon={<GlobeIcon className="size-3.5" />} tools={scraperTools} />
              <ToolGroup title={t('chat.toolsImages')} icon={<ImageIcon className="size-3.5" />} tools={imageTools} />
            </div>
            <div className="px-3 py-2 border-t border-border bg-muted/20 text-[11px] text-muted-foreground flex items-center justify-between">
              <span>{t('chat.billed')}</span>
              <span>{t('chat.maxIter')}</span>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}

function ToolsList({ searchTools, scraperTools, imageTools, t }: { searchTools: readonly ChatToolDef[]; scraperTools: readonly ChatToolDef[]; imageTools: readonly ChatToolDef[]; t: ReturnType<typeof useT> }): React.JSX.Element {
  return (
    <>
      <div className="px-3 py-2 border-b border-border">
        <div className="text-sm font-semibold">{t('chat.availableTools')}</div>
        <p className="text-xs text-muted-foreground mt-0.5">{t('chat.toolsSubtitle')}</p>
      </div>

      <div className="max-h-[28rem] overflow-auto">
        <ToolGroup title={t('chat.toolsSearch')} icon={<SearchIcon className="size-3.5" />} tools={searchTools} />
        <ToolGroup title={t('chat.toolsWebScraper')} icon={<GlobeIcon className="size-3.5" />} tools={scraperTools} />
        <ToolGroup title={t('chat.toolsImages')} icon={<ImageIcon className="size-3.5" />} tools={imageTools} />
      </div>

      <div className="px-3 py-2 border-t border-border bg-muted/20 text-[11px] text-muted-foreground flex items-center justify-between">
        <span>{t('chat.toolsBilled')}</span>
        <span>{t('chat.toolsMaxIter')}</span>
      </div>
    </>
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
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-sm font-mono font-medium break-all">{t.openai.function.name}</span>
                  <span className="text-[10px] tabular-nums text-muted-foreground flex-shrink-0">{t.costPerCall}/call</span>
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
