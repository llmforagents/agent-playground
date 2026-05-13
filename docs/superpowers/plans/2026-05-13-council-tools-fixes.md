# Council Tools — Post-Implementation Refinements

> **Companion to:** [`docs/superpowers/plans/2026-05-13-council-tools.md`](./2026-05-13-council-tools.md)

After executing the 15-task base plan, the following six refinements were
applied in response to user testing. **Apply these AFTER the base plan**
(or after equivalent code is in place).

**Baseline verification commands** (run between every refinement):
```bash
npm run typecheck
npm run lint
npm run test:ci
```

Tests must stay at the same count as after the base plan (158 in the
reference repo). Each refinement is independent — they can be applied in
order, skipping any that don't fit the target repo.

---

## Refinement 1: Persist completed runs even when aborted mid-finally

**Why:** users reported that the badge "Corrida activa" sometimes appeared
on screen but the run never landed in the history. Root cause: when
`council_done` arrived, `setState({ isRunning: false })` enabled the
"Nueva corrida" button. If the user clicked it before the `finally` block
got to call `addRun`, `closeRun()` aborted the controller. The previous
guard `if (!ac.signal.aborted && agent)` then skipped persistence.

**File:** `src/presentation/hooks/useCouncilStream.ts`

**Change inside the `start` callback's `finally` block:**

```ts
// BEFORE
} finally {
  if (!ac.signal.aborted && agent) {
    // Drop *_delta events before persisting — they're redundant with the
    // matching *_done.content fields and explode storage size (~785
    // events/run vs ~25 lifecycle events). The UI's reduceEvents writes
    // b.text = e.content on every *_done, so a delta-free history
    // re-renders identically.
    const persistableEvents = collectedEvents.filter(
      // ... rest of block
    )
    // ...
  }
}

// AFTER
} finally {
  // Persist if the run completed naturally (council_done/council_failed
  // already emitted), even when an abort fired immediately after — the
  // race happens when the user clicks "Nueva corrida" or navigates the
  // moment the button enables, before the finally has had a chance to
  // call addRun. Aborts that hit BEFORE completion still skip persist.
  const ranToCompletion = collectedEvents.some(
    (e) => e.kind === 'council_done' || e.kind === 'council_failed',
  )
  if ((ranToCompletion || !ac.signal.aborted) && agent) {
    // Drop *_delta events before persisting — they're redundant with the
    // matching *_done.content fields and explode storage size (~785
    // events/run vs ~25 lifecycle events). The UI's reduceEvents writes
    // b.text = e.content on every *_done, so a delta-free history
    // re-renders identically.
    const persistableEvents = collectedEvents.filter(
      // ... rest of block unchanged
    )
    // ...
  }
}
```

**Commit message convention used in the reference repo:**
```
fix(council): persist completed runs even when aborted mid-finally
```

---

## Refinement 2: Active-run badge — copy task + new-run buttons

**Why:** when a run finished, the user had to scroll past the entire
stream area to find the "Nueva corrida" button at the bottom. Also,
copying the original prompt to reuse it required selecting text by hand.

**File:** `src/presentation/routes/Council.tsx`

**Add imports at the top:**

```ts
import { useState } from 'react'
import { toast } from 'sonner'
import { CopyIcon, PlusIcon } from 'lucide-react'
// ...keep existing imports...
import { safeCopy } from '@/lib/clipboard'
```

**Inside the `Council` component, add state + handler near the top:**

```tsx
const [taskCopied, setTaskCopied] = useState(false)

const handleCopyTask = async (): Promise<void> => {
  if (!state.activeTask) return
  const res = await safeCopy(state.activeTask)
  if (res.ok) {
    setTaskCopied(true)
    toast.success(t('common.copied'))
    setTimeout(() => setTaskCopied(false), 1500)
  } else {
    toast.error(t('common.copy'), { description: res.reason })
  }
}
```

**Replace the badge JSX** (the `<div>` with `📌 t('council.lastRun')`):

