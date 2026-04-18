import type { ReactNode } from 'react'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'
import { MainnetBanner } from './MainnetBanner'
import { ThemeEffect } from './ThemeEffect'
import { Toaster } from '@/presentation/components/ui/sonner'

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="h-screen flex flex-col">
      <ThemeEffect />
      <MainnetBanner />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <div className="flex-1 flex flex-col overflow-hidden">
          <Topbar />
          <main className="flex-1 overflow-auto p-6">{children}</main>
        </div>
      </div>
      <Toaster position="bottom-right" richColors />
    </div>
  )
}
