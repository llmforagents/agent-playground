# Manual QA Checklist

Run before each release or major change. Each check = one human action.

## Setup

- [ ] Fresh browser profile (or `/settings` → "Wipe local data").
- [ ] `.env.local` points at staging or real API.
- [ ] `npm run dev` boots without errors on port 4301.

## Agents

- [ ] `/agents` → register "qa-agent" → appears in the list.
- [ ] Topbar dropdown shows "qa-agent" and it is selectable.
- [ ] Deleting the agent removes it from dropdown.

## Health & models

- [ ] `/health` → Ping returns `status: ok`.
- [ ] `/models` → table renders; `gemini-2.5-flash-lite` is present.

## Wallet & balance

- [ ] With 0 balance, `/chat` shows the "Deposit first" lock screen.
- [ ] `/wallet` → generate wallet → shows an address + copy button.
- [ ] After external deposit, manual refresh shows non-zero balance.

## Chat (requires balance)

- [ ] Default model is `gemini-2.5-flash-lite`.
- [ ] Send "Hello" → streaming text appears incrementally.
- [ ] CostBadge shows cents + input/output tokens after done.
- [ ] Switching to a more expensive model pops confirmation dialog.
- [ ] Cancel during streaming stops text flow.

## Transactions

- [ ] `/transactions` → shows the deposit and any chat usage lines.
- [ ] Filters (`deposit`/`usage`/`refund`) narrow the list.
- [ ] Pagination works.

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

## Errors

- [ ] Use a wrong API key → `/balance` call shows "Unauthorized" modal/banner.
- [ ] Stop the dev server mid-request → network error surfaces.

## Theme & banner

- [ ] `/settings` → toggle theme → persists after reload.
- [ ] Mainnet banner appears initially → dismiss → hidden after reload.
- [ ] `/settings` → "Reset acknowledgement" makes it appear again.
