import { useEffect } from 'react'
import { useAgents } from './useAgents'
import { useAppStore } from './useAppStore'

export function useSyncActiveAgent(): void {
  const { listQuery } = useAgents()
  const activeId = useAppStore((s) => s.activeAgentId)
  const setActive = useAppStore((s) => s.setActiveAgent)

  const agents = listQuery.data
  const isReady = listQuery.isSuccess

  useEffect(() => {
    if (!isReady || !agents) return

    if (agents.length === 0) {
      if (activeId !== undefined) setActive(undefined)
      return
    }

    const stillExists = activeId !== undefined && agents.some((a) => a.id === activeId)
    if (stillExists) return

    const first = agents[0]
    if (first) setActive(first.id)
  }, [isReady, agents, activeId, setActive])
}
