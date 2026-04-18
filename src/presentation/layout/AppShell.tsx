import { useState, type ReactNode } from 'react'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'
import { MainnetBanner } from './MainnetBanner'
import { ThemeEffect } from './ThemeEffect'
import { Toaster } from '@/presentation/components/ui/sonner'
import { Sheet, SheetContent, SheetTitle } from '@/presentation/components/ui/sheet'

export function AppShell({ children }: { children: ReactNode }) {
  const [drawerOpen, setDrawerOpen] = useState(false)

  return (
    <div className="h-screen flex flex-col">
      <ThemeEffect />
      <MainnetBanner />
      <div className="flex flex-1 overflow-hidden">
        {/* Desktop/tablet sidebar (≥ md) */}
        <div className="hidden md:block">
          <Sidebar />
        </div>

        {/* Mobile drawer (< md) */}
        <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
          <SheetContent side="left" className="p-0 w-64">
            <SheetTitle className="sr-only">Navigation</SheetTitle>
            <Sidebar onNavigate={() => setDrawerOpen(false)} />
          </SheetContent>
        </Sheet>

        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          <Topbar onOpenDrawer={() => setDrawerOpen(true)} />
          <main className="flex-1 overflow-auto p-3 md:p-6">{children}</main>
        </div>
      </div>
      <Toaster position="bottom-right" richColors />
    </div>
  )
}
