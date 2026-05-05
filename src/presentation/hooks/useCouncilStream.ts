import { useCallback, useEffect, useRef, useState } from 'react'
import type { CouncilConfig, CouncilPlan } from '@/domain/council'
import type { CouncilEvent } from '@/domain/councilEvents'
import type { AgentId } from '@/domain/branded'
import { useAppContainer } from './useAppContainer'
import { useActiveAgent } from './useActiveAgent'
import { useCouncilStore, type CouncilSnapshot } from './useCouncilStore'

export type CouncilUiState = Readonly<{
  isRunning: boolean
  events: ReadonlyArray<CouncilEvent>
  finalAnswer: string | null
  totalCostCents: number
  error: string | null
  snapshotTimestamp: string | null
  snapshotPlan: CouncilPlan | null
  snapshotTask: string | null
}>

const INITIAL: CouncilUiState = {
  isRunning: false,
  events: [],
  finalAnswer: null,
  totalCostCents: 0,
  error: null,
  snapshotTimestamp: null,
  snapshotPlan: null,
  snapshotTask: null,
}

function fromSnapshot(snap: CouncilSnapshot): CouncilUiState {
  return {
    isRunning: false,
    events: snap.events,
    finalAnswer: snap.finalAnswer,
    totalCostCents: snap.totalCostCents,
    error: snap.error,
    snapshotTimestamp: snap.timestamp,
    snapshotPlan: snap.plan,
    snapshotTask: snap.userTask,
  }
}

function newRunId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `run-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

export function useCouncilStream(): {
  state: CouncilUiState
  start: (args: { config: CouncilConfig; userTask: string; plan: CouncilPlan }) => void
  reset: () => void
} {
  const container = useAppContainer()
  const agent = useActiveAgent()
  const persisted = useCouncilStore((s) =>
    agent ? s.byAgent[agent.id] : undefined,
  )
  const setSnapshot = useCouncilStore((s) => s.setSnapshot)
  const clearSnapshot = useCouncilStore((s) => s.clearSnapshot)

  const [state, setState] = useState<CouncilUiState>(() =>
    persisted ? fromSnapshot(persisted) : INITIAL,
  )
  const abortRef = useRef<AbortController | null>(null)
  const lastHydratedAgent = useRef<AgentId | null>(agent?.id ?? null)

  // Re-hydrate when the active agent changes (each agent has its own snapshot).
  useEffect(() => {
    if (agent?.id === lastHydratedAgent.current) return
    lastHydratedAgent.current = agent?.id ?? null
    setState(persisted ? fromSnapshot(persisted) : INITIAL)
  }, [agent?.id, persisted])

  const start = useCallback(
    (args: { config: CouncilConfig; userTask: string; plan: CouncilPlan }) => {
      if (!agent) {
        setState({ ...INITIAL, error: 'No active agent — register or activate one first.' })
        return
      }
      if (abortRef.current) abortRef.current.abort()
      const ac = new AbortController()
      abortRef.current = ac

      const runId = newRunId()
      setState({ ...INITIAL, isRunning: true })

      void (async () => {
        const collectedEvents: CouncilEvent[] = []
        let finalAnswer: string | null = null
        let totalCostCents = 0
        let errMessage: string | null = null
        try {
          const generator = container.useCases.runCouncilChat(
            agent.id,
            agent.apiKey,
            { config: args.config, userTask: args.userTask },
          )
          for await (const event of generator) {
            if (ac.signal.aborted) return
            collectedEvents.push(event)
            if (event.kind === 'council_done') {
              finalAnswer = event.finalAnswer
              totalCostCents = event.totalCostCents
            } else if (event.kind === 'council_failed') {
              errMessage = event.error.kind
              totalCostCents = event.partialCostCents
            }
            setState((prev) => {
              const next: CouncilUiState = { ...prev, events: [...prev.events, event] }
              if (event.kind === 'council_done') {
                return {
                  ...next,
                  isRunning: false,
                  finalAnswer: event.finalAnswer,
                  totalCostCents: event.totalCostCents,
                }
              }
              if (event.kind === 'council_failed') {
                return {
                  ...next,
                  isRunning: false,
                  error: event.error.kind,
                  totalCostCents: event.partialCostCents,
                }
              }
              return next
            })
          }
        } catch (e) {
          if (ac.signal.aborted) return
          errMessage = e instanceof Error ? e.message : String(e)
          setState((prev) => ({
            ...prev,
            isRunning: false,
            error: errMessage,
          }))
        } finally {
          // Persist whatever we got — even partial failures are useful to revisit.
          if (!ac.signal.aborted && agent) {
            const snapshot: CouncilSnapshot = {
              id: runId,
              timestamp: new Date().toISOString(),
              plan: args.plan,
              userTask: args.userTask,
              events: collectedEvents,
              finalAnswer,
              totalCostCents,
              error: errMessage,
            }
            setSnapshot(agent.id, snapshot)
            setState((prev) => ({
              ...prev,
              snapshotTimestamp: snapshot.timestamp,
              snapshotPlan: snapshot.plan,
              snapshotTask: snapshot.userTask,
            }))
          }
        }
      })()
    },
    [container, agent, setSnapshot],
  )

  const reset = useCallback(() => {
    if (abortRef.current) abortRef.current.abort()
    if (agent) clearSnapshot(agent.id)
    setState(INITIAL)
  }, [agent, clearSnapshot])

  return { state, start, reset }
}
