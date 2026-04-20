import { NavLink } from 'react-router-dom'
import { useT } from '@/presentation/hooks/useT'
import type { MessageKey } from '@/domain/i18n'

const links: readonly { to: string; key: MessageKey }[] = [
  { to: '/', key: 'sidebar.home' },
  { to: '/agents', key: 'sidebar.agents' },
  { to: '/models', key: 'sidebar.models' },
  { to: '/chat', key: 'sidebar.chat' },
  { to: '/wallet', key: 'sidebar.wallet' },
  { to: '/transactions', key: 'sidebar.transactions' },
  { to: '/scraper/one-shot', key: 'sidebar.scraperOneshot' },
  { to: '/scraper/sessions', key: 'sidebar.scraperSessions' },
  { to: '/search', key: 'sidebar.search' },
  { to: '/images', key: 'sidebar.images' },
  { to: '/tx', key: 'sidebar.sendTx' },
  { to: '/settings', key: 'sidebar.settings' },
  { to: '/guide', key: 'sidebar.guide' },
]

export function Sidebar({ onNavigate }: { onNavigate?: () => void } = {}) {
  const t = useT()
  return (
    <nav className="w-full md:w-56 h-full border-r border-border bg-sidebar text-sidebar-foreground p-3 space-y-1 overflow-y-auto">
      <div className="font-bold text-lg mb-5 mt-1 px-2">LLM4Agents</div>
      {links.map((l) => (
        <NavLink
          key={l.to}
          to={l.to}
          end={l.to === '/'}
          onClick={onNavigate}
          className={({ isActive }) =>
            `block px-3 py-2 rounded-lg text-sm transition-colors ${isActive ? 'bg-primary text-primary-foreground' : 'hover:bg-accent hover:text-accent-foreground'}`
          }
        >
          {t(l.key)}
        </NavLink>
      ))}
    </nav>
  )
}
