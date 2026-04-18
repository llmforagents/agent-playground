import { NavLink } from 'react-router-dom'

const links: readonly { to: string; label: string }[] = [
  { to: '/', label: 'Home' },
  { to: '/agents', label: 'Agents' },
  { to: '/models', label: 'Models' },
  { to: '/chat', label: 'Chat' },
  { to: '/wallet', label: 'Wallet' },
  { to: '/transactions', label: 'Transactions' },
  { to: '/scraper/one-shot', label: 'Scraper (one-shot)' },
  { to: '/scraper/sessions', label: 'Scraper (sessions)' },
  { to: '/search', label: 'Search' },
  { to: '/settings', label: 'Settings' },
]

export function Sidebar({ onNavigate }: { onNavigate?: () => void } = {}) {
  return (
    <nav className="w-full md:w-56 h-full border-r border-border bg-sidebar text-sidebar-foreground p-3 space-y-1 overflow-y-auto">
      <div className="font-bold text-lg mb-3 px-2" style={{ color: '#06b6d4' }}>LLM4Agents</div>
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
          {l.label}
        </NavLink>
      ))}
    </nav>
  )
}