```tsx
// BEFORE
{state.activeTimestamp && !state.isRunning ? (
  <div className="rounded-lg border border-border bg-muted/30 px-4 py-2 text-xs text-muted-foreground flex flex-wrap items-center gap-2">
    <span>📌 {t('council.lastRun')}</span>
    <span className="font-mono">
      {new Date(state.activeTimestamp).toLocaleString()}
    </span>
    {state.activePlan ? (
      <span className="rounded-md bg-foreground/10 px-1.5 py-0.5 font-medium">
        {state.activePlan}
      </span>
    ) : null}
    {state.activeTask ? (
      <span className="truncate flex-1 min-w-0" title={state.activeTask}>
        · {state.activeTask}
      </span>
    ) : null}
  </div>
) : null}

// AFTER
{state.activeTimestamp && !state.isRunning ? (
  <div className="rounded-lg border border-border bg-muted/30 px-4 py-2 text-xs text-muted-foreground flex flex-wrap items-center gap-2">
    <span>📌 {t('council.lastRun')}</span>
    <span className="font-mono">
      {new Date(state.activeTimestamp).toLocaleString()}
    </span>
    {state.activePlan ? (
      <span className="rounded-md bg-foreground/10 px-1.5 py-0.5 font-medium">
        {state.activePlan}
      </span>
    ) : null}
    {state.activeTask ? (
      <>
        <span className="truncate flex-1 min-w-0" title={state.activeTask}>
          · {state.activeTask}
        </span>
        <button
          type="button"
          onClick={() => { void handleCopyTask() }}
          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md hover:bg-foreground/10 transition-colors flex-shrink-0"
          aria-label={t('common.copy')}
          title={t('common.copy')}
        >
          <CopyIcon className="size-3" aria-hidden="true" />
          <span>{taskCopied ? t('common.copied') : t('common.copy')}</span>
        </button>
      </>
    ) : null}
    <Button
      size="sm"
      variant="outline"
      onClick={closeRun}
      className="ml-auto flex-shrink-0 h-7"
    >
      <PlusIcon className="size-3 mr-1" aria-hidden="true" />
      {t('council.newRun')}
    </Button>
  </div>
) : null}
```

**Required i18n keys** (must already exist in the catalog):
- `common.copy` (EN: "Copy" / ES: "Copiar")
- `common.copied` (EN: "Copied!" / ES: "¡Copiado!")
- `council.newRun` (EN: "New run" / ES: "Nueva corrida")
- `council.lastRun` (EN: "Last run" / ES: "Última corrida")

**Commit:**
```
feat(council): UI polish — active-run badge with copy + new-run buttons
```

---

## Refinement 3: ModelPicker dropdown — Portal to body (final fix)

**Why:** the chairman picker on `/council` is the last form field on a
page where ancestors use `overflow-hidden` (the shadcn Card wrapping the
setup). Even with flip-upward and clamped maxHeight, the dropdown was
clipped against the Card's rounded border. The definitive fix is to
render the dropdown via `React.createPortal` into `document.body` with
`position: fixed` and viewport-clamped coordinates, escaping ALL ancestor
overflows.

**File:** `src/presentation/components/ModelPicker.tsx`

**Full target shape** (replace the entire component):

