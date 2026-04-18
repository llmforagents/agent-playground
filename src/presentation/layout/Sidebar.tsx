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

export function Sidebar() {
  return (
    <nav className="w-56 border-r border-border bg-sidebar text-sidebar-foreground p-3 space-y-1">
      <div className="font-semibold text-sm mb-3 px-2">llm4agents</div>
      {links.map((l) => (
        <NavLink
          key={l.to}
          to={l.to}
          end={l.to === '/'}
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
