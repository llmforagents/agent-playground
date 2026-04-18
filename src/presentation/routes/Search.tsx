import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Card } from '@/presentation/components/ui/card'
import { Button } from '@/presentation/components/ui/button'
import { Input } from '@/presentation/components/ui/input'
import { ErrorView } from '@/presentation/components/ErrorView'
import { JsonView } from '@/presentation/components/JsonView'
import { CopyButton } from '@/presentation/components/CopyButton'
import { useAppContainer } from '@/presentation/hooks/useAppContainer'
import { useActiveAgent } from '@/presentation/hooks/useActiveAgent'
import type { SearchTool } from '@/domain/scraper'
import type { McpToolResult } from '@/infrastructure/schemas/mcp'

const MODES = [
  { id: 'google_search' as const, label: 'Web', desc: 'Google organic results' },
  { id: 'google_news' as const, label: 'News', desc: 'Recent articles with date and source' },
  { id: 'google_maps' as const, label: 'Maps', desc: 'Places with address, phone, rating' },
  { id: 'google_batch_search' as const, label: 'Batch', desc: '1–100 queries in one call' },
]

type Mode = (typeof MODES)[number]['id']

type Common = Readonly<{
  q: string
  gl: string
  hl: string
  tbs: string
  page: string
  location: string
}>

const EMPTY_COMMON: Common = { q: '', gl: '', hl: '', tbs: '', page: '', location: '' }

function toParams(c: Common): Record<string, unknown> {
  const o: Record<string, unknown> = { q: c.q }
  if (c.gl) o['gl'] = c.gl
  if (c.hl) o['hl'] = c.hl
  if (c.tbs) o['tbs'] = c.tbs
  if (c.page) { const n = Number(c.page); if (Number.isFinite(n) && n >= 1) o['page'] = Math.trunc(n) }
  if (c.location) o['location'] = c.location
  return o
}

export function Search() {
  const agent = useActiveAgent()
  const container = useAppContainer()
  const [mode, setMode] = useState<Mode>('google_search')
  const [advOpen, setAdvOpen] = useState(false)
  const [form, setForm] = useState<Common>(EMPTY_COMMON)
  const [batch, setBatch] = useState<readonly Common[]>([{ ...EMPTY_COMMON }, { ...EMPTY_COMMON }])

  const run = useMutation({
    mutationFn: async (): Promise<{ tool: SearchTool; result: McpToolResult }> => {
      if (!agent) throw new Error('no agent')
      const params: Record<string, unknown> = mode === 'google_batch_search'
        ? { queries: batch.filter((b) => b.q.trim()).map(toParams) }
        : toParams(form)
      const res = await container.useCases.callScraperTool(agent.id, agent.apiKey, mode, params)
      if (!res.ok) throw res.error
      return { tool: mode, result: res.value }
    },
  })

  if (!agent) return <p className="text-sm text-muted-foreground">Select an agent first.</p>
  const err = run.error
  const activeMeta = MODES.find((m) => m.id === mode)!

  const disabled = mode === 'google_batch_search'
    ? batch.every((b) => !b.q.trim())
    : !form.q.trim()

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Card className="p-6">
        <div className="text-center mb-4">
          <h2 className="text-lg font-semibold">Search</h2>
          <p className="text-xs text-muted-foreground mt-1">
            $0.0012 per call · $0.0012 × N for batch
          </p>
        </div>

        <div className="rounded-lg border border-border bg-muted/30 p-1 grid grid-cols-4 gap-1.5 mb-4">
          {MODES.map((m) => {
            const active = mode === m.id
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => setMode(m.id)}
                className={`py-2.5 px-3 text-sm rounded-md transition-colors text-center ${active ? 'bg-foreground/10 text-foreground shadow-sm font-medium' : 'text-muted-foreground hover:text-foreground'}`}
              >
                {m.label}
              </button>
            )
          })}
        </div>

        <p className="text-xs text-muted-foreground text-center mb-4">{activeMeta.desc}</p>

        {mode === 'google_batch_search' ? (
          <BatchForm queries={batch} onChange={setBatch} />
        ) : (
          <SingleForm
            form={form}
            onChange={setForm}
            advOpen={advOpen}
            onToggleAdv={() => setAdvOpen((v) => !v)}
          />
        )}

        <Button className="w-full mt-4" onClick={() => run.mutate()} disabled={run.isPending || disabled}>
          {run.isPending ? 'Searching…' : `Run ${mode}`}
        </Button>
        {err ? <div className="mt-3"><ErrorView error={err} /></div> : null}
      </Card>

      {run.data ? <ResultView tool={run.data.tool} result={run.data.result} /> : null}
    </div>
  )
}

