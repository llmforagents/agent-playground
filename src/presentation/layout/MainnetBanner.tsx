import { useAppStore } from '@/presentation/hooks/useAppStore'
import { Button } from '@/presentation/components/ui/button'

export function MainnetBanner() {
  const ack = useAppStore((s) => s.mainnetBannerAck)
  const dismiss = useAppStore((s) => s.ackMainnet)
  if (ack) return null
  return (
    <div className="bg-amber-500 text-amber-950 px-4 py-2 text-sm flex items-center justify-between">
      <span>⚠ MAINNET — this dashboard talks to real money on real chains.</span>
      <Button size="sm" variant="secondary" onClick={dismiss}>I understand</Button>
    </div>
  )
}
