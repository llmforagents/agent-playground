import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Card } from '@/presentation/components/ui/card'
import { Button } from '@/presentation/components/ui/button'
import { Input } from '@/presentation/components/ui/input'
import { Textarea } from '@/presentation/components/ui/textarea'
import { ErrorView } from '@/presentation/components/ErrorView'
import { JsonView } from '@/presentation/components/JsonView'
import { ProxyTierSelector } from '@/presentation/components/ProxyTierSelector'
import { CopyButton } from '@/presentation/components/CopyButton'
import { useAppContainer } from '@/presentation/hooks/useAppContainer'
import { useActiveAgent } from '@/presentation/hooks/useActiveAgent'
import { useSessions } from '@/presentation/hooks/useSessions'
import { SessionId } from '@/domain/branded'
import type { ProxyTier, McpSession } from '@/domain/scraper'

const DEFAULT_ACTION = `{
  "type": "goto",
  "url": "https://example.com"
}`

function shortSid(id: string): string {
  if (id.length <= 14) return id
  return `${id.slice(0, 8)}…${id.slice(-4)}`
}

function tierStyle(t: ProxyTier): string {
  switch (t) {
    case 'none': return 'bg-muted text-muted-foreground'
    case 'datacenter': return 'bg-sky-500/15 text-sky-600'
    case 'residential': return 'bg-purple-500/15 text-purple-600'
  }
}

export function ScraperSessions() {
  const agent = useActiveAgent()
  const container = useAppContainer()
  const { query, invalidate } = useSessions()
  const [tier, setTier] = useState<ProxyTier>('none')
  const [initialUrl, setInitialUrl] = useState('')
  const [actionText, setActionText] = useState<Record<string, string>>({})
  const [lastResult, setLastResult] = useState<{ sid: string; kind: 'exec' | 'status'; value: unknown } | null>(null)

  const createSession = useMutation({
    mutationFn: async () => {
      if (!agent) throw new Error('no agent')
      const res = await container.useCases.openSession(agent.id, agent.apiKey, tier, initialUrl || undefined)
      if (!res.ok) throw res.error
      await invalidate()
      return res.value
    },
    onSuccess: (sid) => { toast.success('Session created', { description: sid }) },
  })

  const closeSession = useMutation({
    mutationFn: async (id: string) => {
      if (!agent) throw new Error('no agent')
      const res = await container.useCases.closeSession(agent.id, agent.apiKey, SessionId(id))
      if (!res.ok) throw res.error
      await invalidate()
    },
    onSuccess: () => { toast.success('Session closed') },
  })

  const execAction = useMutation({
    mutationFn: async ({ sessionId, action }: { sessionId: string; action: string }) => {
      if (!agent) throw new Error('no agent')
      let parsed: unknown
      try { parsed = JSON.parse(action) } catch { throw { kind: 'invalid_params' as const, details: 'action must be JSON' } }
      const res = await container.useCases.callScraperTool(agent.id, agent.apiKey, 'session_exec', {
        session_id: sessionId, action: parsed,
      })
      if (!res.ok) throw res.error
      setLastResult({ sid: sessionId, kind: 'exec', value: res.value })
    },
  })

  const statusCheck = useMutation({
    mutationFn: async (sessionId: string) => {
      if (!agent) throw new Error('no agent')
      const res = await container.useCases.callScraperTool(agent.id, agent.apiKey, 'session_status', { session_id: sessionId })
      if (!res.ok) throw res.error
      setLastResult({ sid: sessionId, kind: 'status', value: res.value })
    },
  })

  if (!agent) return <p className="text-sm text-muted-foreground">Select an agent first.</p>

  const createErr = createSession.error
  const execErr = execAction.error
  const sessions = query.data ?? []

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Card className="p-6">
        <div className="text-center mb-4">
          <h2 className="text-lg font-semibold">Scraper · sessions</h2>
          <p className="text-xs text-muted-foreground mt-1">
            Open a browser session, run actions (goto, click, type…), close when done.
          </p>
        </div>

        <div className="mx-auto max-w-2xl space-y-4">
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Proxy tier</label>
            <ProxyTierSelector value={tier} onChange={setTier} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">
              Initial URL <span className="normal-case text-muted-foreground/60">(optional)</span>
            </label>
            <Input value={initialUrl} onChange={(e) => setInitialUrl(e.target.value)} placeholder="https://…" />
          </div>
          <Button className="w-full" onClick={() => createSession.mutate()} disabled={createSession.isPending}>
            {createSession.isPending ? 'Creating…' : 'Create session'}
          </Button>
          {createErr ? <ErrorView error={createErr} /> : null}
        </div>
      </Card>

      <section>
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h2 className="text-lg font-semibold">Active sessions</h2>
          <span className="text-xs text-muted-foreground">{sessions.length} open</span>
        </div>

        {sessions.length === 0 ? (
          <Card className="p-8 text-center">
            <p className="text-sm text-muted-foreground">
              No active sessions. Create one above to start browsing.
            </p>
          </Card>
        ) : (
          <div className="space-y-3">
            {sessions.map((s) => (
              <SessionCard
                key={s.id}
                session={s}
                actionText={actionText[s.id] ?? DEFAULT_ACTION}
                onActionTextChange={(t) => setActionText((m) => ({ ...m, [s.id]: t }))}
                onExec={() => execAction.mutate({ sessionId: s.id, action: actionText[s.id] ?? DEFAULT_ACTION })}
                onStatus={() => statusCheck.mutate(s.id)}
                onClose={() => closeSession.mutate(s.id)}
                execPending={execAction.isPending}
                statusPending={statusCheck.isPending}
                closePending={closeSession.isPending}
                resultForThisSession={lastResult?.sid === s.id ? lastResult : null}
              />
            ))}
          </div>
        )}
        {execErr ? <div className="mt-3"><ErrorView error={execErr} /></div> : null}
      </section>
    </div>
  )
}