function SingleForm({
  form, onChange, advOpen, onToggleAdv,
}: {
  form: Common
  onChange: (c: Common) => void
  advOpen: boolean
  onToggleAdv: () => void
}): React.JSX.Element {
  return (
    <div className="space-y-3">
      <div>
        <label className="text-xs text-muted-foreground block mb-1">Query</label>
        <Input
          value={form.q}
          onChange={(e) => onChange({ ...form, q: e.target.value })}
          placeholder="what to search for…"
        />
      </div>

      <button
        type="button"
        onClick={onToggleAdv}
        className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
      >
        {advOpen ? '▾' : '▸'} Advanced parameters
      </button>

      {advOpen ? (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 pt-2">
          <Field label="Country (gl)" value={form.gl} onChange={(v) => onChange({ ...form, gl: v })} placeholder="us" maxLength={2} />
          <Field label="Language (hl)" value={form.hl} onChange={(v) => onChange({ ...form, hl: v })} placeholder="en" maxLength={5} />
          <Field label="Date (tbs)" value={form.tbs} onChange={(v) => onChange({ ...form, tbs: v })} placeholder="qdr:d" />
          <Field label="Page" value={form.page} onChange={(v) => onChange({ ...form, page: v })} placeholder="1" type="number" />
          <Field label="Location" value={form.location} onChange={(v) => onChange({ ...form, location: v })} placeholder="Buenos Aires" wide />
        </div>
      ) : null}
    </div>
  )
}

function Field({
  label, value, onChange, placeholder, maxLength, type, wide,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  maxLength?: number
  type?: string
  wide?: boolean
}): React.JSX.Element {
  const props: React.InputHTMLAttributes<HTMLInputElement> = {
    value,
    onChange: (e) => onChange(e.target.value),
  }
  if (placeholder !== undefined) props.placeholder = placeholder
  if (maxLength !== undefined) props.maxLength = maxLength
  if (type !== undefined) props.type = type
  return (
    <div className={wide ? 'col-span-2 md:col-span-3' : ''}>
      <label className="text-xs text-muted-foreground block mb-1">{label}</label>
      <Input {...props} />
    </div>
  )
}

