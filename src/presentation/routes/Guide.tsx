import { Link } from 'react-router-dom'
import { Card } from '@/presentation/components/ui/card'
import { Button } from '@/presentation/components/ui/button'

type Step = Readonly<{
  number: number
  title: string
  body: React.ReactNode
  cta?: { to: string; label: string }
}>

const STEPS: readonly Step[] = [
  {
    number: 1,
    title: 'Register an agent',
    body: (
      <>
        An <b>agent</b> is a named handle with its own API key, balance, and usage history.
        Register one per team member or per use case. The API key lives in your browser&rsquo;s
        IndexedDB and is sent with every request.
      </>
    ),
    cta: { to: '/agents', label: 'Go to Agents' },
  },
  {
    number: 2,
    title: 'Activate the agent',
    body: (
      <>
        In Agents, click <b>Activate</b> on the one you want to use. The green dot in the topbar
        shows which agent is currently active. Switching agents instantly changes which balance,
        wallet addresses, and history you see across the dashboard.
      </>
    ),
  },
  {
    number: 3,
    title: 'Generate a deposit wallet',
    body: (
      <>
        Open Wallet and pick a <b>chain</b> (Solana or Polygon) + <b>token</b> (USDC or USDT).
        The same combination always returns the same address (idempotent). Click{' '}
        <b>Sync all</b> to pull every wallet this agent has generated across sessions.
      </>
    ),
    cta: { to: '/wallet', label: 'Go to Wallet' },
  },
  {
    number: 4,
    title: 'Fund the wallet from an external account',
    body: (
      <>
        Send USDT or USDC on the selected chain to the address. Minimums around $1 recommended
        — dust might be ignored by the indexer. After the transfer confirms on-chain, click{' '}
        <b>Watch for deposit</b> in Wallet — the dashboard polls balance every 8 seconds and
        shows a toast when the credit lands.
      </>
    ),
  },
  {
    number: 5,
    title: 'Test chat completions',
    body: (
      <>
        Chat uses <code>google/gemini-2.5-flash-lite</code> by default (the cheapest). Switching
        to a pricier model triggers a confirmation dialog. With <b>Tools on</b> the agent can
        invoke MCP tools automatically for live data (search, scraping). Click <b>View tools</b>{' '}
        to see what&rsquo;s available. Streaming disables during agentic (tools) mode, re-enables
        when you toggle Tools off.
      </>
    ),
    cta: { to: '/chat', label: 'Go to Chat' },
  },
  {
    number: 6,
    title: 'Use the scraper and search APIs directly',
    body: (
      <>
        <b>Scraper (one-shot)</b> runs a single browser call (fetch HTML, markdown, screenshot,
        PDF, links, extract).
        <br />
        <b>Scraper (sessions)</b> keeps a persistent browser session for multi-step workflows.
        <br />
        <b>Search</b> hits Google (web / news / maps) or batches up to 100 queries in one call.
      </>
    ),
  },
  {
    number: 7,
    title: 'Review your usage',
    body: (
      <>
        Transactions lists every paid action (deposits, usage, refunds) with per-turn cost and
        tokens. Filter by type and paginate 25 at a time. Home shows the most recent 5 for a
        quick pulse.
      </>
    ),
    cta: { to: '/transactions', label: 'Go to Transactions' },
  },
]

export function Guide(): React.JSX.Element {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Card className="p-6">
        <h1 className="text-2xl font-bold mb-2">Guide</h1>
        <p className="text-sm text-muted-foreground">
          A quick walkthrough of what each route does and how to run your first end-to-end test.
          Every request here talks to <b>mainnet</b> with real money — the mainnet banner stays
          visible until you acknowledge it.
        </p>
      </Card>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Step-by-step</h2>
        <div className="space-y-3">
          {STEPS.map((s) => (
            <Card key={s.number} className="p-4 sm:p-5">
              <div className="flex items-start gap-3 sm:gap-4">
                <div className="flex-shrink-0 size-8 rounded-full bg-muted text-foreground flex items-center justify-center text-sm font-semibold">
                  {s.number}
                </div>
                <div className="flex-1 min-w-0 space-y-2">
                  <h3 className="text-base font-semibold">{s.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{s.body}</p>
                  {s.cta ? (
                    <div>
                      <Link to={s.cta.to}>
                        <Button size="sm" variant="secondary">{s.cta.label} →</Button>
                      </Link>
                    </div>
                  ) : null}
                </div>
              </div>
            </Card>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Tips &amp; guardrails</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Card className="p-4 space-y-1">
            <div className="text-sm font-semibold">💵 Default model is flash-lite</div>
            <p className="text-xs text-muted-foreground">
              Cheapest option. Everything else prompts a confirmation. Use it for QA.
            </p>
          </Card>
          <Card className="p-4 space-y-1">
            <div className="text-sm font-semibold">🔁 No auto-retries on chat</div>
            <p className="text-xs text-muted-foreground">
              Failed chat completions don&rsquo;t retry automatically on 401 / 402 / 422 to avoid
              burning balance on a broken request.
            </p>
          </Card>
          <Card className="p-4 space-y-1">
            <div className="text-sm font-semibold">🪪 Multi-agent isolation</div>
            <p className="text-xs text-muted-foreground">
              Each agent has its own IndexedDB records: wallets, history, sessions. Switch at any
              time from the topbar.
            </p>
          </Card>
          <Card className="p-4 space-y-1">
            <div className="text-sm font-semibold">⏱ Rate limits</div>
            <p className="text-xs text-muted-foreground">
              Chat: 600 req/min per key. Other endpoints: 120 req/min. Registration: 5/hr per IP.
            </p>
          </Card>
          <Card className="p-4 space-y-1">
            <div className="text-sm font-semibold">🧹 Wipe local data</div>
            <p className="text-xs text-muted-foreground">
              Settings → Danger zone clears agents, wallets, history in this browser only.
              Does <b>not</b> affect the backend.
            </p>
          </Card>
          <Card className="p-4 space-y-1">
            <div className="text-sm font-semibold">🛠 System health</div>
            <p className="text-xs text-muted-foreground">
              Settings has a &ldquo;Ping /healthz&rdquo; button to verify API connectivity
              without spending balance.
            </p>
          </Card>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Troubleshooting</h2>
        <Card className="p-4 text-sm space-y-2">
          <div>
            <b>Chat says &ldquo;balance is $0&rdquo;</b>
            <p className="text-muted-foreground mt-0.5">Deposit lands first; the lock screen disappears automatically when you refresh balance.</p>
          </div>
          <div className="pt-2 border-t border-border">
            <b>Tool call failed</b>
            <p className="text-muted-foreground mt-0.5">Check network tab; the MCP endpoint requires both application/json and text/event-stream accept headers — already handled by the client.</p>
          </div>
          <div className="pt-2 border-t border-border">
            <b>Validation failed: N issues</b>
            <p className="text-muted-foreground mt-0.5">API response shape changed upstream. Each schema is <code>.loose()</code> so extra fields pass through; required fields that go missing are the ones that bite. Report with the requestId shown in the error.</p>
          </div>
          <div className="pt-2 border-t border-border">
            <b>Deposit on-chain but balance unchanged</b>
            <p className="text-muted-foreground mt-0.5">Verify the tx hash went to the address that <code>POST /wallets/generate</code> returns for the active agent. Contact support with agent UUID + tx hash if it matches.</p>
          </div>
        </Card>
      </section>
    </div>
  )
}
