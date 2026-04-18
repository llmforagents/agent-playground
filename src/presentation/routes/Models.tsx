import { useMemo, useState } from 'react'
import { Input } from '@/presentation/components/ui/input'
import { Card } from '@/presentation/components/ui/card'
import { useModels } from '@/presentation/hooks/useModels'
import { Section } from '@/presentation/components/Section'
import { ErrorView } from '@/presentation/components/ErrorView'
import { CopyButton } from '@/presentation/components/CopyButton'

function fmtPrice(p: number): string {
  if (!Number.isFinite(p) || p < 0) return 'variable'
  return `$${p.toFixed(2)}`
}

export function Models() {
  const [search, setSearch] = useState('')
  const q = useModels()
  const err = q.error

  const filtered = useMemo(() => {
    const all = q.data?.models ?? []
    const term = search.trim().toLowerCase()
    if (!term) return all
    return all.filter((m) =>
      m.slug.toLowerCase().includes(term) ||
      m.displayName.toLowerCase().includes(term) ||
      (m.provider?.toLowerCase().includes(term) ?? false)
    )
  }, [q.data, search])

  return (
    <div>
      <Section title={`Models${q.data ? ` (${filtered.length}/${q.data.models.length})` : ''}`}>
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by slug, name or provider…"
          className="max-w-sm mb-4"
        />
        {err ? <ErrorView error={err} /> : null}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filtered.map((m) => (
            <Card key={m.slug} className="p-3 space-y-1">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-medium truncate">{m.displayName}</div>
                  <div className="text-xs text-muted-foreground font-mono truncate">{m.slug}</div>
                </div>
                <CopyButton text={m.slug} label="Copy slug" size="sm" variant="ghost" />
              </div>
              <div className="text-xs text-muted-foreground">
                {m.provider ? <>prov <b>{m.provider}</b> • </> : null}
                ctx {m.contextWindow.toLocaleString()} tok •
                in {fmtPrice(m.inputPricePer1M)}/1M •
                out {fmtPrice(m.outputPricePer1M)}/1M
                {m.feePct !== undefined ? <> • fee {m.feePct}%</> : null}
              </div>
            </Card>
          ))}
          {filtered.length === 0 && q.data ? (
            <p className="text-sm text-muted-foreground">No models match that search.</p>
          ) : null}
        </div>
      </Section>
    </div>
  )
}
