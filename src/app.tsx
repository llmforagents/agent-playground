import { Route, Routes, Navigate } from 'react-router-dom'
import { Providers } from '@/presentation/layout/Providers'
import { AppShell } from '@/presentation/layout/AppShell'
import { ErrorBoundary } from '@/presentation/components/ErrorBoundary'
import { Agents } from '@/presentation/routes/Agents'
import { Home } from '@/presentation/routes/Home'
import { Models } from '@/presentation/routes/Models'
import { Wallet } from '@/presentation/routes/Wallet'
import { Transactions } from '@/presentation/routes/Transactions'
import { Settings } from '@/presentation/routes/Settings'
import { Chat } from '@/presentation/routes/Chat'
import { Council } from '@/presentation/routes/Council'
import { ScraperOneShot } from '@/presentation/routes/ScraperOneShot'
import { ScraperSessions } from '@/presentation/routes/ScraperSessions'
import { Search } from '@/presentation/routes/Search'
import { Images } from '@/presentation/routes/Images'
import { Guide } from '@/presentation/routes/Guide'
import { OAuthCallback } from '@/presentation/routes/OAuthCallback'

export function App() {
  return (
    <Providers>
      <AppShell>
        <ErrorBoundary>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/agents" element={<Agents />} />
            <Route path="/models" element={<Models />} />
            <Route path="/chat" element={<Chat />} />
            <Route path="/council" element={<Council />} />
            <Route path="/wallet" element={<Wallet />} />
            <Route path="/transactions" element={<Transactions />} />
            <Route path="/scraper/one-shot" element={<ScraperOneShot />} />
            <Route path="/scraper/sessions" element={<ScraperSessions />} />
            <Route path="/search" element={<Search />} />
            <Route path="/images" element={<Images />} />
            <Route path="/guide" element={<Guide />} />
            <Route path="/oauth/github/callback" element={<OAuthCallback />} />
            <Route path="/health" element={<Navigate to="/settings" replace />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </ErrorBoundary>
      </AppShell>
    </Providers>
  )
}
