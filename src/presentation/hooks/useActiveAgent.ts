import { useAppStore } from './useAppStore'
import { useAgents } from './useAgents'
import type { Agent } from '@/domain/agent'

export function useActiveAgent(): Agent | undefined {
  const activeId = useAppStore((s) => s.activeAgentId)
  const { listQuery } = useAgents()
  return listQuery.data?.find((a) => a.id === activeId)
}
