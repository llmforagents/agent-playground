import { useCallback, useRef, useState } from 'react'
import { useAppContainer } from './useAppContainer'
import { useActiveAgent } from './useActiveAgent'
import type { ChatResponseMeta } from '@/application/ports'
import type { ChatMessage } from '@/domain/chat'
import type { AppError } from '@/domain/errors'
import { coerceToAppError } from '@/domain/errors'
import type { DispatchMode } from '@/application/runAgenticChat'
import { useT } from './useT'

export type AgenticStep =
  | { readonly kind: 'assistant_text'; readonly text: string }
  | { readonly kind: 'mode_fallback'; readonly from: DispatchMode; readonly to: DispatchMode; readonly reason: string }
  | { readonly kind: 'tool'; readonly callId: string; readonly toolName: string; readonly args: unknown; readonly status: 'running' | 'ok' | 'error'; readonly summary?: string; readonly raw?: unknown }

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

  const start = useCallback(async (params: { model: string; messages: readonly ChatMessage[] }) => {
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
      })
      for await (const ev of gen) {
        if (controller.signal.aborted) break
        if (ev.kind === 'thinking') {
          iteration = ev.iteration
          mode = ev.mode
          setState({ status: 'running', iteration, mode, steps })
        } else if (ev.kind === 'assistant_text') {
          steps = [...steps, { kind: 'assistant_text', text: ev.text }]
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
            ev.reason === 'one_tool_policy' ? 'chat.abortedOneTool'
              : ev.reason === 'tool_cap_reached' ? 'chat.abortedCap'
                : 'chat.abortedToolFailed'
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
