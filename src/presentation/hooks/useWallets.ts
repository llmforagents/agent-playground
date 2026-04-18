import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAppContainer } from './useAppContainer'
import { useActiveAgent } from './useActiveAgent'
import type { StoredWallet } from '@/application/ports'

export function useWallets() {
  const container = useAppContainer()
  const agent = useActiveAgent()
  const qc = useQueryClient()
  const key = ['agent', agent?.id, 'wallets'] as const

  const listQuery = useQuery({
    queryKey: key,
    enabled: !!agent,
    queryFn: async (): Promise<readonly StoredWallet[]> => {
      if (!agent) return []
      return container.useCases.listWalletsFor(agent.id)
    },
  })

  const remove = useMutation({
    mutationFn: async (params: { chain: 'solana' | 'polygon'; token: 'USDT' | 'USDC' }) => {
      if (!agent) throw new Error('no agent')
      await container.useCases.removeWalletLocal(agent.id, params.chain, params.token)
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: key }) },
  })

  return {
    listQuery,
    remove,
    invalidate: () => qc.invalidateQueries({ queryKey: key }),
  }
}
