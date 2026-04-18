import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAppContainer } from './useAppContainer'
import type { Agent } from '@/domain/agent'
import type { AgentId } from '@/domain/branded'

const KEY = ['agents'] as const

export function useAgents() {
  const container = useAppContainer()
  const qc = useQueryClient()

  const listQuery = useQuery({
    queryKey: KEY,
    queryFn: async (): Promise<readonly Agent[]> => container.useCases.listAgents(),
  })

  const register = useMutation({
    mutationFn: async (params: { name: string; color: string }) => {
      const res = await container.useCases.registerAgent({ name: params.name }, params.color)
      if (!res.ok) throw res.error
      return res.value
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  })

  const remove = useMutation({
    mutationFn: async (id: AgentId) => container.useCases.removeAgentLocal(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  })

  return { listQuery, register, remove }
}
