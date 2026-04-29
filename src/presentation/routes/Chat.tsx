import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowDownIcon, WrenchIcon, ChevronDownIcon, ChevronRightIcon, CheckIcon, XIcon, Loader2Icon } from 'lucide-react'
import { Button } from '@/presentation/components/ui/button'
import { Textarea } from '@/presentation/components/ui/textarea'
import { Card } from '@/presentation/components/ui/card'
import { ErrorView } from '@/presentation/components/ErrorView'
import { CostBadge } from '@/presentation/components/CostBadge'
import { ModelPicker } from '@/presentation/components/ModelPicker'
import { ToolsViewer } from '@/presentation/components/ToolsViewer'
import { EffortSelector } from '@/presentation/components/EffortSelector'
import { ReasoningBlock } from '@/presentation/components/ReasoningBlock'
import { useModels } from '@/presentation/hooks/useModels'
import { useBalance } from '@/presentation/hooks/useBalance'
import { useChatStream } from '@/presentation/hooks/useChatStream'
import { useAgenticChat } from '@/presentation/hooks/useAgenticChat'
import { useActiveAgent } from '@/presentation/hooks/useActiveAgent'
import { useT } from '@/presentation/hooks/useT'
import type { ChatMessage, AgenticStep, ConversationEntry } from '@/domain/chat'
import { useChatStore, DEFAULT_CHAT } from '@/presentation/hooks/useChatStore'
import { DEFAULT_MODEL } from '@/domain/defaults'
import { buildReasoningPayload, type Effort } from '@/domain/reasoning'
import type { ChatCompletionRequest } from '@/infrastructure/schemas/rest'

type Role = ChatMessage['role']

