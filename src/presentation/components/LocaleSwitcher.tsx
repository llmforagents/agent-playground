import { useAppStore } from '@/presentation/hooks/useAppStore'
import { LOCALES, type Locale } from '@/domain/i18n'

export function LocaleSwitcher() {
  const locale = useAppStore((s) => s.locale)
  const setLocale = useAppStore((s) => s.setLocale)
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-0.5 flex">
      {LOCALES.map((l: Locale) => (
        <button
          key={l}
          type="button"
          onClick={() => setLocale(l)}
          aria-label={`Language: ${l.toUpperCase()}`}
          title={l === 'en' ? 'English' : 'Español'}
          className={`px-2 h-7 text-[11px] rounded-md uppercase font-semibold transition-colors ${locale === l ? 'bg-foreground/10 text-foreground' : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'}`}
        >
          {l}
        </button>
      ))}
    </div>
  )
}
