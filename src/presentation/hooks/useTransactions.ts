import { useQuery } from '@tanstack/react-query'
import { useAppContainer } from './useAppContainer'
import { useActiveAgent } from './useActiveAgent'

export function useTransactions(params: {
  type?: 'deposit' | 'usage' | 'refund'; limit?: number; offset?: number
} = {}) {
  const container = useAppContainer()
  const agent = useActiveAgent()
  return useQuery({
    queryKey: ['agent', agent?.id, 'transactions', params],
    enabled: !!agent,
    queryFn: async () => {
      if (!agent) throw new Error('no agent')
      const res = await container.useCases.listTransactions(agent.id, agent.apiKey, params)
      if (!res.ok) throw res.error
      return res.value
    },
  })
}
