import { MoonIcon, SunIcon } from 'lucide-react'
import { AgentSwitcher } from '@/presentation/components/AgentSwitcher'
import { BalanceBadge } from '@/presentation/components/BalanceBadge'
import { Button } from '@/presentation/components/ui/button'
import { useAppStore } from '@/presentation/hooks/useAppStore'

export function Topbar() {
  const theme = useAppStore((s) => s.theme)
  const toggle = useAppStore((s) => s.toggleTheme)
  const isDark = theme === 'dark'
  return (
    <header className="h-14 border-b border-border bg-background flex items-center justify-between px-4 gap-3">
      <AgentSwitcher />
      <div className="flex items-center gap-3">
        <BalanceBadge />
        <Button
          size="sm"
          variant="ghost"
          onClick={toggle}
          aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
          title={isDark ? 'Switch to light' : 'Switch to dark'}
          className="size-9 p-0"
        >
          {isDark ? <SunIcon className="size-4" /> : <MoonIcon className="size-4" />}
        </Button>
      </div>
    </header>
  )
}
