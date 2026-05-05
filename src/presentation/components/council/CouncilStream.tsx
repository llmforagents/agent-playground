import { useT } from '@/presentation/hooks/useT'
import type { CouncilEvent } from '@/domain/councilEvents'
import type { DrafterSlot } from '@/domain/council'
import { describeError } from '@/domain/errors'
import { Card } from '@/presentation/components/ui/card'

type Props = Readonly<{ events: ReadonlyArray<CouncilEvent> }>

export function CouncilStream({ events }: Props) {
  const t = useT()

  const drafts = events.filter(
    (e): e is Extract<CouncilEvent, { kind: 'draft_done' }> => e.kind === 'draft_done',
  )
  const draftsStarted = events.filter(
    (e): e is Extract<CouncilEvent, { kind: 'draft_started' }> => e.kind === 'draft_started',
  )
  const critiques = events.filter(
    (e): e is Extract<CouncilEvent, { kind: 'critique_done' }> => e.kind === 'critique_done',
  )
  const synthesis = events.find(
    (e): e is Extract<CouncilEvent, { kind: 'synthesis_done' }> => e.kind === 'synthesis_done',
  )
  const synthesisStarted = events.some((e) => e.kind === 'synthesis_started')
  const draftFailed = events.filter(
    (e): e is Extract<CouncilEvent, { kind: 'draft_failed' }> => e.kind === 'draft_failed',
  )

  return (
    <div className="space-y-6">
      {synthesis ? (
        <Card className="p-5 border-2 border-primary">
          <h2 className="text-lg font-bold mb-3">{t('council.finalAnswer')}</h2>
          <pre className="whitespace-pre-wrap text-sm font-sans">{synthesis.content}</pre>
          <div className="text-xs text-muted-foreground mt-4">
            {t('council.synthesizedBy')} <span className="font-mono">{String(synthesis.model)}</span> ·
            ${(synthesis.costCents / 100).toFixed(4)} · {synthesis.durationMs}ms
          </div>
        </Card>
      ) : synthesisStarted ? (
        <Card className="p-5 border border-border">
          <div className="text-sm text-muted-foreground animate-pulse">
            {t('council.synthesizing')}
          </div>
        </Card>
      ) : null}

      <section>
        <h3 className="font-semibold mb-3">{t('council.drafts')}</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {(['A', 'B', 'C'] as DrafterSlot[]).map((slot) => {
            const draft = drafts.find((d) => d.slot === slot)
            const fail = draftFailed.find((f) => f.slot === slot)
            const started = draftsStarted.find((s) => s.slot === slot)
            if (!draft && !fail && !started) return null
            return (
              <Card key={slot} className="p-3 text-sm">
                <div className="font-mono text-xs text-muted-foreground mb-2">
                  {t('council.drafter')} {slot}
                  {(draft ?? started) ? (
                    <span className="ml-1">· {String((draft ?? started)!.model)}</span>
                  ) : null}
                </div>
                {draft ? (
                  <>
                    <pre className="whitespace-pre-wrap font-sans">{draft.content}</pre>
                    <div className="text-xs text-muted-foreground mt-2">
                      ${(draft.costCents / 100).toFixed(4)} · {draft.durationMs}ms
                    </div>
                  </>
                ) : fail ? (
                  <div className="text-destructive text-xs">
                    {t('council.draftFailed')}: {describeError(fail.error)}
                  </div>
                ) : (
                  <div className="animate-pulse text-muted-foreground text-xs">
                    {t('council.drafting')}…
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      </section>

      {critiques.length > 0 ? (
        <section>
          <h3 className="font-semibold mb-3">{t('council.critiques')}</h3>
          <div className="space-y-2">
            {critiques.map((c) => (
              <details key={c.slot} className="rounded-lg border border-border bg-card p-3 text-sm">
                <summary className="cursor-pointer font-medium">
                  {t('council.critiqueBy')} {c.slot} ·{' '}
                  <span className="font-mono text-xs text-muted-foreground">{String(c.model)}</span>
                </summary>
                <pre className="whitespace-pre-wrap font-sans mt-3 text-xs">{c.content}</pre>
              </details>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  )
}