```tsx
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { SearchIcon, XIcon } from 'lucide-react'
import { DEFAULT_MODEL } from '@/domain/defaults'
import type { ModelInfo } from '@/infrastructure/schemas/rest'

type Props = Readonly<{
  models: readonly ModelInfo[]
  value: string
  onChange: (slug: string) => void
}>

function fmtPrice(p: number): string {
  if (!Number.isFinite(p) || p < 0) return 'variable'
  return `$${p.toFixed(2)}`
}

export function ModelPicker({ models, value, onChange }: Props) {
  const defaultModel = useMemo(() => models.find((m) => m.slug === DEFAULT_MODEL), [models])
  const selected = useMemo(() => models.find((m) => m.slug === value), [models, value])
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)
  const [confirmPending, setConfirmPending] = useState<string | null>(null)
  // Dropdown is rendered via a portal to document.body with position:fixed
  // because the ModelPicker lives inside cards with `overflow-hidden` that
  // would otherwise clip the dropdown. We compute viewport coordinates
  // (left/top OR bottom + width) from the input's getBoundingClientRect on
  // every open/resize/scroll. Coordinates are clamped to the viewport so the
  // list never extends past the screen edges.
  type DropdownPos = Readonly<{
    left: number
    width: number
    /** Either `top` (open downward) or `bottom` (open upward). */
    top?: number
    bottom?: number
    maxHeight: number
  }>
  const [dropdownPos, setDropdownPos] = useState<DropdownPos | null>(null)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const inputWrapperRef = useRef<HTMLDivElement | null>(null)
  const dropdownRef = useRef<HTMLDivElement | null>(null)

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return []
    return models
      .filter((m) =>
        m.slug.toLowerCase().includes(term) ||
        m.displayName.toLowerCase().includes(term) ||
        (m.provider?.toLowerCase().includes(term) ?? false)
      )
      .slice(0, 50)
  }, [models, search])

  useEffect(() => {
    if (!open) return
    const onDocClick = (e: MouseEvent): void => {
      // The dropdown is rendered in a portal so it's not a child of rootRef.
      // Treat clicks inside either the root OR the portaled dropdown as inside.
      const target = e.target as Node
      const insideRoot = rootRef.current?.contains(target) ?? false
      const insideDropdown = dropdownRef.current?.contains(target) ?? false
      if (!insideRoot && !insideDropdown) setOpen(false)
    }
    const onEsc = (e: KeyboardEvent): void => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onEsc)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onEsc)
    }
  }, [open])

  // Re-compute portal coordinates on open, search changes (filtered count),
  // resize, and ANY scroll (capture phase catches scrolling ancestors too).
  useEffect(() => {
    if (!open || !inputWrapperRef.current) {
      setDropdownPos(null)
      return
    }
    const MARGIN = 12
    const IDEAL_HEIGHT = 320
    const compute = (): void => {
      const el = inputWrapperRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const spaceBelow = window.innerHeight - rect.bottom - MARGIN
      const spaceAbove = rect.top - MARGIN
      const flip = spaceBelow < IDEAL_HEIGHT && spaceAbove > spaceBelow
      const available = Math.max(80, flip ? spaceAbove : spaceBelow)
      const maxHeight = Math.min(IDEAL_HEIGHT, available)
      const base: { left: number; width: number; maxHeight: number } = {
        left: rect.left,
        width: rect.width,
        maxHeight,
      }
      setDropdownPos(
        flip
          ? { ...base, bottom: window.innerHeight - rect.top + 4 }
          : { ...base, top: rect.bottom + 4 },
      )
    }
    compute()
    window.addEventListener('resize', compute)
    window.addEventListener('scroll', compute, true)
    return () => {
      window.removeEventListener('resize', compute)
      window.removeEventListener('scroll', compute, true)
    }
  }, [open, search])

  const attemptChange = (nextSlug: string): void => {
    setOpen(false)
    setSearch('')
    if (nextSlug === value) return
    const next = models.find((m) => m.slug === nextSlug)
    if (!next || !defaultModel) { onChange(nextSlug); return }
    const nextPrice = Math.max(0, next.inputPricePer1M) + Math.max(0, next.outputPricePer1M)
    const defaultPrice = Math.max(0, defaultModel.inputPricePer1M) + Math.max(0, defaultModel.outputPricePer1M)
    if (nextPrice > defaultPrice) {
      setConfirmPending(nextSlug)
    } else {
      onChange(nextSlug)
    }
  }

  const selectedLabel = selected?.displayName ?? value ?? '—'
  const isDefault = value === DEFAULT_MODEL
  const showDropdown = open && search.trim().length > 0

  return (
    <>
      <div ref={rootRef} className="flex items-center gap-3 flex-wrap flex-1 min-w-0 relative">
        <div className="flex items-center gap-2 w-[18rem] flex-shrink-0">
          <span className="font-medium truncate text-sm flex-1 min-w-0" title={selected?.slug ?? value}>
            {selectedLabel}
          </span>
          {isDefault && selected ? (
            <span className="text-[10px] rounded-md bg-emerald-500/15 text-emerald-600 px-1.5 py-0.5 flex-shrink-0">default</span>
          ) : null}
        </div>

        <div ref={inputWrapperRef} className="relative flex-1 min-w-[14rem]">
          <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setOpen(true) }}
            onFocus={() => setOpen(true)}
            placeholder={`Filter ${models.length} models…`}
            className="w-full h-9 rounded-lg border border-border bg-background pl-8 pr-8 text-sm outline-none focus:ring-3 focus:ring-ring/50"
          />
          {search ? (
            <button
              type="button"
              onClick={() => { setSearch(''); setOpen(false) }}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="Clear filter"
            >
              <XIcon className="size-4" />
            </button>
          ) : null}
        </div>
      </div>

      {/* Portal-rendered dropdown — bypasses any ancestor overflow:hidden. */}
      {showDropdown && dropdownPos
        ? createPortal(
            <div
              ref={dropdownRef}
              className="fixed z-50 rounded-lg border border-border bg-popover text-popover-foreground shadow-lg overflow-hidden"
              style={{
                left: `${dropdownPos.left}px`,
                width: `${dropdownPos.width}px`,
                ...(dropdownPos.top !== undefined ? { top: `${dropdownPos.top}px` } : {}),
                ...(dropdownPos.bottom !== undefined ? { bottom: `${dropdownPos.bottom}px` } : {}),
              }}
            >
              <ul className="overflow-auto py-1" style={{ maxHeight: `${dropdownPos.maxHeight}px` }}>
                {filtered.length === 0 ? (
                  <li className="px-3 py-4 text-sm text-muted-foreground text-center">
                    No models match &ldquo;{search}&rdquo;
                  </li>
                ) : null}
                {filtered.map((m) => {
                  const isActive = m.slug === value
                  const isDefaultItem = m.slug === DEFAULT_MODEL
                  return (
                    <li key={m.slug}>
                      <button
                        type="button"
                        onClick={() => attemptChange(m.slug)}
                        className={`w-full text-left px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground transition-colors ${isActive ? 'bg-accent/60' : ''}`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-medium truncate flex-1 min-w-0">{m.displayName}</span>
                          {isDefaultItem ? <span className="text-[10px] rounded-md bg-emerald-500/15 text-emerald-600 px-1.5 py-0.5 flex-shrink-0">default</span> : null}
                          {isActive ? <span className="text-[10px] rounded-md bg-primary/15 text-primary px-1.5 py-0.5 flex-shrink-0">selected</span> : null}
                        </div>
                        <div className="text-xs text-muted-foreground truncate mt-0.5">
                          {m.slug} · in {fmtPrice(m.inputPricePer1M)}/1M · out {fmtPrice(m.outputPricePer1M)}/1M
                        </div>
                      </button>
                    </li>
                  )
                })}
              </ul>
              {filtered.length === 50 ? (
                <div className="px-3 py-1.5 text-[11px] text-muted-foreground border-t border-border bg-muted/20">
                  Showing first 50 · refine your search
                </div>
              ) : null}
            </div>,
            document.body,
          )
        : null}

      {confirmPending ? (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-background border border-border rounded-xl p-6 max-w-md shadow-xl">
            <h3 className="font-semibold text-base mb-2">Confirm more expensive model</h3>
            <p className="text-sm text-muted-foreground mb-4">
              You are switching from <b className="text-foreground">{DEFAULT_MODEL}</b> to <b className="text-foreground">{confirmPending}</b>, which costs more per token.
              Calls against this model will spend more real money.
            </p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setConfirmPending(null)} className="px-3 py-1.5 text-sm rounded-lg border border-border hover:bg-muted/50 transition-colors">Cancel</button>
              <button
                onClick={() => { onChange(confirmPending); setConfirmPending(null) }}
                className="px-3 py-1.5 text-sm rounded-lg bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
```

