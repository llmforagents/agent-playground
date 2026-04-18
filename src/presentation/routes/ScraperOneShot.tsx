import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Card } from '@/presentation/components/ui/card'
import { Button } from '@/presentation/components/ui/button'
import { Input } from '@/presentation/components/ui/input'
import { Textarea } from '@/presentation/components/ui/textarea'
import { ErrorView } from '@/presentation/components/ErrorView'
import { JsonView } from '@/presentation/components/JsonView'
import { ProxyTierSelector } from '@/presentation/components/ProxyTierSelector'
import { CopyButton } from '@/presentation/components/CopyButton'
import { useAppContainer } from '@/presentation/hooks/useAppContainer'
import { useActiveAgent } from '@/presentation/hooks/useActiveAgent'
import type { ProxyTier, OneShotTool } from '@/domain/scraper'
import { ONE_SHOT_TOOLS } from '@/domain/scraper'
import { useT } from '@/presentation/hooks/useT'
import type { MessageKey } from '@/domain/i18n'
import type { McpToolResult } from '@/infrastructure/schemas/mcp'

const TOOL_DESCRIPTION_KEYS: Record<OneShotTool, MessageKey> = {
  fetch_html: 'scraper.descFetchHtml',
  markdown: 'scraper.descMarkdown',
  links: 'scraper.descLinks',
  screenshot: 'scraper.descScreenshot',
  pdf: 'scraper.descPdf',
  extract: 'scraper.descExtract',
}

const TOOL_COSTS: Record<OneShotTool, Record<ProxyTier, number>> = {
  fetch_html: { none: 0.0007, datacenter: 0.0009, residential: 0.0037 },
  markdown:   { none: 0.0010, datacenter: 0.0012, residential: 0.0040 },
  links:      { none: 0.0007, datacenter: 0.0009, residential: 0.0037 },
  screenshot: { none: 0.0010, datacenter: 0.0012, residential: 0.0040 },
  pdf:        { none: 0.0012, datacenter: 0.0014, residential: 0.0042 },
  extract:    { none: 0.0012, datacenter: 0.0014, residential: 0.0042 },
}

function fmtCost(usd: number): string {
  return `$${usd.toFixed(4)}`
}