function SessionCard({
  session,
  actionText,
  onActionTextChange,
  onExec,
  onStatus,
  onClose,
  execPending,
  statusPending,
  closePending,
  resultForThisSession,
}: {
  session: McpSession
  actionText: string
  onActionTextChange: (v: string) => void
  onExec: () => void
  onStatus: () => void
  onClose: () => void
  execPending: boolean
  statusPending: boolean
  closePending: boolean
  resultForThisSession: { kind: 'exec' | 'status'; value: unknown } | null
}): React.JSX.Element {
  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-start gap-3 flex-wrap">
        <span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${tierStyle(session.proxyTier)}`}>
          {session.proxyTier}
        </span>
        <div className="min-w-0 flex-1">
          <div className="font-mono text-sm truncate" title={session.id}>{shortSid(session.id)}</div>
          <div className="text-xs text-muted-foreground">
            created {new Date(session.createdAt).toLocaleString()}
            {session.lastActionAt ? ` · last action ${new Date(session.lastActionAt).toLocaleTimeString()}` : ''}
          </div>
          {session.initialUrl ? (
            <div className="text-xs text-muted-foreground truncate" title={session.initialUrl}>↗ {session.initialUrl}</div>
          ) : null}
        </div>
        <CopyButton text={session.id} label="Copy ID" size="sm" variant="ghost" />
      </div>

      <div>
        <label className="text-xs text-muted-foreground block mb-1">Action JSON</label>
        <Textarea
          rows={5}
          value={actionText}
          onChange={(e) => onActionTextChange(e.target.value)}
          className="font-mono text-xs"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={onExec} disabled={execPending}>
          {execPending ? 'Executing…' : 'Execute'}
        </Button>
        <Button size="sm" variant="secondary" onClick={onStatus} disabled={statusPending}>
          {statusPending ? 'Checking…' : 'Status'}
        </Button>
        <div className="flex-1" />
        <Button size="sm" variant="destructive" onClick={onClose} disabled={closePending}>
          {closePending ? 'Closing…' : 'Close'}
        </Button>
      </div>

      {resultForThisSession ? (
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-muted-foreground">
              {resultForThisSession.kind === 'exec' ? 'Last exec result' : 'Status'}
            </span>
          </div>
          <JsonView value={resultForThisSession.value} maxHeight="24rem" />
        </div>
      ) : null}
    </Card>
  )
}