export function Chat() {
  const t = useT()
  const agent = useActiveAgent()
  const balance = useBalance()
  const models = useModels()
  const chat = useChatStore((s) => (agent ? s.byAgent[agent.id] : undefined)) ?? DEFAULT_CHAT
  const setChatBucket = useChatStore((s) => s.setChat)

  const entries  = chat.entries
  const model    = chat.model
  const toolsOn  = chat.toolsOn

  const setEntries = useCallback((next: readonly ConversationEntry[] | ((prev: readonly ConversationEntry[]) => readonly ConversationEntry[])): void => {
    if (!agent) return
    const current = useChatStore.getState().byAgent[agent.id] ?? DEFAULT_CHAT
    const resolved = typeof next === 'function' ? next(current.entries) : next
    setChatBucket(agent.id, { ...current, entries: resolved })
  }, [agent, setChatBucket])

  const setModel = useCallback((m: string): void => {
    if (!agent) return
    const current = useChatStore.getState().byAgent[agent.id] ?? DEFAULT_CHAT
    setChatBucket(agent.id, { ...current, model: m })
  }, [agent, setChatBucket])

  const setToolsOn = useCallback((updater: boolean | ((prev: boolean) => boolean)): void => {
    if (!agent) return
    const current = useChatStore.getState().byAgent[agent.id] ?? DEFAULT_CHAT
    const next = typeof updater === 'function' ? updater(current.toolsOn) : updater
    setChatBucket(agent.id, { ...current, toolsOn: next })
  }, [agent, setChatBucket])

  const effort: Effort = chat.effort ?? 'off'
  const setEffort = useCallback((next: Effort): void => {
    if (!agent) return
    const current = useChatStore.getState().byAgent[agent.id] ?? DEFAULT_CHAT
    setChatBucket(agent.id, { ...current, effort: next })
  }, [agent, setChatBucket])

  const [input, setInput] = useState('')

  const stream = useChatStream()
  const agentic = useAgenticChat()

  const scrollRef = useRef<HTMLDivElement | null>(null)
  const lastStreamDoneRef = useRef<unknown>(null)
  const lastAgenticDoneRef = useRef<unknown>(null)
  const lastStreamErrorRef = useRef<unknown>(null)
  const lastAgenticErrorRef = useRef<unknown>(null)
  const [isPinned, setIsPinned] = useState(true)
  const [hasNew, setHasNew] = useState(false)

  const scrollToBottom = useCallback((smooth = true): void => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' })
  }, [])

  const onScroll = useCallback((): void => {
    const el = scrollRef.current
    if (!el) return
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    const pinned = distanceFromBottom < 80
    setIsPinned(pinned)
    if (pinned) setHasNew(false)
  }, [])

  // Auto-scroll when pinned to bottom. If the user scrolled up, mark that
  // there's new content below instead of jerking the view back down.
  useEffect(() => {
    if (isPinned) {
      scrollToBottom()
    } else {
      setHasNew(true)
    }
  }, [entries, stream.state, agentic.state, isPinned, scrollToBottom])

  useEffect(() => {
    if (stream.state.status !== 'done') return
    // Guard against re-firing for the same done state when other deps change identity.
    if (lastStreamDoneRef.current === stream.state) return
    lastStreamDoneRef.current = stream.state
    const { fullText, fullReasoning } = stream.state
    if (!fullText) return
    setEntries((m) => [
      ...m,
      {
        kind: 'msg',
        role: 'assistant',
        content: fullText,
        ...(fullReasoning ? { reasoning: fullReasoning } : {}),
      },
    ])
  }, [stream.state, setEntries])

  useEffect(() => {
    if (agentic.state.status !== 'done') return
    if (lastAgenticDoneRef.current === agentic.state) return
    lastAgenticDoneRef.current = agentic.state
    const { steps, text } = agentic.state
    // Skip empty agentic results (no text + no steps) — nothing to render.
    if (!text && steps.length === 0) return
    setEntries((m) => [...m, { kind: 'agentic', steps, finalText: text }])
  }, [agentic.state, setEntries])

  // Persist errors as assistant messages so the conversation stays consistent
  // (every user turn has an assistant follow-up). Otherwise the model in the
  // next turn sees [user, user] without a response and can mis-route the reply.
  useEffect(() => {
    if (stream.state.status !== 'error') return
    if (lastStreamErrorRef.current === stream.state) return
    lastStreamErrorRef.current = stream.state
    const errMsg = stream.state.error.kind === 'unknown' && stream.state.error.message
      ? stream.state.error.message
      : 'Error: la respuesta no se pudo completar.'
    setEntries((m) => [...m, { kind: 'msg', role: 'assistant', content: `⚠️ ${errMsg}` }])
  }, [stream.state, setEntries])

  useEffect(() => {
    if (agentic.state.status !== 'error') return
    if (lastAgenticErrorRef.current === agentic.state) return
    lastAgenticErrorRef.current = agentic.state
    const errMsg = agentic.state.error.kind === 'unknown' && agentic.state.error.message
      ? agentic.state.error.message
      : 'Error: la respuesta no se pudo completar.'
    // Persist as agentic entry so any partial steps (tool calls that ran before the
    // error) are kept visible. finalText carries the error message.
    setEntries((m) => [...m, { kind: 'agentic', steps: agentic.state.status === 'error' ? agentic.state.steps : [], finalText: `⚠️ ${errMsg}` }])
  }, [agentic.state, setEntries])

  const chatMessages = useMemo((): readonly ChatMessage[] => {
    const out: ChatMessage[] = []
    for (const e of entries) {
      if (e.kind === 'msg') out.push({ role: e.role, content: e.content })
      else if (e.finalText) out.push({ role: 'assistant', content: e.finalText })
    }
    return out
  }, [entries])

  if (!agent) return <p className="text-sm text-muted-foreground">{t('noAgent.select')}</p>

  const noBalance = balance.data && balance.data.availableUsdCents === 0
  if (noBalance) {
    return (
      <div className="mx-auto max-w-4xl">
        <Card className="p-8 text-center space-y-3">
          <div className="text-4xl">💸</div>
          <h2 className="text-lg font-semibold">{t('chat.balanceZeroTitle')}</h2>
          <p className="text-sm text-muted-foreground">{t('chat.balanceZeroBody')}</p>
          <div>
            <Link to="/wallet">
              <Button>{t('chat.goToWallet')}</Button>
            </Link>
          </div>
        </Card>
      </div>
    )
  }

  const busy = stream.state.status === 'streaming' || agentic.state.status === 'running'

  const send = (): void => {
    const trimmed = input.trim()
    if (!trimmed || busy) return
    const userEntry: ConversationEntry = { kind: 'msg', role: 'user', content: trimmed }
    const nextEntries = [...entries, userEntry]
    setEntries(nextEntries)
    setInput('')
    const nextMessages: readonly ChatMessage[] = [...chatMessages, { role: 'user', content: trimmed }]
    const reasoningPayload = buildReasoningPayload(model, effort)
    const agenticReq: Parameters<typeof agentic.start>[0] = {
      model,
      messages: nextMessages,
      ...(reasoningPayload['reasoning'] ? { reasoning: reasoningPayload['reasoning'] as { effort?: 'low' | 'medium' | 'high'; max_tokens?: number } } : {}),
      ...(reasoningPayload['include_reasoning'] ? { include_reasoning: true as const } : {}),
    }
    const streamReq: ChatCompletionRequest = {
      model,
      messages: nextMessages.map((m) => ({ role: m.role, content: m.content })),
      stream: true,
      ...(reasoningPayload['reasoning'] ? { reasoning: reasoningPayload['reasoning'] as ChatCompletionRequest['reasoning'] } : {}),
      ...(reasoningPayload['include_reasoning'] ? { include_reasoning: true as const } : {}),
    }
    if (toolsOn) {
      void agentic.start(agenticReq)
    } else {
      void stream.start(streamReq)
    }
  }

  const clear = (): void => {
    setEntries([])
    setInput('')
  }

  const stopAll = (): void => {
    stream.stop()
    agentic.stop()
  }

  const streamMeta = stream.state.status === 'done' ? stream.state.meta : undefined
  const agenticMeta = agentic.state.status === 'done' ? agentic.state.meta : undefined
  const doneMeta = agenticMeta ?? streamMeta

  const streamError = stream.state.status === 'error' ? stream.state.error : null
  const agenticError = agentic.state.status === 'error' ? agentic.state.error : null
  const currentError = agenticError ?? streamError

  return (
    <div className="mx-auto max-w-4xl h-[calc(100vh-9rem)] flex flex-col gap-3">
      <Card className="p-3 md:p-4 flex-shrink-0 overflow-visible relative z-30 space-y-3">
        {doneMeta ? (
          <div className="flex justify-end pb-2 border-b border-border/50">
            <CostBadge meta={doneMeta} />
          </div>
        ) : null}
        <ModelPicker
          models={models.data?.models ?? []}
          value={model}
          onChange={setModel}
        />
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => setToolsOn((v) => !v)}
            className={`h-9 rounded-lg border px-3 text-xs flex items-center gap-1.5 transition-colors ${toolsOn ? 'border-primary bg-primary/10 text-foreground' : 'border-border bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground'}`}
            title={toolsOn ? t('chat.toolsOnHint') : t('chat.toolsOffHint')}
          >
            <WrenchIcon className="size-3.5" />
            {toolsOn ? t('chat.toolsOn') : t('chat.toolsOff')}
          </button>
          <ToolsViewer />
          <EffortSelector model={model} value={effort} onChange={setEffort} />
          <Button
            size="sm"
            variant="ghost"
            onClick={clear}
            disabled={entries.length === 0 || busy}
            className="ml-auto"
          >
            {t('common.clear')}
          </Button>
        </div>
      </Card>

      <Card className="flex-1 min-h-0 overflow-hidden flex flex-col relative">
        <div
          ref={scrollRef}
          onScroll={onScroll}
          className="flex-1 overflow-y-auto thin-scroll fade-scroll-mask p-4 space-y-4"
        >
          {entries.length === 0 && !busy && !currentError ? (
            <div className="h-full flex items-center justify-center text-center">
              <div className="max-w-sm space-y-2">
                <div className="text-3xl">💬</div>
                <div className="text-sm font-medium">{t('chat.startConversation')}</div>
                <div className="text-xs text-muted-foreground">
                  {t('chat.startHint')} <b>{DEFAULT_MODEL}</b>.
                  {toolsOn ? t('chat.startHintTools') : t('chat.startHintNoTools')}
                </div>
              </div>
            </div>
          ) : null}

          {entries.map((e, i) => e.kind === 'msg'
            ? <Bubble key={i} role={e.role} content={e.content} {...(e.reasoning ? { reasoning: e.reasoning } : {})} t={t} />
            : <AgenticBlock key={i} steps={e.steps} finalText={e.finalText} t={t} />
          )}

          {stream.state.status === 'streaming' ? (
            <Bubble
              role="assistant"
              content={stream.state.partial}
              {...(stream.state.partialReasoning ? { reasoning: stream.state.partialReasoning } : {})}
              streaming
              t={t}
            />
          ) : null}

          {agentic.state.status === 'running' ? (
            <AgenticBlock steps={agentic.state.steps} finalText="" isRunning iteration={agentic.state.iteration} t={t} />
          ) : null}

          {agentic.state.status === 'error' && agentic.state.steps.length > 0 ? (
            <AgenticBlock steps={agentic.state.steps} finalText="" t={t} />
          ) : null}

          {currentError ? (
            <div className="pt-2">
              <ErrorView error={currentError} />
            </div>
          ) : null}
        </div>

        {!isPinned && (entries.length > 0 || busy) ? (
          <button
            type="button"
            onClick={() => { scrollToBottom(); setHasNew(false) }}
            className={`absolute left-1/2 -translate-x-1/2 bottom-4 z-10 h-8 px-3 rounded-full border border-border bg-background text-foreground text-xs font-medium shadow-md flex items-center gap-1.5 hover:bg-muted transition-colors ${hasNew ? 'ring-2 ring-primary/40' : ''}`}
            aria-label={t('chat.scrollToLatest')}
          >
            <ArrowDownIcon className="size-3.5" />
            {hasNew ? t('chat.newMessages') : t('chat.scrollToLatest')}
          </button>
        ) : null}
      </Card>

      <Card className="p-3 flex-shrink-0">
        <div className="flex gap-2 items-end">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={toolsOn ? t('chat.placeholderTools') : t('chat.placeholderStream')}
            rows={2}
            className="resize-none min-h-[2.5rem] max-h-40"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
            }}
            disabled={busy}
          />
          {busy ? (
            <Button variant="destructive" onClick={stopAll}>{t('common.stop')}</Button>
          ) : (
            <Button onClick={send} disabled={!input.trim()}>{t('common.send')}</Button>
          )}
        </div>
      </Card>
    </div>
  )
}