export function ScraperOneShot() {
  const t = useT()
  const agent = useActiveAgent()
  const container = useAppContainer()
  const [tool, setTool] = useState<OneShotTool>('fetch_html')
  const [url, setUrl] = useState('https://example.com')
  const [tier, setTier] = useState<ProxyTier>('none')
  const [selectorText, setSelectorText] = useState('')
  const [extractMap, setExtractMap] = useState('{\n  "title": "h1"\n}')

  const run = useMutation({
    mutationFn: async (): Promise<McpToolResult> => {
      if (!agent) throw new Error('no agent')
      const params = buildParams(tool, url, tier, selectorText, extractMap)
      const res = await container.useCases.callScraperTool(agent.id, agent.apiKey, tool, params)
      if (!res.ok) throw res.error
      return res.value
    },
  })

  if (!agent) return <p className="text-sm text-muted-foreground">{t('noAgent.select')}</p>
  const err = run.error

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Card className="p-6">
        <div className="text-center mb-4">
          <h2 className="text-lg font-semibold">{t('scraper.oneshotTitle')}</h2>
          <p className="text-xs text-muted-foreground mt-1">{t('scraper.oneshotSubtitle')}</p>
        </div>

        <div className="rounded-lg border border-border bg-muted/30 p-1 grid grid-cols-3 md:grid-cols-6 gap-1.5 mb-4">
          {ONE_SHOT_TOOLS.map((tl) => {
            const isActive = tool === tl
            return (
              <button
                key={tl}
                type="button"
                onClick={() => setTool(tl)}
                className={`py-2.5 px-3 text-sm rounded-md transition-colors text-center ${
                  isActive
                    ? 'bg-foreground/10 text-foreground shadow-sm font-medium'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {tl}
              </button>
            )
          })}
        </div>

        <p className="text-xs text-muted-foreground text-center mb-1">{t(TOOL_DESCRIPTION_KEYS[tool])}</p>
        <p className="text-xs text-muted-foreground text-center mb-4 tabular-nums">
          none <b className="text-foreground">{fmtCost(TOOL_COSTS[tool].none)}</b>
          <span className="mx-2">·</span>
          datacenter <b className="text-foreground">{fmtCost(TOOL_COSTS[tool].datacenter)}</b>
          <span className="mx-2">·</span>
          residential <b className="text-foreground">{fmtCost(TOOL_COSTS[tool].residential)}</b>
          <span className="ml-2 text-[10px] opacity-70">{t('scraper.perCall')}</span>
        </p>

        <div className="space-y-4">
          <div>
            <label className="text-xs text-muted-foreground block mb-1">{t('scraper.url')}</label>
            <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" />
          </div>

          <div>
            <label className="text-xs text-muted-foreground block mb-1">{t('scraper.proxyTier')}</label>
            <ProxyTierSelector value={tier} onChange={setTier} />
          </div>

          {(tool === 'markdown' || tool === 'screenshot') ? (
            <div>
              <label className="text-xs text-muted-foreground block mb-1">
                {t('scraper.selector')} <span className="normal-case text-muted-foreground/60">{t('scraper.optional')}</span>
              </label>
              <Input value={selectorText} onChange={(e) => setSelectorText(e.target.value)} placeholder="#main, article, .content" />
            </div>
          ) : null}

          {tool === 'extract' ? (
            <div>
              <label className="text-xs text-muted-foreground block mb-1">
                {t('scraper.selectors')} <span className="normal-case text-muted-foreground/60">{t('scraper.selectorsHint')}</span>
              </label>
              <Textarea
                value={extractMap}
                onChange={(e) => setExtractMap(e.target.value)}
                rows={5}
                className="font-mono text-xs"
              />
            </div>
          ) : null}

          <Button className="w-full" onClick={() => run.mutate()} disabled={run.isPending}>
            {run.isPending ? t('scraper.running') : t('scraper.run', { tool })}
          </Button>
          {err ? <ErrorView error={err} /> : null}
        </div>
      </Card>

      {run.data ? (
        <section>
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <h2 className="text-lg font-semibold">{t('scraper.result')}</h2>
            <CopyButton text={formatResultForCopy(tool, run.data)} label={t('scraper.copyResult')} size="sm" variant="secondary" />
          </div>
          <Card className="p-4">
            <Preview tool={tool} result={run.data} />
          </Card>
        </section>
      ) : null}
    </div>
  )
}

function buildParams(tool: OneShotTool, url: string, tier: ProxyTier, selectorText: string, extractMap: string): unknown {
  switch (tool) {
    case 'fetch_html': return { url, proxy_tier: tier }
    case 'markdown':   return selectorText ? { url, proxy_tier: tier, selector: selectorText } : { url, proxy_tier: tier }
    case 'links':      return { url, proxy_tier: tier }
    case 'screenshot': return selectorText ? { url, proxy_tier: tier, selector: selectorText } : { url, proxy_tier: tier }
    case 'pdf':        return { url, proxy_tier: tier }
    case 'extract': {
      let selectors: Record<string, string>
      try { selectors = JSON.parse(extractMap) as Record<string, string> } catch { selectors = {} }
      return { url, proxy_tier: tier, selectors }
    }
  }
}

function formatResultForCopy(tool: OneShotTool, result: McpToolResult): string {
  const first = result.content[0]
  if (first?.type === 'text' && (tool === 'markdown' || tool === 'fetch_html')) return first.text
  try { return JSON.stringify(result, null, 2) } catch { return String(result) }
}

function Preview({ tool, result }: { tool: OneShotTool; result: McpToolResult }) {
  const firstItem = result.content[0]
  if (!firstItem) return <JsonView value={result} />

  if (tool === 'screenshot' && firstItem.type === 'image') {
    return (
      <div className="overflow-auto rounded-lg border border-border bg-muted/20 p-2">
        <img
          src={`data:${firstItem.mimeType};base64,${firstItem.data}`}
          alt="screenshot"
          className="max-w-full h-auto mx-auto rounded"
        />
      </div>
    )
  }

  if (tool === 'pdf' && firstItem.type === 'resource' && firstItem.resource.blob) {
    return (
      <iframe
        src={`data:application/pdf;base64,${firstItem.resource.blob}`}
        className="w-full h-[70vh] rounded-lg border border-border"
        title="pdf-preview"
      />
    )
  }

  if (tool === 'markdown' && firstItem.type === 'text') {
    return (
      <pre className="text-sm font-mono bg-muted/40 text-foreground rounded-lg border border-border p-3 whitespace-pre-wrap overflow-auto max-h-[60vh]">
        {firstItem.text}
      </pre>
    )
  }

  if (tool === 'fetch_html' && firstItem.type === 'text') {
    return (
      <pre className="text-xs font-mono bg-muted/40 text-foreground rounded-lg border border-border p-3 whitespace-pre-wrap overflow-auto max-h-[60vh]">
        {firstItem.text}
      </pre>
    )
  }

  return <JsonView value={result} maxHeight="60vh" />
}
