import { useQuery } from '@tanstack/react-query'
import { useAppContainer } from './useAppContainer'
import { useActiveAgent } from './useActiveAgent'

export function useModels(search?: string) {
  const container = useAppContainer()
  const agent = useActiveAgent()
  return useQuery({
    queryKey: ['agent', agent?.id, 'models', search],
    enabled: !!agent,
    queryFn: async () => {
      if (!agent) throw new Error('no agent')
      const res = await container.useCases.fetchModels(agent.id, agent.apiKey, search)
      if (!res.ok) throw res.error
      return res.value
    },
  })
}
