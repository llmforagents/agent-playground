import { MenuIcon, MoonIcon, SunIcon } from 'lucide-react'
import { AgentSwitcher } from '@/presentation/components/AgentSwitcher'
import { BalanceBadge } from '@/presentation/components/BalanceBadge'
import { Button } from '@/presentation/components/ui/button'
import { useAppStore } from '@/presentation/hooks/useAppStore'

type Props = Readonly<{ onOpenDrawer?: () => void }>

export function Topbar({ onOpenDrawer }: Props) {
  const theme = useAppStore((s) => s.theme)
  const toggle = useAppStore((s) => s.toggleTheme)
  const isDark = theme === 'dark'
  return (
    <header className="h-14 border-b border-border bg-background flex items-center gap-2 px-3 md:px-4 md:gap-3">
      <Button
        size="sm"
        variant="ghost"
        onClick={onOpenDrawer}
        aria-label="Open navigation"
        title="Navigation"
        className="size-9 p-0 md:hidden flex-shrink-0"
      >
        <MenuIcon className="size-5" />
      </Button>
      <div className="min-w-0 flex-1 flex items-center gap-2 md:gap-3">
        <AgentSwitcher />
      </div>
      <div className="flex items-center gap-2 md:gap-3 flex-shrink-0">
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