type TFn = ReturnType<typeof useT>

function Bubble({ role, content, reasoning, streaming = false, t }: { role: Role; content: string; reasoning?: string; streaming?: boolean; t: TFn }): React.JSX.Element {
  const isUser = role === 'user'
  const isAssistant = role === 'assistant'
  const roleLabel = role === 'user' ? t('chat.user') : role === 'assistant' ? t('chat.assistant') : role
  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : ''}`}>
      <div
        className={`size-8 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0 ${
          isUser
            ? 'bg-primary text-primary-foreground'
            : isAssistant
              ? 'bg-emerald-500/15 text-emerald-600'
              : 'bg-muted text-muted-foreground'
        }`}
      >
        {isUser ? 'U' : isAssistant ? 'A' : 'S'}
      </div>
      <div className={`flex-1 min-w-0 ${isUser ? 'flex flex-col items-end' : ''}`}>
        <div className="text-[10px] text-muted-foreground mb-1">
          {roleLabel}{streaming ? ` · ${t('chat.streaming')}` : ''}
        </div>
        {isAssistant && reasoning ? (
          <ReasoningBlock reasoning={reasoning} isStreaming={streaming} />
        ) : null}
        <div
          className={`rounded-xl px-3 py-2 text-sm whitespace-pre-wrap break-words max-w-[85%] ${
            isUser
              ? 'bg-primary/10 text-foreground'
              : 'bg-muted/40 text-foreground'
          }`}
        >
          {content || (streaming ? <span className="text-muted-foreground italic">{t('chat.thinking')}</span> : null)}
        </div>
      </div>
    </div>
  )
}

function AgenticBlock({
  steps, finalText, isRunning = false, iteration = 0, t,
}: {
  steps: readonly AgenticStep[]
  finalText: string
  isRunning?: boolean
  iteration?: number
  t: TFn
}): React.JSX.Element {
  const [elapsedMs, setElapsedMs] = useState(0)
  const startRef = useRef<number | null>(null)

  useEffect(() => {
    if (!isRunning) { startRef.current = null; setElapsedMs(0); return }
    if (startRef.current === null) startRef.current = Date.now()
    setElapsedMs(Date.now() - startRef.current)
    const id = setInterval(() => {
      if (startRef.current !== null) setElapsedMs(Date.now() - startRef.current)
    }, 500)
    return () => clearInterval(id)
  }, [isRunning])

  const elapsedSec = Math.floor(elapsedMs / 1000)

  return (
    <div className="flex gap-3">
      <div className="size-8 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0 bg-emerald-500/15 text-emerald-600">
        A
      </div>
      <div className="flex-1 min-w-0 space-y-2">
        <div className="text-[10px] text-muted-foreground">
          {t('chat.assistant')}
          {isRunning ? ` · ${t('chat.working', { n: iteration + 1 })} · ${elapsedSec}s` : ''}
        </div>

        {steps.map((s, i) => {
          if (s.kind === 'tool') return <ToolStep key={i} step={s} t={t} />
          if (s.kind === 'mode_fallback') {
            return (
              <div key={i} className="rounded-xl border border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400 px-3 py-2 text-xs max-w-[85%]">
                ⚠ {t('chat.modeFallback', { from: s.from, to: s.to })} · {s.reason}
              </div>
            )
          }
          if (s.kind === 'assistant_text') {
            return (
              <div key={i}>
                {s.reasoning ? <ReasoningBlock reasoning={s.reasoning} isStreaming={false} /> : null}
                {s.text ? (
                  <div className="rounded-xl px-3 py-2 text-sm bg-muted/40 text-foreground whitespace-pre-wrap break-words max-w-[85%]">
                    {s.text}
                  </div>
                ) : null}
              </div>
            )
          }
          return null
        })}

        {finalText ? (
          <div className="rounded-xl px-3 py-2 text-sm bg-muted/40 text-foreground whitespace-pre-wrap break-words max-w-[85%]">
            {finalText}
          </div>
        ) : isRunning && steps.length === 0 ? (
          <div className="rounded-xl px-3 py-2 text-sm bg-muted/40 text-muted-foreground italic max-w-[85%]">
            {t('chat.thinking')} <span className="text-[10px] tabular-nums not-italic">({elapsedSec}s)</span>
          </div>
        ) : null}
      </div>
    </div>
  )
}

function ToolStep({ step, t }: { step: Extract<AgenticStep, { kind: 'tool' }>; t: TFn }): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const statusIcon =
    step.status === 'running' ? <Loader2Icon className="size-3.5 animate-spin text-muted-foreground" />
    : step.status === 'ok' ? <CheckIcon className="size-3.5 text-emerald-600" />
    : <XIcon className="size-3.5 text-destructive" />
  const statusLabel = step.status === 'running' ? t('chat.toolRunning') : step.status === 'ok' ? t('chat.toolDone') : t('chat.toolFailed')

  return (
    <div className="rounded-xl border border-border bg-muted/20 max-w-[85%] overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-muted/40 transition-colors"
      >
        {open ? <ChevronDownIcon className="size-3.5 flex-shrink-0 text-muted-foreground" /> : <ChevronRightIcon className="size-3.5 flex-shrink-0 text-muted-foreground" />}
        <WrenchIcon className="size-3.5 flex-shrink-0 text-muted-foreground" />
        <span className="font-mono font-medium truncate">{step.toolName}</span>
        <span className="ml-auto flex items-center gap-1 flex-shrink-0">
          {statusIcon}
          <span className="text-muted-foreground">{statusLabel}</span>
        </span>
      </button>

      <ToolImagePreview raw={step.raw} />

      {open ? (
        <div className="px-3 py-2 border-t border-border space-y-2 text-xs">
          <div>
            <div className="text-[10px] text-muted-foreground mb-1">{t('chat.toolArgs')}</div>
            <pre className="font-mono text-[11px] bg-background rounded-md border border-border px-2 py-1.5 overflow-auto max-h-32">
              {safeStringify(step.args)}
            </pre>
          </div>
          {step.summary ? (
            <div>
              <div className="text-[10px] text-muted-foreground mb-1">{t('chat.toolResult')}</div>
              <pre className="font-mono text-[11px] bg-background rounded-md border border-border px-2 py-1.5 overflow-auto max-h-48 whitespace-pre-wrap break-words">
                {step.summary}
              </pre>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function ToolImagePreview({ raw }: { raw: unknown }): React.JSX.Element | null {
  if (!raw || typeof raw !== 'object') return null
  const content = (raw as { content?: readonly unknown[] }).content
  if (!Array.isArray(content)) return null
  const first = content[0] as { type?: string; data?: string; mimeType?: string } | undefined
  if (!first || first.type !== 'image' || !first.data || !first.mimeType) return null
  const dataUri = `data:${first.mimeType};base64,${first.data}`
  return (
    <div className="border-t border-border p-2 bg-muted/20">
      <img
        src={dataUri}
        alt="tool output"
        className="max-w-full h-auto rounded-md mx-auto"
      />
      <a href={dataUri} download="image.png" className="block text-center text-[10px] text-muted-foreground mt-1 hover:text-foreground">
        ⤓ PNG
      </a>
    </div>
  )
}

function safeStringify(v: unknown): string {
  try { return JSON.stringify(v, null, 2) } catch { return String(v) }
}
