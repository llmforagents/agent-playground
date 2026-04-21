# Manual QA Checklist

Run before each release or major change. Each check = one human action.

## Setup

- [ ] Fresh browser profile (or `/settings` → "Wipe local data").
- [ ] `.env.local` points at staging or real API.
- [ ] `npm run dev` boots without errors on port 4301.

## Agents

- [ ] `/agents` → register "qa-agent" → appears in the list.
- [ ] Topbar with zero agents shows a "+ Create agent" CTA.
- [ ] Topbar with exactly one agent shows a static badge (color dot + name), NOT a select.
- [ ] Topbar with two+ agents shows a shadcn Select with exactly ONE color dot in the trigger.
- [ ] Deleting an agent removes it from the topbar immediately.

## Health & models

- [ ] `/settings` → Ping /healthz returns `status: ok`.
- [ ] `/models` → table renders; `gemini-2.5-flash-lite` is present.

## Wallet & balance

- [ ] With 0 balance, `/chat` shows the "Deposit first" lock screen.
- [ ] `/wallet` → generate wallet → shows an address + copy button.
- [ ] After external deposit, manual refresh shows non-zero balance.
- [ ] "Watch for deposit" button pings every 3s for the first minute, then every 10s.
- [ ] Refreshing the page mid-watch resumes it (state survives F5).
- [ ] A concurrent chat spend in another tab does NOT trigger a false deposit toast.

## Chat (requires balance)

- [ ] Default model is `gemini-2.5-flash-lite`.
- [ ] Send "Hello" → streaming text appears incrementally.
- [ ] CostBadge shows cents + input/output tokens after done.
- [ ] Switching to a more expensive model pops confirmation dialog.
- [ ] Cancel during streaming stops text flow.
- [ ] Smart scroll: scroll up mid-stream → view stays put; a "↓ New messages" pill appears when new content arrives.
- [ ] Elapsed timer shows next to "Working… (iteration N)" while the model is thinking.
- [ ] DevTools console has `[agentic]` debug lines around each chat.completion.

## Chat with tools (cost guards)

- [ ] Ask "generate an image of a puppy" → tool card renders the image inline + assistant message ends.
- [ ] Console shows exactly ONE `[agentic] → chat.completion` after the tool call (short-circuit works).
- [ ] Balance drops by ~2 cents total, not 3+.
- [ ] If a tool fails, the run aborts immediately with a "tool_failed" message; no second chat.completion.
- [ ] Aborted state still renders the steps/tool cards accumulated before the failure.

## Transactions

- [ ] `/transactions` → shows the deposit and any chat usage lines.
- [ ] Filters (`deposit`/`usage`/`refund`) narrow the list.
- [ ] Pagination works.
- [ ] Known backend issue: `image:*` MCP calls debit the balance but may not appear as a row yet — flag if missing.

## Scraper one-shot

- [ ] `/scraper/one-shot` → `markdown` on `https://example.com` returns text.
- [ ] `screenshot` renders inline image.
- [ ] `pdf` renders inline PDF.
- [ ] Bad URL shows a typed error.

## Scraper sessions

- [ ] Create session → session appears in list with session_id.
- [ ] Exec `{"type":"goto","url":"https://example.com"}` returns JSON result.
- [ ] Close session removes it from the list.
- [ ] Session survives a browser reload (listed from IndexedDB).

## Search

- [ ] `/search` → web mode → `github` → returns organic results with title + link.
- [ ] news / maps modes return their respective typed shapes.
- [ ] Batch mode accepts N queries and returns N result sets.

## Images

- [ ] `/images` Generate → `a red dot on white, 512x512` → PNG renders inline with download link.
- [ ] `/images` Analyze → `What is in this image?` + `https://picsum.photos/id/237/512/512` → text answer renders (not a raw JSON blob).
- [ ] `/images` Edit → valid URL + prompt → JPEG renders inline (mime detected from magic bytes, not hard-coded png).
- [ ] On a backend failure (isError:true), the UI shows a typed error, balance is unchanged if the platform refunds.

## Send on-chain

- [ ] `/tx` → chain is locked to `polygon`, token picker shows USDC only.
- [ ] Invalid address → inline error, submit disabled.
- [ ] Amount > 6 decimal digits → inline error, submit disabled.
- [ ] Send 0.01 USDC to a test address → receipt shows txHash, from, to, amount, fee, chargedCents, and a working explorer link.
- [ ] ChainId 137 is NOT displayed in the UI (cleaner).

## Errors

- [ ] Use a wrong API key → `/balance` call shows "Unauthorized" modal/banner.
- [ ] Stop the dev server mid-request → network error surfaces.

## Theme & banner

- [ ] `/settings` → toggle theme → persists after reload.
- [ ] Mainnet banner appears initially → dismiss → hidden after reload.
- [ ] `/settings` → "Reset acknowledgement" makes it appear again.

## Chrome

- [ ] Sidebar brand reads "Playground".
- [ ] Topbar centered brand reads "LLM4Agents" (visible ≥ md breakpoint).
- [ ] Hover over any segmented tab (Transactions filters, Images modes, Wallet chain/token, etc.) paints the accent background + foreground text (same feel as sidebar NavLinks).
- [ ] Locale switcher EN/ES persists the choice across reloads.
