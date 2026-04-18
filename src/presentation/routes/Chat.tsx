import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { WrenchIcon, ChevronDownIcon, ChevronRightIcon, CheckIcon, XIcon, Loader2Icon } from 'lucide-react'
import { Button } from '@/presentation/components/ui/button'
import { Textarea } from '@/presentation/components/ui/textarea'
import { Card } from '@/presentation/components/ui/card'
import { ErrorView } from '@/presentation/components/ErrorView'
import { CostBadge } from '@/presentation/components/CostBadge'
import { ModelPicker } from '@/presentation/components/ModelPicker'
import { ToolsViewer } from '@/presentation/components/ToolsViewer'
import { useModels } from '@/presentation/hooks/useModels'
import { useBalance } from '@/presentation/hooks/useBalance'
import { useChatStream } from '@/presentation/hooks/useChatStream'
import { useAgenticChat, type AgenticStep } from '@/presentation/hooks/useAgenticChat'
import { useActiveAgent } from '@/presentation/hooks/useActiveAgent'
import type { ChatMessage } from '@/domain/chat'
import { DEFAULT_MODEL } from '@/domain/defaults'

type Role = ChatMessage['role']
type ConversationEntry =
  | { readonly kind: 'msg'; readonly role: Role; readonly content: string }
  | { readonly kind: 'agentic'; readonly steps: readonly AgenticStep[]; readonly finalText: string }

export function Chat() {
  const agent = useActiveAgent()
  const balance = useBalance()
  const models = useModels()
  const [model, setModel] = useState<string>(DEFAULT_MODEL)
  const [entries, setEntries] = useState<readonly ConversationEntry[]>([])
  const [input, setInput] = useState('')
  const [toolsOn, setToolsOn] = useState(true)

  const stream = useChatStream()
  const agentic = useAgenticChat()

  const bottomRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [entries, stream.state, agentic.state])

  useEffect(() => {
    if (stream.state.status === 'done') {
      const fullText = stream.state.fullText
      if (fullText) {
        setEntries((m) => [...m, { kind: 'msg', role: 'assistant', content: fullText }])
      }
    }
  }, [stream.state])

  useEffect(() => {
    if (agentic.state.status === 'done') {
      const { steps, text } = agentic.state
      setEntries((m) => [...m, { kind: 'agentic', steps, finalText: text }])
    }
  }, [agentic.state])

  const chatMessages = useMemo((): readonly ChatMessage[] => {
    const out: ChatMessage[] = []
    for (const e of entries) {
      if (e.kind === 'msg') out.push({ role: e.role, content: e.content })
      else if (e.finalText) out.push({ role: 'assistant', content: e.finalText })
    }
    return out
  }, [entries])

  if (!agent) return <p className="text-sm text-muted-foreground">Select an agent first.</p>

  const noBalance = balance.data && balance.data.availableUsdCents === 0
  if (noBalance) {
    return (
      <div className="mx-auto max-w-4xl">
        <Card className="p-8 text-center space-y-3">
          <div className="text-4xl">💸</div>
          <h2 className="text-lg font-semibold">Balance is $0.00</h2>
          <p className="text-sm text-muted-foreground">
            Chat completions cost real money. Deposit funds to unlock chat.
          </p>
          <div>
            <Link to="/wallet">
              <Button>Go to Wallet</Button>
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
    if (toolsOn) {
      void agentic.start({ model, messages: nextMessages })
    } else {
      void stream.start({ model, messages: nextMessages.map((m) => ({ role: m.role, content: m.content })), stream: true })
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
      <Card className="p-3 md:p-4 flex-shrink-0 overflow-visible relative z-30">
        <div className="flex items-center gap-2 md:gap-3 flex-wrap">
          <div className="w-full md:w-auto md:flex-1 md:min-w-[20rem]">
            <ModelPicker
              models={models.data?.models ?? []}
              value={model}
              onChange={setModel}
            />
          </div>
          <div className="flex items-center gap-2 md:ml-auto flex-wrap">
            <button
              type="button"
              onClick={() => setToolsOn((v) => !v)}
              className={`h-9 rounded-lg border px-3 text-xs flex items-center gap-1.5 transition-colors ${toolsOn ? 'border-primary bg-primary/10 text-foreground' : 'border-border bg-background text-muted-foreground hover:text-foreground'}`}
              title={toolsOn ? 'Tools enabled · the agent can call MCP tools' : 'Tools disabled · plain streaming'}
            >
              <WrenchIcon className="size-3.5" />
              Tools {toolsOn ? 'on' : 'off'}
            </button>
            <ToolsViewer />
            <CostBadge meta={doneMeta} />
            <Button size="sm" variant="ghost" onClick={clear} disabled={entries.length === 0 || busy}>
              Clear
            </Button>
          </div>
        </div>
      </Card>

      <Card className="flex-1 min-h-0 overflow-hidden flex flex-col">
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {entries.length === 0 && !busy && !currentError ? (
            <div className="h-full flex items-center justify-center text-center">
              <div className="max-w-sm space-y-2">
                <div className="text-3xl">💬</div>
                <div className="text-sm font-medium">Start a conversation</div>
                <div className="text-xs text-muted-foreground">
                  Default model <b>{DEFAULT_MODEL}</b>.
                  {toolsOn ? ' Tools enabled: the agent can search Google, fetch pages, extract data.' : ' Tools off: plain streaming.'}
                </div>
              </div>
            </div>
          ) : null}

          {entries.map((e, i) => e.kind === 'msg'
            ? <Bubble key={i} role={e.role} content={e.content} />
            : <AgenticBlock key={i} steps={e.steps} finalText={e.finalText} />
          )}

          {stream.state.status === 'streaming' ? (
            <Bubble role="assistant" content={stream.state.partial} streaming />
          ) : null}

          {agentic.state.status === 'running' ? (
            <AgenticBlock steps={agentic.state.steps} finalText="" isRunning iteration={agentic.state.iteration} />
          ) : null}

          {currentError ? (
            <div className="pt-2">
              <ErrorView error={currentError} />
            </div>
          ) : null}

          <div ref={bottomRef} />
        </div>
      </Card>

      <Card className="p-3 flex-shrink-0">
        <div className="flex gap-2 items-end">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={toolsOn ? 'Ask anything · the agent can use tools · Enter to send' : 'Type a message · Enter to send · Shift+Enter newline'}
            rows={2}
            className="resize-none min-h-[2.5rem] max-h-40"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
            }}
            disabled={busy}
          />
          {busy ? (
            <Button variant="destructive" onClick={stopAll}>Stop</Button>
          ) : (
            <Button onClick={send} disabled={!input.trim()}>Send</Button>
          )}
        </div>
      </Card>
    </div>
  )
}

