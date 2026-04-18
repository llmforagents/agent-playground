import { useAppStore } from '@/presentation/hooks/useAppStore'
import { useT } from '@/presentation/hooks/useT'
import { Button } from '@/presentation/components/ui/button'

export function MainnetBanner() {
  const t = useT()
  const ack = useAppStore((s) => s.mainnetBannerAck)
  const dismiss = useAppStore((s) => s.ackMainnet)
  if (ack) return null
  return (
    <div className="bg-amber-500 text-amber-950 px-4 py-2 text-sm flex items-center justify-between">
      <span>{t('mainnet.warning')}</span>
      <Button size="sm" variant="secondary" onClick={dismiss}>{t('mainnet.ack')}</Button>
    </div>
  )
}