**Key changes vs the original:**
- Added `createPortal` import.
- The dropdown DOM moved from `<div className="absolute ...">` inside the input wrapper to `createPortal(<div className="fixed z-50 ...">, document.body)`.
- `dropdownPos` state replaces fixed positioning; recomputed on `open`, `search`, `resize`, and `scroll` (capture).
- Click-outside listener now checks both `rootRef` and `dropdownRef` (the portal lives outside the root tree).
- The empty `<div ref={inputWrapperRef}>` no longer contains the dropdown — only the input + clear button.

**Commit:**
```
fix(ModelPicker): portal dropdown to body to escape Card overflow-hidden
```

---

## Refinement 4: /agents — align register/configure buttons

**Why:** the two cards in `/agents` ("Registrar agente nuevo" with 1
input vs "Configurar agente existente" with 2 inputs) had different
content heights, leaving the "Registrar agente" button floating
mid-card while the "Guardar agente" button sat lower. Visually
misaligned.

**File:** `src/presentation/routes/Agents.tsx`

**Inside the `<div className="grid grid-cols-1 md:grid-cols-2 gap-4">` block, change both Cards:**

```tsx
// BEFORE — Card 1 (Registrar agente nuevo)
<Card className="p-6">
  <div className="text-center mb-4">
    <h2 className="text-lg font-semibold">{t('agents.registerTitle')}</h2>
    <p className="text-xs text-muted-foreground mt-1">{t('agents.registerSubtitle')}</p>
  </div>
  <div className="space-y-3">
    <div>
      <label className="text-xs text-muted-foreground block mb-1">{t('agents.nameLabel')}</label>
      <Input ... />
    </div>
    <Button className="w-full" ...>...</Button>
    {err ? <ErrorView error={err} /> : null}
  </div>
</Card>

// AFTER — Card 1
<Card className="p-6 flex flex-col">
  <div className="text-center mb-4">
    <h2 className="text-lg font-semibold">{t('agents.registerTitle')}</h2>
    <p className="text-xs text-muted-foreground mt-1">{t('agents.registerSubtitle')}</p>
  </div>
  <div className="space-y-3">
    <div>
      <label className="text-xs text-muted-foreground block mb-1">{t('agents.nameLabel')}</label>
      <Input ... />
    </div>
  </div>
  <div className="mt-auto pt-3 space-y-3">
    <Button className="w-full" ...>...</Button>
    {err ? <ErrorView error={err} /> : null}
  </div>
</Card>
```