function Bubble({ role, content, streaming = false }: { role: Role; content: string; streaming?: boolean }): React.JSX.Element {
  const isUser = role === 'user'
  const isAssistant = role === 'assistant'
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
          {role.charAt(0).toUpperCase() + role.slice(1)}{streaming ? ' · streaming' : ''}
        </div>
        <div
          className={`rounded-xl px-3 py-2 text-sm whitespace-pre-wrap break-words max-w-[85%] ${
            isUser
              ? 'bg-primary/10 text-foreground'
              : 'bg-muted/40 text-foreground'
          }`}
        >
          {content || (streaming ? <span className="text-muted-foreground italic">thinking…</span> : null)}
        </div>
      </div>
    </div>
  )
}

function AgenticBlock({
  steps, finalText, isRunning = false, iteration = 0,
}: {
  steps: readonly AgenticStep[]
  finalText: string
  isRunning?: boolean
  iteration?: number
}): React.JSX.Element {
  return (
    <div className="flex gap-3">
      <div className="size-8 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0 bg-emerald-500/15 text-emerald-600">
        A
      </div>
      <div className="flex-1 min-w-0 space-y-2">
        <div className="text-[10px] text-muted-foreground">
          Assistant{isRunning ? ` · working… (iteration ${iteration + 1})` : ''}
        </div>

        {steps.map((s, i) => {
          if (s.kind === 'tool') return <ToolStep key={i} step={s} />
          if (s.kind === 'mode_fallback') {
            return (
              <div key={i} className="rounded-xl border border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400 px-3 py-2 text-xs max-w-[85%]">
                ⚠ Switched from <b>{s.from}</b> to <b>{s.to}</b> tool mode · {s.reason}
              </div>
            )
          }
          if (s.text) {
            return (
              <div key={i} className="rounded-xl px-3 py-2 text-sm bg-muted/40 text-foreground whitespace-pre-wrap break-words max-w-[85%]">
                {s.text}
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
            thinking…
          </div>
        ) : null}
      </div>
    </div>
  )
}

function ToolStep({ step }: { step: Extract<AgenticStep, { kind: 'tool' }> }): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const statusIcon =
    step.status === 'running' ? <Loader2Icon className="size-3.5 animate-spin text-muted-foreground" />
    : step.status === 'ok' ? <CheckIcon className="size-3.5 text-emerald-600" />
    : <XIcon className="size-3.5 text-destructive" />

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
          <span className="text-muted-foreground">
            {step.status === 'running' ? 'running' : step.status === 'ok' ? 'done' : 'failed'}
          </span>
        </span>
      </button>

      {open ? (
        <div className="px-3 py-2 border-t border-border space-y-2 text-xs">
          <div>
            <div className="text-[10px] text-muted-foreground mb-1">Arguments</div>
            <pre className="font-mono text-[11px] bg-background rounded-md border border-border px-2 py-1.5 overflow-auto max-h-32">
              {safeStringify(step.args)}
            </pre>
          </div>
          {step.summary ? (
            <div>
              <div className="text-[10px] text-muted-foreground mb-1">Result</div>
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

function safeStringify(v: unknown): string {
  try { return JSON.stringify(v, null, 2) } catch { return String(v) }
}
