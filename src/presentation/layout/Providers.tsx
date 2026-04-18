import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
import { useMemo, type ReactNode } from 'react'
import { AppContainerContext } from '@/presentation/hooks/useAppContainer'
import { composeApp } from '@/composition/root'
import { loadEnv } from '@/composition/env'

export function Providers({ children }: { children: ReactNode }) {
  const queryClient = useMemo(() => new QueryClient({
    defaultOptions: {
      queries: {
        retry: (count, err) => {
          const kind = (err as { kind?: string } | null)?.kind
          if (kind === 'unauthorized' || kind === 'insufficient_balance' || kind === 'validation') return false
          return count < 2
        },
        refetchOnWindowFocus: false,
        staleTime: 30_000,
      },
    },
  }), [])

  const container = useMemo(() => {
    const env = loadEnv({
      VITE_API_BASE: import.meta.env['VITE_API_BASE'] ?? '/proxy/api',
      VITE_MCP_BASE: import.meta.env['VITE_MCP_BASE'] ?? '/proxy/mcp',
    })
    return composeApp(env)
  }, [])

  return (
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        <AppContainerContext.Provider value={container}>
          {children}
        </AppContainerContext.Provider>
      </QueryClientProvider>
    </BrowserRouter>
  )
}
