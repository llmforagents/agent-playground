import { useEffect, useRef, useState } from 'react'
import {
  EyeIcon, WrenchIcon, SearchIcon, GlobeIcon, XIcon, ImageIcon,
  SparklesIcon, BellIcon, DatabaseIcon, BoxesIcon, NetworkIcon, BrainIcon, CoinsIcon, FileTextIcon,
} from 'lucide-react'
import { CHAT_TOOLS, type ChatToolDef } from '@/domain/chatTools'
import { Switch } from '@/presentation/components/ui/switch'
import { useT } from '@/presentation/hooks/useT'

type Props = Readonly<{
  toolsOn: boolean
  onToolsOnChange: (next: boolean) => void
}>

type TFn = ReturnType<typeof useT>

type ToolCategory = ChatToolDef['category']

type ToolGroupDef = Readonly<{
  cat: ToolCategory
  title: (t: TFn) => string
  icon: React.ReactNode
}>

const TOOL_GROUPS: readonly ToolGroupDef[] = [
  { cat: 'search', title: (t) => t('chat.toolsSearch'), icon: <SearchIcon className="size-3.5" /> },
  { cat: 'scraper', title: (t) => t('chat.toolsWebScraper'), icon: <GlobeIcon className="size-3.5" /> },
  { cat: 'image', title: (t) => t('chat.toolsImages'), icon: <ImageIcon className="size-3.5" /> },
  { cat: 'ai', title: () => 'AI', icon: <SparklesIcon className="size-3.5" /> },
  { cat: 'notify', title: () => 'Notify', icon: <BellIcon className="size-3.5" /> },
  { cat: 'data', title: () => 'Data', icon: <DatabaseIcon className="size-3.5" /> },
  { cat: 'vector', title: () => 'Vector', icon: <BoxesIcon className="size-3.5" /> },
  { cat: 'web_crawl', title: () => 'Web Crawl', icon: <NetworkIcon className="size-3.5" /> },
  { cat: 'memory', title: () => 'Memory', icon: <BrainIcon className="size-3.5" /> },
  { cat: 'web3', title: () => 'Web3', icon: <CoinsIcon className="size-3.5" /> },
  { cat: 'document', title: () => 'Document', icon: <FileTextIcon className="size-3.5" /> },
] as const

function renderToolGroups(t: TFn): React.JSX.Element {
  return (
    <>
      {TOOL_GROUPS.map((g) => {
        const tools = CHAT_TOOLS.filter((x) => x.category === g.cat)
        return tools.length > 0
          ? <ToolGroup key={g.cat} title={g.title(t)} icon={g.icon} tools={tools} />
          : null
      })}
    </>
  )
}

export function ToolsCompound({ toolsOn, onToolsOnChange }: Props): React.JSX.Element {
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

  return (
    <div ref={rootRef} className="relative">
      <div
        className="flex items-stretch h-9 rounded-lg border border-border bg-background overflow-visible"
        title={toolsOn ? t('chat.toolsOnHint') : t('chat.toolsOffHint')}
      >
        <span className="px-3 flex items-center text-xs font-medium text-foreground select-none">
          {t('chat.toolsLabel')}
        </span>
        <div className="border-l border-border" />
        <label className="px-3 flex items-center cursor-pointer">
          <Switch
            checked={toolsOn}
            onCheckedChange={onToolsOnChange}
            size="sm"
            className="data-checked:bg-emerald-500 dark:data-checked:bg-emerald-500"
            aria-label={toolsOn ? t('chat.toolsOn') : t('chat.toolsOff')}
          />
        </label>
        <div className="border-l border-border" />
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className={`px-3 flex items-center gap-1.5 text-xs transition-colors rounded-r-lg ${
            open
              ? 'bg-accent text-accent-foreground'
              : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
          }`}
          title={t('chat.seeTools')}
          aria-label={t('chat.seeTools')}
        >
          <EyeIcon className="size-3.5" />
          <span className="font-medium tabular-nums">{CHAT_TOOLS.length}</span>
        </button>
      </div>

      {open ? (
        <div className="hidden sm:block absolute z-40 mt-1 left-0 w-[min(26rem,calc(100vw-2rem))] rounded-lg border border-border bg-popover text-popover-foreground shadow-lg overflow-hidden">
          <ToolsList t={t} />
        </div>
      ) : null}

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
              {renderToolGroups(t)}
            </div>
            <div className="px-3 py-2 border-t border-border bg-muted/20 text-[11px] text-muted-foreground flex items-center justify-between">
              <span>{t('chat.toolsBilled')}</span>
              <span>{t('chat.toolsMaxIter')}</span>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function ToolsList({ t }: { t: TFn }): React.JSX.Element {
  return (
    <>
      <div className="px-3 py-2 border-b border-border">
        <div className="text-sm font-semibold">{t('chat.availableTools')}</div>
        <p className="text-xs text-muted-foreground mt-0.5">{t('chat.toolsSubtitle')}</p>
      </div>

      <div className="max-h-[28rem] overflow-auto">
        {renderToolGroups(t)}
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
        {tools.map((tool) => (
          <li key={tool.openai.function.name} className="px-3 py-2 hover:bg-muted/40 transition-colors">
            <div className="flex items-start gap-2">
              <WrenchIcon className="size-3.5 text-muted-foreground mt-0.5 flex-shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-sm font-mono font-medium break-all">{tool.openai.function.name}</span>
                  <span className="text-[10px] tabular-nums text-muted-foreground flex-shrink-0">{tool.costPerCall}/call</span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
                  {tool.openai.function.description}
                </p>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