function BatchForm({
  queries, onChange,
}: {
  queries: readonly Common[]
  onChange: (next: readonly Common[]) => void
}): React.JSX.Element {
  const update = (i: number, patch: Partial<Common>): void => {
    onChange(queries.map((q, idx) => idx === i ? { ...q, ...patch } : q))
  }
  const add = (): void => { onChange([...queries, { ...EMPTY_COMMON }]) }
  const remove = (i: number): void => {
    onChange(queries.length === 1 ? [{ ...EMPTY_COMMON }] : queries.filter((_, idx) => idx !== i))
  }

  const validCount = queries.filter((q) => q.q.trim()).length

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          Queries {validCount > 0 ? `(${validCount} valid)` : ''}
        </span>
        <Button size="sm" variant="secondary" onClick={add} disabled={queries.length >= 100}>
          + Add query
        </Button>
      </div>
      <div className="space-y-2">
        {queries.map((q, i) => (
          <div key={i} className="rounded-lg border border-border bg-muted/20 p-3 space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-muted-foreground w-8">#{i + 1}</span>
              <Input
                value={q.q}
                onChange={(e) => update(i, { q: e.target.value })}
                placeholder="query text"
                className="flex-1"
              />
              <Button size="sm" variant="ghost" onClick={() => remove(i)} title="Remove">
                ✕
              </Button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Input value={q.gl} onChange={(e) => update(i, { gl: e.target.value })} placeholder="gl (country)" maxLength={2} />
              <Input value={q.hl} onChange={(e) => update(i, { hl: e.target.value })} placeholder="hl (lang)" maxLength={5} />
              <Input value={q.tbs} onChange={(e) => update(i, { tbs: e.target.value })} placeholder="tbs (e.g. qdr:d)" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function ResultView({ tool, result }: { tool: SearchTool; result: McpToolResult }): React.JSX.Element {
  const first = result.content[0]
  if (!first || first.type !== 'text') return (
    <Card className="p-4"><JsonView value={result} maxHeight="60vh" /></Card>
  )
  let parsed: unknown
  try { parsed = JSON.parse(first.text) } catch { parsed = null }
  if (parsed === null) {
    return <Card className="p-4"><pre className="text-xs overflow-auto whitespace-pre-wrap">{first.text}</pre></Card>
  }

  const body = parsed as {
    results?: unknown[]
    query?: string
    queryCount?: number
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-lg font-semibold">
          Results
          {body.query ? <span className="text-xs text-muted-foreground font-normal ml-2">for &ldquo;{body.query}&rdquo;</span> : null}
        </h2>
        <CopyButton text={first.text} label="Copy JSON" size="sm" variant="secondary" />
      </div>

      {tool === 'google_batch_search' ? (
        <BatchResults batches={(body.results ?? []) as { results?: unknown[]; query?: string }[]} />
      ) : tool === 'google_maps' ? (
        <MapsList items={(body.results ?? []) as Record<string, unknown>[]} />
      ) : (
        <OrganicList items={(body.results ?? []) as Record<string, unknown>[]} showDate={tool === 'google_news'} />
      )}
    </section>
  )
}

function OrganicList({ items, showDate }: { items: readonly Record<string, unknown>[]; showDate: boolean }): React.JSX.Element {
  if (items.length === 0) return <Card className="p-6 text-center text-sm text-muted-foreground">No results.</Card>
  return (
    <div className="space-y-2">
      {items.map((r, i) => {
        const title = String(r['title'] ?? '')
        const link = String(r['link'] ?? '')
        const snippet = String(r['snippet'] ?? '')
        const date = r['date'] ? String(r['date']) : null
        const source = r['source'] ? String(r['source']) : null
        return (
          <Card key={i} className="p-4 space-y-1">
            <div className="flex items-start justify-between gap-2">
              <a
                href={link}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-medium hover:underline break-words min-w-0"
              >
                {title || '(no title)'}
              </a>
              <CopyButton text={link} label="Copy link" size="sm" variant="ghost" />
            </div>
            <div className="text-[11px] text-emerald-600 font-mono truncate">{link}</div>
            {snippet ? <div className="text-xs text-muted-foreground">{snippet}</div> : null}
            {showDate && (date || source) ? (
              <div className="text-[10px] text-muted-foreground flex gap-3">
                {source ? <span>{source}</span> : null}
                {date ? <span>{date}</span> : null}
              </div>
            ) : null}
          </Card>
        )
      })}
    </div>
  )
}

function MapsList({ items }: { items: readonly Record<string, unknown>[] }): React.JSX.Element {
  if (items.length === 0) return <Card className="p-6 text-center text-sm text-muted-foreground">No places found.</Card>
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {items.map((r, i) => {
        const title = String(r['title'] ?? '')
        const address = r['address'] ? String(r['address']) : null
        const cat = r['category'] ? String(r['category']) : null
        const rating = typeof r['rating'] === 'number' ? (r['rating'] as number) : null
        const phone = r['phone'] ? String(r['phone']) : null
        const website = r['website'] ? String(r['website']) : null
        const lat = typeof r['latitude'] === 'number' ? (r['latitude'] as number) : null
        const lng = typeof r['longitude'] === 'number' ? (r['longitude'] as number) : null
        const mapsUrl = (lat !== null && lng !== null) ? `https://www.google.com/maps?q=${lat},${lng}` : null
        return (
          <Card key={i} className="p-4 space-y-1.5">
            <div className="flex items-start justify-between gap-2">
              <div className="text-sm font-medium min-w-0">{title}</div>
              {rating !== null ? (
                <span className="rounded-md bg-amber-500/15 text-amber-600 text-xs font-semibold px-1.5 py-0.5 flex-shrink-0">
                  ★ {rating.toFixed(1)}
                </span>
              ) : null}
            </div>
            {cat ? <div className="text-[10px] text-muted-foreground">{cat}</div> : null}
            {address ? <div className="text-xs text-muted-foreground">{address}</div> : null}
            <div className="flex flex-wrap gap-3 pt-1 text-xs">
              {phone ? <a className="text-sky-600 hover:underline" href={`tel:${phone}`}>{phone}</a> : null}
              {website ? <a className="text-sky-600 hover:underline truncate max-w-[16rem]" href={website} target="_blank" rel="noopener noreferrer">{website}</a> : null}
              {mapsUrl ? <a className="text-sky-600 hover:underline" href={mapsUrl} target="_blank" rel="noopener noreferrer">Open in Maps</a> : null}
            </div>
          </Card>
        )
      })}
    </div>
  )
}

function BatchResults({ batches }: { batches: readonly { results?: unknown[]; query?: string }[] }): React.JSX.Element {
  if (batches.length === 0) return <Card className="p-6 text-center text-sm text-muted-foreground">No results.</Card>
  return (
    <div className="space-y-3">
      {batches.map((b, i) => (
        <Card key={i} className="p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm font-medium">Query #{i + 1}: &ldquo;{b.query ?? '—'}&rdquo;</div>
            <span className="text-[10px] text-muted-foreground">{(b.results ?? []).length} results</span>
          </div>
          <OrganicList items={(b.results ?? []) as Record<string, unknown>[]} showDate={false} />
        </Card>
      ))}
    </div>
  )
}
