import { useAppStore } from '@/presentation/hooks/useAppStore'
import { useT } from '@/presentation/hooks/useT'
import { Button } from '@/presentation/components/ui/button'

export function MainnetBanner() {
  const t = useT()
  const ack = useAppStore((s) => s.mainnetBannerAck)
  const dismiss = useAppStore((s) => s.ackMainnet)
  if (ack) return null
  return (
    <div className="bg-amber-500 text-amber-950 px-4 py-2 text-sm flex items-center justify-between gap-3">
      <span className="font-medium">{t('mainnet.warning')}</span>
      <Button
        size="sm"
        onClick={dismiss}
        className="bg-amber-950 text-amber-50 hover:bg-amber-900 focus-visible:ring-amber-950/40"
      >
        {t('mainnet.ack')}
      </Button>
    </div>
  )
}
