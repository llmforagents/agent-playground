import { MenuIcon, MoonIcon, SunIcon } from 'lucide-react'
import { AgentSwitcher } from '@/presentation/components/AgentSwitcher'
import { BalanceBadge } from '@/presentation/components/BalanceBadge'
import { LocaleSwitcher } from '@/presentation/components/LocaleSwitcher'
import { Button } from '@/presentation/components/ui/button'
import { useAppStore } from '@/presentation/hooks/useAppStore'
import { useT } from '@/presentation/hooks/useT'

type Props = Readonly<{ onOpenDrawer?: () => void }>

export function Topbar({ onOpenDrawer }: Props) {
  const t = useT()
  const theme = useAppStore((s) => s.theme)
  const toggle = useAppStore((s) => s.toggleTheme)
  const isDark = theme === 'dark'
  return (
    <header className="relative h-14 border-b border-border bg-background flex items-center gap-2 px-3 md:px-4 md:gap-3">
      <Button
        size="sm"
        variant="ghost"
        onClick={onOpenDrawer}
        aria-label={t('topbar.openNav')}
        title={t('topbar.navigation')}
        className="size-9 p-0 md:hidden flex-shrink-0"
      >
        <MenuIcon className="size-5" />
      </Button>
      <div className="min-w-0 flex-1 flex items-center gap-2 md:gap-3">
        <AgentSwitcher />
      </div>
      <div
        aria-hidden
        className="hidden md:block absolute left-1/2 -translate-x-1/2 font-bold text-xl tracking-tight pointer-events-none select-none"
      >
        LLM4Agents
      </div>
      <div className="flex items-center gap-2 md:gap-3 flex-shrink-0">
        <div className="hidden sm:block">
          <LocaleSwitcher />
        </div>
        <BalanceBadge />
        <Button
          size="sm"
          variant="ghost"
          onClick={toggle}
          aria-label={isDark ? t('topbar.switchToLight') : t('topbar.switchToDark')}
          title={isDark ? t('topbar.switchToLight') : t('topbar.switchToDark')}
          className="size-9 p-0"
        >
          {isDark ? <SunIcon className="size-4" /> : <MoonIcon className="size-4" />}
        </Button>
      </div>
    </header>
  )
}