Apply the **same shape** to Card 2 (Configurar agente existente): wrap
the inputs in their own `<div className="space-y-3">`, then put the
Button + ErrorView inside a `<div className="mt-auto pt-3 space-y-3">`.

**How it works:**
- `Card` is now `flex flex-col` → its children stack vertically with flex layout.
- The action block (`mt-auto pt-3`) pushes itself to the bottom of the card.
- The parent `grid` uses default `items-stretch` so both cards share the tallest height.
- Result: both buttons land on the same Y coordinate regardless of input count.

**Commit:**
```
fix(agents): align register/configure buttons across cards
```

---

## Refinement 5: i18n — `council.toolCountTooltip` key

**Why:** the tool-count chip on `CouncilHistory` items had a hardcoded
English tooltip `${n} tool calls`. The rest of the catalog uses `t()`.

**File:** `src/domain/i18n.ts` (both EN and ES blocks)

**Add this key** near the other `council.tools*` entries (e.g. right
after `council.toolsCounter`):

```ts
// EN block
'council.toolCountTooltip': '{count} tool calls',

// ES block
'council.toolCountTooltip': '{count} llamadas a herramientas',
```

**File:** `src/presentation/components/council/CouncilHistory.tsx`

**Replace the chip's `title` and the icon:**

```tsx
// BEFORE
{(() => {
  const n = countToolsInRun(run)
  return n > 0 ? (
    <span className="text-muted-foreground flex-shrink-0 font-mono" title={`${n} tool calls`}>
      🔎 {n}
    </span>
  ) : null
})()}

// AFTER
{(() => {
  const n = countToolsInRun(run)
  return n > 0 ? (
    <span
      className="text-muted-foreground flex-shrink-0 font-mono"
      title={t('council.toolCountTooltip', { count: String(n) })}
    >
      <span aria-hidden="true">🔎 </span>{n}
    </span>
  ) : null
})()}
```

**Commit:**
```
fix(council): i18n the tool-count tooltip in history items
```

---

## Refinement 6: Document REST and MCP default timeouts

**Why:** the constants `DEFAULT_TIMEOUT_MS = 60_000` (REST) and `90_000`
(MCP) lived without explanation. A reader couldn't tell why MCP was 50%
higher. Both files now carry a one-line comment with the rationale.

**File:** `src/infrastructure/rest/RestApiClient.ts`

Right above `const DEFAULT_TIMEOUT_MS = 60_000`:

```ts
// 60s covers REST envelopes (balance, models, transactions, register, claim).
// Streaming chat uses its own timeout passed by the caller.
const DEFAULT_TIMEOUT_MS = 60_000
```

**File:** `src/infrastructure/mcp/McpClient.ts`

Right above `const DEFAULT_TIMEOUT_MS = 90_000`:

```ts
// 90s (vs 60s for REST) gives headroom for browser-driven scraper tools
// (screenshot, pdf, session_exec) that load and render full pages upstream.
const DEFAULT_TIMEOUT_MS = 90_000
```

**Commit:**
```
chore(infra): document REST and MCP default timeouts
```

---

## Apply order summary

| Step | Refinement | File(s) | Commit prefix |
|---|---|---|---|
| 1 | Persistence race fix | `useCouncilStream.ts` | `fix(council):` |
| 2 | Active-run badge actions | `Council.tsx` | `feat(council):` |
| 3 | ModelPicker portal | `ModelPicker.tsx` | `fix(ModelPicker):` |
| 4 | /agents button alignment | `Agents.tsx` | `fix(agents):` |
| 5 | i18n tool-count tooltip | `i18n.ts` + `CouncilHistory.tsx` | `fix(council):` |
| 6 | Infra timeout comments | `RestApiClient.ts` + `McpClient.ts` | `chore(infra):` |

Each refinement keeps the test suite green (no test changes required).
After all six, run the full verification once more:

```bash
npm run typecheck
npm run lint
npm run test:ci
npm run build
```

If the target repo doesn't have one of the touched files (e.g. it's
council-only and `/agents` doesn't exist), skip that refinement and
continue.
