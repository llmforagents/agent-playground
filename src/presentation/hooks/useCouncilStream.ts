import { useCallback, useRef, useState } from 'react'
import type { CouncilConfig } from '@/domain/council'
import type { CouncilEvent } from '@/domain/councilEvents'
import { useAppContainer } from './useAppContainer'
import { useActiveAgent } from './useActiveAgent'

export type CouncilUiState = Readonly<{
  isRunning: boolean
  events: ReadonlyArray<CouncilEvent>
  finalAnswer: string | null
  totalCostCents: number
  error: string | null
}>

const INITIAL: CouncilUiState = {
  isRunning: false,
  events: [],
  finalAnswer: null,
  totalCostCents: 0,
  error: null,
}

export function useCouncilStream(): {
  state: CouncilUiState
  start: (args: { config: CouncilConfig; userTask: string }) => void
  reset: () => void
} {
  const container = useAppContainer()
  const agent = useActiveAgent()
  const [state, setState] = useState<CouncilUiState>(INITIAL)
  const abortRef = useRef<AbortController | null>(null)

  const start = useCallback(
    (args: { config: CouncilConfig; userTask: string }) => {
      if (!agent) {
        setState({ ...INITIAL, error: 'No active agent — register or activate one first.' })
        return
      }
      if (abortRef.current) abortRef.current.abort()
      const ac = new AbortController()
      abortRef.current = ac

      setState({ ...INITIAL, isRunning: true })

      void (async () => {
        try {
          const generator = container.useCases.runCouncilChat(agent.id, agent.apiKey, args)
          for await (const event of generator) {
            if (ac.signal.aborted) return
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
          setState((prev) => ({
            ...prev,
            isRunning: false,
            error: e instanceof Error ? e.message : String(e),
          }))
        }
      })()
    },
    [container, agent],
  )

  const reset = useCallback(() => {
    if (abortRef.current) abortRef.current.abort()
    setState(INITIAL)
  }, [])

  return { state, start, reset }
}
