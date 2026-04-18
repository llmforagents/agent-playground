import { useCallback, useRef, useState } from 'react'
import { useAppContainer } from './useAppContainer'
import { useActiveAgent } from './useActiveAgent'
import type { ChatResponseMeta } from '@/application/ports'
import type { ChatCompletionRequest } from '@/infrastructure/schemas/rest'
import type { AppError } from '@/domain/errors'
import { coerceToAppError } from '@/domain/errors'

export type ChatStreamState =
  | { readonly status: 'idle' }
  | { readonly status: 'streaming'; readonly partial: string }
  | { readonly status: 'done'; readonly fullText: string; readonly meta: ChatResponseMeta }
  | { readonly status: 'error'; readonly partial: string; readonly error: AppError }

export function useChatStream() {
  const container = useAppContainer()
  const agent = useActiveAgent()
  const [state, setState] = useState<ChatStreamState>({ status: 'idle' })
  const abortRef = useRef<AbortController | null>(null)

  const start = useCallback(async (req: ChatCompletionRequest) => {
    if (!agent) return
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setState({ status: 'streaming', partial: '' })
    let partial = ''
    try {
      for await (const chunk of container.useCases.streamChatCompletion(agent.id, agent.apiKey, req, controller.signal)) {
        if (chunk.kind === 'delta') {
          partial += chunk.text
          setState({ status: 'streaming', partial })
        } else if (chunk.kind === 'done') {
          setState({ status: 'done', fullText: chunk.fullText, meta: chunk.meta })
        }
      }
    } catch (e) {
      setState({ status: 'error', partial, error: coerceToAppError(e) })
    }
  }, [container, agent])

  const stop = useCallback(() => abortRef.current?.abort(), [])

  return { state, start, stop }
}
