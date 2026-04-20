import { Link } from 'react-router-dom'
import { Card } from '@/presentation/components/ui/card'
import { Button } from '@/presentation/components/ui/button'
import { useT } from '@/presentation/hooks/useT'
import type { MessageKey } from '@/domain/i18n'

type Step = Readonly<{
  number: number
  titleKey: MessageKey
  bodyKey: MessageKey
  cta?: { to: string; labelKey: MessageKey }
}>

const STEPS: readonly Step[] = [
  { number: 1, titleKey: 'guide.step1Title', bodyKey: 'guide.step1Body', cta: { to: '/agents', labelKey: 'guide.step1Cta' } },
  { number: 2, titleKey: 'guide.step2Title', bodyKey: 'guide.step2Body' },
  { number: 3, titleKey: 'guide.step3Title', bodyKey: 'guide.step3Body', cta: { to: '/wallet', labelKey: 'guide.step3Cta' } },
  { number: 4, titleKey: 'guide.step4Title', bodyKey: 'guide.step4Body' },
  { number: 5, titleKey: 'guide.step5Title', bodyKey: 'guide.step5Body', cta: { to: '/chat', labelKey: 'guide.step5Cta' } },
  { number: 6, titleKey: 'guide.step6Title', bodyKey: 'guide.step6Body' },
  { number: 7, titleKey: 'guide.step7Title', bodyKey: 'guide.step7Body', cta: { to: '/images', labelKey: 'guide.step7Cta' } },
  { number: 8, titleKey: 'guide.step8Title', bodyKey: 'guide.step8Body', cta: { to: '/tx', labelKey: 'guide.step8Cta' } },
  { number: 9, titleKey: 'guide.step9Title', bodyKey: 'guide.step9Body', cta: { to: '/transactions', labelKey: 'guide.step9Cta' } },
]

const TIPS: readonly { titleKey: MessageKey; bodyKey: MessageKey }[] = [
  { titleKey: 'guide.tip1Title', bodyKey: 'guide.tip1Body' },
  { titleKey: 'guide.tip2Title', bodyKey: 'guide.tip2Body' },
  { titleKey: 'guide.tip3Title', bodyKey: 'guide.tip3Body' },
  { titleKey: 'guide.tip4Title', bodyKey: 'guide.tip4Body' },
  { titleKey: 'guide.tip5Title', bodyKey: 'guide.tip5Body' },
  { titleKey: 'guide.tip6Title', bodyKey: 'guide.tip6Body' },
]

export function Guide(): React.JSX.Element {
  const t = useT()
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Card className="p-6">
        <h1 className="text-2xl font-bold mb-2">{t('guide.title')}</h1>
        <p className="text-sm text-muted-foreground">{t('guide.intro')}</p>
      </Card>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{t('guide.steps')}</h2>
        <div className="space-y-3">
          {STEPS.map((s) => (
            <Card key={s.number} className="p-4 sm:p-5">
              <div className="flex items-start gap-3 sm:gap-4">
                <div className="flex-shrink-0 size-8 rounded-full bg-muted text-foreground flex items-center justify-center text-sm font-semibold">
                  {s.number}
                </div>
                <div className="flex-1 min-w-0 space-y-2">
                  <h3 className="text-base font-semibold">{t(s.titleKey)}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{t(s.bodyKey)}</p>
                  {s.cta ? (
                    <div>
                      <Link to={s.cta.to}>
                        <Button size="sm" variant="secondary">{t(s.cta.labelKey)} →</Button>
                      </Link>
                    </div>
                  ) : null}
                </div>
              </div>
            </Card>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{t('guide.tips')}</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {TIPS.map((tip) => (
            <Card key={tip.titleKey} className="p-4 space-y-1">
              <div className="text-sm font-semibold">{t(tip.titleKey)}</div>
              <p className="text-xs text-muted-foreground">{t(tip.bodyKey)}</p>
            </Card>
          ))}
        </div>
      </section>

    </div>
  )
}
