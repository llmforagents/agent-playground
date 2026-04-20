import { PROXY_TIERS, type ProxyTier } from '@/domain/scraper'

export function ProxyTierSelector({
  value, onChange,
}: { value: ProxyTier; onChange: (t: ProxyTier) => void }) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-1 grid grid-cols-3 gap-1.5">
      {PROXY_TIERS.map((t) => (
        <button
          key={t}
          type="button"
          onClick={() => onChange(t)}
          className={`py-2.5 px-3 text-sm rounded-md transition-colors capitalize ${value === t ? 'bg-foreground/15 text-foreground shadow-sm font-medium ring-1 ring-foreground/10' : 'text-muted-foreground hover:text-foreground'}`}
        >
          {t}
        </button>
      ))}
    </div>
  )
}
