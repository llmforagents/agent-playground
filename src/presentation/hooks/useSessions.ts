import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAppContainer } from './useAppContainer'
import { useActiveAgent } from './useActiveAgent'

export function useSessions() {
  const container = useAppContainer()
  const agent = useActiveAgent()
  const qc = useQueryClient()
  const key = ['agent', agent?.id, 'sessions'] as const
  const query = useQuery({
    queryKey: key,
    enabled: !!agent,
    queryFn: async () => {
      if (!agent) throw new Error('no agent')
      return container.useCases.listSessionsFor(agent.id)
    },
  })
  return { query, invalidate: () => qc.invalidateQueries({ queryKey: key }) }
}
