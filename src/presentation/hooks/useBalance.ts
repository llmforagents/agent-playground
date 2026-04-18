import { useQuery } from '@tanstack/react-query'
import { useAppContainer } from './useAppContainer'
import { useActiveAgent } from './useActiveAgent'
import type { BalanceResponse } from '@/infrastructure/schemas/rest'

export function useBalance() {
  const container = useAppContainer()
  const agent = useActiveAgent()
  return useQuery({
    queryKey: ['agent', agent?.id, 'balance'],
    enabled: !!agent,
    queryFn: async (): Promise<BalanceResponse> => {
      if (!agent) throw new Error('no agent')
      const res = await container.useCases.fetchBalance(agent.id, agent.apiKey)
      if (!res.ok) throw res.error
      return res.value
    },
  })
}
