import { useCallback, useRef, useState } from 'react'
import { useAppContainer } from './useAppContainer'
import { useActiveAgent } from './useActiveAgent'
import type { ChatResponseMeta } from '@/application/ports'
import type { ChatMessage, DispatchMode, AgenticStep } from '@/domain/chat'
import type { AppError } from '@/domain/errors'
import { coerceToAppError } from '@/domain/errors'
import { useT } from './useT'

export type { AgenticStep }

export type AgenticChatState =
  | { readonly status: 'idle' }
  | { readonly status: 'running'; readonly iteration: number; readonly mode: DispatchMode; readonly steps: readonly AgenticStep[] }
  | { readonly status: 'done'; readonly text: string; readonly meta: ChatResponseMeta; readonly steps: readonly AgenticStep[]; readonly mode: DispatchMode }
  | { readonly status: 'error'; readonly error: AppError; readonly steps: readonly AgenticStep[] }

export function useAgenticChat() {
  const t = useT()
  const container = useAppContainer()
  const agent = useActiveAgent()
  const [state, setState] = useState<AgenticChatState>({ status: 'idle' })
  const abortRef = useRef<AbortController | null>(null)

  const start = useCallback(async (params: {
    model: string
    messages: readonly ChatMessage[]
    reasoning?: { effort?: 'low' | 'medium' | 'high'; max_tokens?: number }
    include_reasoning?: boolean
  }) => {
    if (!agent) return
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    let steps: readonly AgenticStep[] = []
    let iteration = 0
    let mode: DispatchMode = 'native'
    setState({ status: 'running', iteration, mode, steps })

    try {
      const gen = container.useCases.runAgenticChat(agent.id, agent.apiKey, {
        model: params.model,
        messages: params.messages,
        signal: controller.signal,
        ...(params.reasoning ? { reasoning: params.reasoning } : {}),
        ...(params.include_reasoning ? { include_reasoning: params.include_reasoning } : {}),
      })
      for await (const ev of gen) {
        if (controller.signal.aborted) break
        if (ev.kind === 'thinking') {
          iteration = ev.iteration
          mode = ev.mode
          setState({ status: 'running', iteration, mode, steps })
        } else if (ev.kind === 'assistant_text') {
          steps = [...steps, {
            kind: 'assistant_text',
            text: ev.text,
            ...(ev.reasoning ? { reasoning: ev.reasoning } : {}),
          }]
          setState({ status: 'running', iteration, mode, steps })
        } else if (ev.kind === 'mode_fallback') {
          steps = [...steps, { kind: 'mode_fallback', from: ev.from, to: ev.to, reason: ev.reason }]
          mode = ev.to
          setState({ status: 'running', iteration, mode, steps })
        } else if (ev.kind === 'tool_call') {
          steps = [...steps, { kind: 'tool', callId: ev.callId, toolName: ev.toolName, args: ev.args, status: 'running' }]
          setState({ status: 'running', iteration, mode, steps })
        } else if (ev.kind === 'tool_result') {
          steps = steps.map((s) =>
            s.kind === 'tool' && s.callId === ev.callId
              ? { ...s, status: ev.ok ? 'ok' : 'error', summary: ev.summary, raw: ev.raw }
              : s
          )
          setState({ status: 'running', iteration, mode, steps })
        } else if (ev.kind === 'final') {
          setState({ status: 'done', text: ev.text, meta: ev.meta, steps, mode })
          return
        } else if (ev.kind === 'max_iterations') {
          setState({ status: 'error', error: { kind: 'unknown', message: t('chat.maxIterationsError'), raw: null }, steps })
          return
        } else if (ev.kind === 'aborted') {
          const msgKey =
            ev.reason === 'tool_cap_reached' ? 'chat.abortedCap' : 'chat.abortedToolFailed'
          setState({
            status: 'error',
            error: { kind: 'unknown', message: t(msgKey, { tool: ev.toolName, detail: ev.detail }), raw: null },
            steps,
          })
          return
        } else if (ev.kind === 'error') {
          setState({ status: 'error', error: ev.error, steps })
          return
        }
      }
    } catch (e) {
      setState({ status: 'error', error: coerceToAppError(e), steps })
    }
  }, [agent, container])

  const stop = useCallback(() => abortRef.current?.abort(), [])

  return { state, start, stop }
}
