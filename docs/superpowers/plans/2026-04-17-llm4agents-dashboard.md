# llm4agents Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local Vite+React+TypeScript dashboard that exercises every endpoint of the llm4agents API (7 REST + 10 MCP scraper tools) with specialized UIs, multi-agent isolation, persistent history, and mainnet-safe guardrails.

**Architecture:** Ports & Adapters across four layers (domain, application, infrastructure, presentation). SPA served by Vite on port 4201 with `/proxy/api` and `/proxy/mcp` dev proxies to bypass CORS. Per-browser isolation via IndexedDB (Dexie). Test-Driven Development with Vitest.

**Tech Stack:** Vite 5, React 18, TypeScript (strict), Tailwind 3, shadcn/ui, TanStack Query v5, Zustand, Dexie, Zod, react-router v6, Vitest, fake-indexeddb, Monaco Editor.

**Reference spec:** `docs/superpowers/specs/2026-04-17-llm4agents-dashboard-design.md`

---

## Phase 0 — Project setup

### Task 0.1: Scaffold Vite+React+TS project

**Files:**
- Create: `package.json`, `vite.config.ts`, `index.html`, `tsconfig.json`, `tsconfig.node.json`, `src/main.tsx`, `src/app.tsx`, `.gitignore`

- [ ] **Step 1: Initialize Vite project**

Run:
```bash
cd /home/cleyson/Documentos/Work/Tests/llm4agents
npm create vite@latest . -- --template react-ts
```

When prompted about the existing `docs/` directory, choose "Ignore files and continue".

- [ ] **Step 2: Install dependencies**

Run:
```bash
npm install
```

- [ ] **Step 3: Verify dev server boots**

Run:
```bash
npm run dev -- --port 4201
```

Expected: Vite starts and prints `Local: http://localhost:4201/`. Press `q` to quit.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: scaffold Vite+React+TS project"
```

---

### Task 0.2: Apply strict tsconfig

**Files:**
- Modify: `tsconfig.json`

- [ ] **Step 1: Replace tsconfig.json**

Write `tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noFallthroughCasesInSwitch": true,
    "noImplicitReturns": true,
    "noPropertyAccessFromIndexSignature": true,
    "forceConsistentCasingInFileNames": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    }
  },
  "include": ["src", "tests"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

- [ ] **Step 2: Run typecheck to verify scaffolding still compiles**

Run: `npx tsc --noEmit`
Expected: Several errors about unused imports from the Vite scaffold — this is fine, we'll clean up in 0.3.

- [ ] **Step 3: Commit**

```bash
git add tsconfig.json
git commit -m "chore: enable strict TS compiler options"
```

---

### Task 0.3: Clean scaffold and set up directory structure

**Files:**
- Delete: `src/App.css`, `src/App.tsx`, `src/assets/react.svg`, `src/index.css` (replaced in later tasks), `public/vite.svg`
- Create: `src/app.tsx`, `src/main.tsx` (rewritten), and empty directories for layers

- [ ] **Step 1: Remove scaffold files**

Run:
```bash
rm -f src/App.css src/App.tsx src/assets/react.svg public/vite.svg
rmdir src/assets 2>/dev/null || true
```

- [ ] **Step 2: Create directory structure**

Run:
```bash
mkdir -p src/domain src/application src/infrastructure/{rest,mcp,stream,persistence,schemas} src/presentation/{layout,components,hooks,routes} src/composition tests/{domain,application,infrastructure,fixtures}
```

- [ ] **Step 3: Write placeholder app shell**

Write `src/app.tsx`:
```tsx
export function App() {
  return <div className="p-8">llm4agents dashboard — bootstrapping</div>
}
```

Write `src/main.tsx`:
```tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './app'
import './index.css'

const root = document.getElementById('root')
if (!root) throw new Error('Root element not found')

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
```

Write `src/index.css`:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

- [ ] **Step 4: Verify typecheck passes**

Run: `npx tsc --noEmit`
Expected: no errors (Tailwind directives ok for now — CSS is not type-checked).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: layered directory structure + app shell"
```

---

### Task 0.4: Configure Vite (port 4201, host, proxies)

**Files:**
- Modify: `vite.config.ts`
- Create: `.env.example`, `.env.local`

- [ ] **Step 1: Write vite.config.ts**

```ts
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  return {
    plugins: [react()],
    resolve: {
      alias: { '@': path.resolve(__dirname, './src') },
    },
    server: {
      port: 4201,
      strictPort: true,
      host: true,
      proxy: {
        '/proxy/api': {
          target: env.VITE_API_BASE ?? 'https://api.llm4agents.com',
          changeOrigin: true,
          secure: true,
          rewrite: (p) => p.replace(/^\/proxy\/api/, ''),
        },
        '/proxy/mcp': {
          target: env.VITE_MCP_BASE ?? 'https://mcp.llm4agents.com',
          changeOrigin: true,
          secure: true,
          rewrite: (p) => p.replace(/^\/proxy\/mcp/, '/mcp'),
        },
      },
    },
    preview: { port: 4201, strictPort: true, host: true },
  }
})
```

- [ ] **Step 2: Write .env.example**

```
VITE_API_BASE=https://api.llm4agents.com
VITE_MCP_BASE=https://mcp.llm4agents.com
```

- [ ] **Step 3: Copy to .env.local**

Run:
```bash
cp .env.example .env.local
```

- [ ] **Step 4: Add .env.local to .gitignore**

Append to `.gitignore`:
```
.env.local
.env.*.local
```

- [ ] **Step 5: Smoke-test dev server**

Run: `npm run dev` — open `http://localhost:4201` in a browser, expect "llm4agents dashboard — bootstrapping". Then `curl -sS http://localhost:4201/proxy/api/healthz` — expect a JSON health response from upstream. Press `q` to quit Vite.

- [ ] **Step 6: Commit**

```bash
git add vite.config.ts .env.example .gitignore
git commit -m "chore: configure Vite port 4201 + proxies for REST and MCP"
```

---

### Task 0.5: Install runtime dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install libraries**

Run:
```bash
npm install zod dexie @tanstack/react-query zustand react-router-dom @monaco-editor/react
npm install -D tailwindcss postcss autoprefixer vitest @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom fake-indexeddb @vitest/coverage-v8 eslint-plugin-react-hooks typescript-eslint eslint @typescript-eslint/eslint-plugin @typescript-eslint/parser msw @types/node
```

- [ ] **Step 2: Verify install**

Run: `npm ls zod dexie @tanstack/react-query 2>&1 | head -20`
Expected: versions listed, no `UNMET DEPENDENCY`.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: install runtime and dev dependencies"
```

---

### Task 0.6: Configure Tailwind

**Files:**
- Create: `tailwind.config.ts`, `postcss.config.js`
- Modify: `src/index.css` (already has directives — keep)

- [ ] **Step 1: Init Tailwind config**

Run:
```bash
npx tailwindcss init -p --ts
```

- [ ] **Step 2: Edit tailwind.config.ts**

```ts
import type { Config } from 'tailwindcss'

export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: { DEFAULT: 'hsl(var(--primary))', foreground: 'hsl(var(--primary-foreground))' },
        muted: { DEFAULT: 'hsl(var(--muted))', foreground: 'hsl(var(--muted-foreground))' },
        accent: { DEFAULT: 'hsl(var(--accent))', foreground: 'hsl(var(--accent-foreground))' },
        destructive: { DEFAULT: 'hsl(var(--destructive))', foreground: 'hsl(var(--destructive-foreground))' },
      },
    },
  },
  plugins: [],
} satisfies Config
```

- [ ] **Step 3: Extend src/index.css with CSS variables**

Replace `src/index.css`:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 240 10% 4%;
    --border: 240 6% 90%;
    --primary: 240 80% 50%;
    --primary-foreground: 0 0% 100%;
    --muted: 240 5% 96%;
    --muted-foreground: 240 4% 46%;
    --accent: 240 5% 96%;
    --accent-foreground: 240 10% 4%;
    --destructive: 0 84% 60%;
    --destructive-foreground: 0 0% 100%;
  }
  .dark {
    --background: 240 10% 4%;
    --foreground: 0 0% 98%;
    --border: 240 4% 16%;
    --primary: 240 70% 60%;
    --primary-foreground: 0 0% 100%;
    --muted: 240 4% 16%;
    --muted-foreground: 240 5% 65%;
    --accent: 240 4% 16%;
    --accent-foreground: 0 0% 98%;
    --destructive: 0 70% 50%;
    --destructive-foreground: 0 0% 98%;
  }
  html, body { @apply bg-background text-foreground; }
}
```

- [ ] **Step 4: Smoke-test**

Run `npm run dev`, open `http://localhost:4201`. Expect white background, readable text. Quit.

- [ ] **Step 5: Commit**

```bash
git add tailwind.config.ts postcss.config.js src/index.css
git commit -m "chore: configure Tailwind + shadcn design tokens"
```

---

### Task 0.7: Configure Vitest

**Files:**
- Create: `vitest.config.ts`, `tests/setup.ts`

- [ ] **Step 1: Write vitest.config.ts**

```ts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'node:path'

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  test: {
    environment: 'jsdom',
    globals: false,
    setupFiles: ['./tests/setup.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/domain/**', 'src/application/**', 'src/infrastructure/**'],
      thresholds: { lines: 80, functions: 80, statements: 80, branches: 75 },
    },
  },
})
```

- [ ] **Step 2: Write tests/setup.ts**

```ts
import '@testing-library/jest-dom/vitest'
import 'fake-indexeddb/auto'
```

- [ ] **Step 3: Smoke test**

Write `tests/setup.test.ts`:
```ts
import { expect, test } from 'vitest'
test('vitest alive', () => { expect(1 + 1).toBe(2) })
```

Run: `npx vitest run tests/setup.test.ts`
Expected: 1 test passes.

- [ ] **Step 4: Delete the smoke test**

```bash
rm tests/setup.test.ts
```

- [ ] **Step 5: Add test scripts to package.json**

Edit `package.json` `"scripts"` to include:
```json
"test": "vitest",
"test:ci": "vitest run",
"test:coverage": "vitest run --coverage",
"typecheck": "tsc --noEmit"
```

- [ ] **Step 6: Commit**

```bash
git add vitest.config.ts tests/setup.ts package.json
git commit -m "chore: configure Vitest with jsdom + fake-indexeddb"
```

---

**Phase 0 complete.** At this point `npm run dev` serves a blank shell on port 4201 with working API proxies, `npm run typecheck` passes, `npm test` runs.

---

## Phase 1 — Domain layer (pure types, zero deps)

### Task 1.1: Result type

**Files:**
- Create: `src/domain/result.ts`, `tests/domain/result.test.ts`

- [ ] **Step 1: Write failing test**

`tests/domain/result.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { Ok, Err, type Result, assertNever } from '@/domain/result'

describe('Result', () => {
  it('Ok carries a value', () => {
    const r: Result<number, string> = Ok(42)
    expect(r).toEqual({ ok: true, value: 42 })
  })

  it('Err carries an error', () => {
    const r: Result<number, string> = Err('boom')
    expect(r).toEqual({ ok: false, error: 'boom' })
  })

  it('assertNever throws on any value', () => {
    expect(() => assertNever('x' as never)).toThrowError(/Unexpected/)
  })
})
```

- [ ] **Step 2: Run and see it fail**

Run: `npx vitest run tests/domain/result.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

`src/domain/result.ts`:
```ts
export type Result<T, E> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E }

export const Ok = <T>(value: T): Result<T, never> => ({ ok: true, value })
export const Err = <E>(error: E): Result<never, E> => ({ ok: false, error })

export function assertNever(x: never): never {
  throw new Error(`Unexpected value: ${JSON.stringify(x)}`)
}
```

- [ ] **Step 4: Run and see it pass**

Run: `npx vitest run tests/domain/result.test.ts`
Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/domain/result.ts tests/domain/result.test.ts
git commit -m "feat(domain): add Result<T,E> + assertNever"
```

---

### Task 1.2: Branded types

**Files:**
- Create: `src/domain/branded.ts`, `tests/domain/branded.test.ts`

- [ ] **Step 1: Write failing test**

`tests/domain/branded.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import {
  ApiKey, AgentId, SessionId, UsdCents, RequestId,
  ChainId, WalletAddress, Model,
} from '@/domain/branded'

describe('branded types', () => {
  it('ApiKey accepts non-empty string', () => {
    expect(ApiKey('sk_abc')).toBe('sk_abc')
  })
  it('ApiKey rejects empty', () => {
    expect(() => ApiKey('')).toThrowError(/ApiKey/)
  })
  it('AgentId requires uuid-ish string', () => {
    expect(AgentId('11111111-1111-4111-8111-111111111111')).toBeDefined()
    expect(() => AgentId('not-a-uuid')).toThrowError(/AgentId/)
  })
  it('SessionId is non-empty', () => {
    expect(SessionId('sess_1')).toBe('sess_1')
    expect(() => SessionId('')).toThrowError()
  })
  it('UsdCents requires non-negative integer', () => {
    expect(UsdCents(0)).toBe(0)
    expect(UsdCents(100)).toBe(100)
    expect(() => UsdCents(-1)).toThrowError()
    expect(() => UsdCents(1.5)).toThrowError()
  })
  it('RequestId is non-empty', () => {
    expect(RequestId('req_1')).toBe('req_1')
  })
  it('ChainId accepts solana and polygon', () => {
    expect(ChainId('solana')).toBe('solana')
    expect(ChainId('polygon')).toBe('polygon')
    expect(() => ChainId('ethereum' as 'solana')).toThrowError()
  })
  it('WalletAddress requires non-empty string', () => {
    expect(WalletAddress('0xabc')).toBe('0xabc')
    expect(() => WalletAddress('')).toThrowError()
  })
  it('Model requires non-empty string', () => {
    expect(Model('gemini-2.5-flash-lite')).toBe('gemini-2.5-flash-lite')
    expect(() => Model('')).toThrowError()
  })
})
```

- [ ] **Step 2: Run and see it fail**

Run: `npx vitest run tests/domain/branded.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

`src/domain/branded.ts`:
```ts
type Brand<T, B extends string> = T & { readonly __brand: B }

export type ApiKey = Brand<string, 'ApiKey'>
export function ApiKey(raw: string): ApiKey {
  if (!raw || raw.length < 1) throw new Error('Invalid ApiKey: empty')
  return raw as ApiKey
}

export type AgentId = Brand<string, 'AgentId'>
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export function AgentId(raw: string): AgentId {
  if (!UUID_RE.test(raw)) throw new Error(`Invalid AgentId: ${raw}`)
  return raw as AgentId
}

export type SessionId = Brand<string, 'SessionId'>
export function SessionId(raw: string): SessionId {
  if (!raw) throw new Error('Invalid SessionId: empty')
  return raw as SessionId
}

export type UsdCents = Brand<number, 'UsdCents'>
export function UsdCents(raw: number): UsdCents {
  if (!Number.isInteger(raw) || raw < 0) throw new Error(`Invalid UsdCents: ${raw}`)
  return raw as UsdCents
}

export type RequestId = Brand<string, 'RequestId'>
export function RequestId(raw: string): RequestId {
  if (!raw) throw new Error('Invalid RequestId: empty')
  return raw as RequestId
}

export type ChainId = Brand<'solana' | 'polygon', 'ChainId'>
export function ChainId(raw: 'solana' | 'polygon'): ChainId {
  if (raw !== 'solana' && raw !== 'polygon') throw new Error(`Invalid ChainId: ${raw}`)
  return raw as ChainId
}

export type WalletAddress = Brand<string, 'WalletAddress'>
export function WalletAddress(raw: string): WalletAddress {
  if (!raw) throw new Error('Invalid WalletAddress: empty')
  return raw as WalletAddress
}

export type Model = Brand<string, 'Model'>
export function Model(raw: string): Model {
  if (!raw) throw new Error('Invalid Model: empty')
  return raw as Model
}
```

- [ ] **Step 4: Run and see it pass**

Run: `npx vitest run tests/domain/branded.test.ts`
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/domain/branded.ts tests/domain/branded.test.ts
git commit -m "feat(domain): add branded types with validating constructors"
```

---

### Task 1.3: Error unions

**Files:**
- Create: `src/domain/errors.ts`, `tests/domain/errors.test.ts`

- [ ] **Step 1: Write failing test**

`tests/domain/errors.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { type RestError, type McpError, describeError } from '@/domain/errors'

describe('errors', () => {
  it('describeError handles every RestError kind', () => {
    const cases: readonly RestError[] = [
      { kind: 'network' },
      { kind: 'timeout', endpoint: '/x' },
      { kind: 'unauthorized' },
      { kind: 'insufficient_balance' },
      { kind: 'rate_limited', retryAfterMs: 1000 },
      { kind: 'validation', issues: [] },
      { kind: 'upstream_error', status: 502, body: null },
    ]
    for (const c of cases) {
      expect(describeError(c)).toBeTypeOf('string')
      expect(describeError(c).length).toBeGreaterThan(0)
    }
  })

  it('describeError handles McpError kinds', () => {
    const a: McpError = { kind: 'jsonrpc_error', code: -32000, message: 'bad' }
    const b: McpError = { kind: 'invalid_params', details: 'url missing' }
    expect(describeError(a)).toMatch(/bad/)
    expect(describeError(b)).toMatch(/url missing/)
  })
})
```

- [ ] **Step 2: Run and see it fail**

Run: `npx vitest run tests/domain/errors.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

`src/domain/errors.ts`:
```ts
import { assertNever } from './result'

export type ZodLikeIssue = Readonly<{
  path: readonly (string | number)[]
  message: string
}>

export type RestError =
  | { readonly kind: 'network' }
  | { readonly kind: 'timeout'; readonly endpoint: string }
  | { readonly kind: 'unauthorized' }
  | { readonly kind: 'insufficient_balance' }
  | { readonly kind: 'rate_limited'; readonly retryAfterMs: number }
  | { readonly kind: 'validation'; readonly issues: readonly ZodLikeIssue[] }
  | { readonly kind: 'upstream_error'; readonly status: number; readonly body: unknown }

export type McpError =
  | { readonly kind: 'jsonrpc_error'; readonly code: number; readonly message: string }
  | { readonly kind: 'invalid_params'; readonly details: string }
  | RestError

export type AppError = RestError | McpError

export function describeError(e: AppError): string {
  switch (e.kind) {
    case 'network': return 'Network error — check your connection'
    case 'timeout': return `Request timed out at ${e.endpoint}`
    case 'unauthorized': return 'API key is invalid or expired'
    case 'insufficient_balance': return 'Insufficient balance to make this call'
    case 'rate_limited': return `Rate limited — retry in ${Math.ceil(e.retryAfterMs / 1000)}s`
    case 'validation': return `Validation failed: ${e.issues.length} issue(s)`
    case 'upstream_error': return `Upstream error ${e.status}`
    case 'jsonrpc_error': return `MCP error ${e.code}: ${e.message}`
    case 'invalid_params': return `Invalid params: ${e.details}`
    default: return assertNever(e)
  }
}
```

- [ ] **Step 4: Run and see it pass**

Run: `npx vitest run tests/domain/errors.test.ts`
Expected: 2 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/domain/errors.ts tests/domain/errors.test.ts
git commit -m "feat(domain): add RestError/McpError unions with describeError"
```

---

### Task 1.4: Domain entities (Agent, Chat, Scraper, Transaction)

**Files:**
- Create: `src/domain/agent.ts`, `src/domain/chat.ts`, `src/domain/scraper.ts`, `src/domain/transaction.ts`, `src/domain/history.ts`

- [ ] **Step 1: Write the agent module**

`src/domain/agent.ts`:
```ts
import type { AgentId, ApiKey } from './branded'

export type Agent = Readonly<{
  id: AgentId
  name: string
  apiKey: ApiKey
  createdAt: Date
  color: string
}>
```

- [ ] **Step 2: Write the chat module**

`src/domain/chat.ts`:
```ts
import type { Model, UsdCents } from './branded'

export type ChatRole = 'system' | 'user' | 'assistant'

export type ChatMessage = Readonly<{
  role: ChatRole
  content: string
}>

export type ChatParams = Readonly<{
  model: Model
  messages: readonly ChatMessage[]
  temperature?: number
  maxTokens?: number
  stream: boolean
}>

export type ChatUsage = Readonly<{
  tokensInput: number
  tokensOutput: number
  costCents: UsdCents
  balanceRemainingCents: UsdCents
  requestId: string
}>

export type ChatCompletionResult = Readonly<{
  content: string
  finishReason: string
  usage: ChatUsage
}>

export type ChatStreamEvent =
  | { readonly kind: 'delta'; readonly text: string }
  | { readonly kind: 'done'; readonly usage: ChatUsage; readonly fullText: string }
```

- [ ] **Step 3: Write the scraper module**

`src/domain/scraper.ts`:
```ts
import type { SessionId } from './branded'

export const PROXY_TIERS = ['none', 'datacenter', 'residential'] as const
export type ProxyTier = (typeof PROXY_TIERS)[number]

export const ONE_SHOT_TOOLS = [
  'fetch_html', 'markdown', 'links', 'screenshot', 'pdf', 'extract',
] as const
export type OneShotTool = (typeof ONE_SHOT_TOOLS)[number]

export const SESSION_TOOLS = [
  'session_create', 'session_exec', 'session_close', 'session_status',
] as const
export type SessionTool = (typeof SESSION_TOOLS)[number]

export type McpToolName = OneShotTool | SessionTool

export type McpSession = Readonly<{
  id: SessionId
  createdAt: Date
  proxyTier: ProxyTier
  initialUrl?: string
  lastActionAt?: Date
}>
```

- [ ] **Step 4: Write the transaction module**

`src/domain/transaction.ts`:
```ts
import type { UsdCents } from './branded'

export type TransactionType = 'deposit' | 'usage' | 'refund'

export type Transaction = Readonly<{
  id: string
  type: TransactionType
  amountCents: UsdCents
  timestamp: Date
  description?: string
}>
```

- [ ] **Step 5: Write the history module**

`src/domain/history.ts`:
```ts
import type { AgentId, RequestId, UsdCents } from './branded'
import type { Result } from './result'
import type { AppError } from './errors'

export type HistoryEntry = Readonly<{
  id: RequestId
  agentId: AgentId
  timestamp: Date
  kind: 'rest' | 'mcp'
  endpoint: string
  request: unknown
  response: Result<unknown, AppError>
  costCents?: UsdCents
  durationMs: number
}>
```

- [ ] **Step 6: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/domain/
git commit -m "feat(domain): add Agent, Chat, Scraper, Transaction, History types"
```

---

**Phase 1 complete.** Domain layer is a pure island — no external deps beyond TypeScript.

---

## Phase 2 — Zod schemas (boundaries)

### Task 2.1: REST response schemas

**Files:**
- Create: `src/infrastructure/schemas/rest.ts`, `tests/infrastructure/rest-schemas.test.ts`, `tests/fixtures/rest.ts`

- [ ] **Step 1: Write fixtures**

`tests/fixtures/rest.ts`:
```ts
export const fxHealthz = {
  status: 'ok', service: 'llm-proxy', timestamp: '2026-04-17T19:00:00Z',
}

export const fxRegisterAgent = {
  uuid: '11111111-1111-4111-8111-111111111111',
  apiKey: 'sk_test_abc',
  name: 'My Agent',
  createdAt: '2026-04-17T19:00:00Z',
}

export const fxBalance = {
  availableUsdCents: 500,
  totalDepositedUsd: 5,
  totalSpentUsd: 0,
}

export const fxWallet = {
  chain: 'solana',
  token: 'USDC',
  address: '7Np41oeYqPefeNQEHSv1UDhYrehxin3NStELsSKCT4K2',
  createdAt: '2026-04-17T19:00:00Z',
}

export const fxModels = {
  models: [
    {
      id: 'gemini-2.5-flash-lite',
      name: 'Gemini 2.5 Flash Lite',
      contextWindow: 1000000,
      pricing: { inputPer1mCents: 10, outputPer1mCents: 40 },
      enabled: true,
    },
  ],
}

export const fxChatCompletion = {
  id: 'chatcmpl_1',
  object: 'chat.completion',
  created: 1700000000,
  model: 'gemini-2.5-flash-lite',
  choices: [{
    index: 0,
    message: { role: 'assistant', content: 'Hello!' },
    finish_reason: 'stop',
  }],
  usage: { prompt_tokens: 3, completion_tokens: 5, total_tokens: 8 },
}

export const fxTransactions = {
  transactions: [{
    id: 'tx_1',
    type: 'deposit',
    amountCents: 500,
    timestamp: '2026-04-17T19:00:00Z',
    description: 'USDC deposit on Solana',
  }],
  total: 1,
  limit: 50,
  offset: 0,
}
```

- [ ] **Step 2: Write failing tests**

`tests/infrastructure/rest-schemas.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import {
  HealthzSchema, RegisterAgentResponseSchema, BalanceResponseSchema,
  GenerateWalletResponseSchema, ModelsResponseSchema,
  ChatCompletionResponseSchema, TransactionsResponseSchema,
} from '@/infrastructure/schemas/rest'
import * as fx from '../fixtures/rest'

describe('REST schemas', () => {
  it('parses healthz', () => {
    expect(HealthzSchema.parse(fx.fxHealthz)).toMatchObject({ status: 'ok' })
  })
  it('parses register agent', () => {
    expect(RegisterAgentResponseSchema.parse(fx.fxRegisterAgent).apiKey).toBe('sk_test_abc')
  })
  it('parses balance', () => {
    expect(BalanceResponseSchema.parse(fx.fxBalance).availableUsdCents).toBe(500)
  })
  it('parses wallet', () => {
    expect(GenerateWalletResponseSchema.parse(fx.fxWallet).chain).toBe('solana')
  })
  it('parses models', () => {
    expect(ModelsResponseSchema.parse(fx.fxModels).models[0]?.id).toBe('gemini-2.5-flash-lite')
  })
  it('parses chat completion', () => {
    expect(ChatCompletionResponseSchema.parse(fx.fxChatCompletion).choices[0]?.message.content).toBe('Hello!')
  })
  it('parses transactions', () => {
    expect(TransactionsResponseSchema.parse(fx.fxTransactions).transactions[0]?.type).toBe('deposit')
  })
  it('rejects invalid balance', () => {
    expect(() => BalanceResponseSchema.parse({ availableUsdCents: 'nope' })).toThrow()
  })
})
```

- [ ] **Step 3: Run and see it fail**

Run: `npx vitest run tests/infrastructure/rest-schemas.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 4: Implement schemas**

`src/infrastructure/schemas/rest.ts`:
```ts
import { z } from 'zod'

export const HealthzSchema = z.object({
  status: z.string(),
  service: z.string(),
  timestamp: z.string(),
})
export type HealthzResponse = z.infer<typeof HealthzSchema>

export const RegisterAgentRequestSchema = z.object({
  name: z.string().min(1).max(100),
})
export type RegisterAgentRequest = z.infer<typeof RegisterAgentRequestSchema>

export const RegisterAgentResponseSchema = z.object({
  uuid: z.string().uuid(),
  apiKey: z.string().min(1),
  name: z.string(),
  createdAt: z.string(),
})
export type RegisterAgentResponse = z.infer<typeof RegisterAgentResponseSchema>

export const BalanceResponseSchema = z.object({
  availableUsdCents: z.number().int().nonnegative(),
  totalDepositedUsd: z.number().nonnegative(),
  totalSpentUsd: z.number().nonnegative(),
})
export type BalanceResponse = z.infer<typeof BalanceResponseSchema>

export const GenerateWalletRequestSchema = z.object({
  chain: z.enum(['solana', 'polygon']),
  token: z.enum(['USDT', 'USDC']),
})
export type GenerateWalletRequest = z.infer<typeof GenerateWalletRequestSchema>

export const GenerateWalletResponseSchema = z.object({
  chain: z.enum(['solana', 'polygon']),
  token: z.enum(['USDT', 'USDC']),
  address: z.string().min(1),
  createdAt: z.string(),
})
export type GenerateWalletResponse = z.infer<typeof GenerateWalletResponseSchema>

export const ModelInfoSchema = z.object({
  id: z.string(),
  name: z.string(),
  contextWindow: z.number().int().positive(),
  pricing: z.object({
    inputPer1mCents: z.number().nonnegative(),
    outputPer1mCents: z.number().nonnegative(),
  }),
  enabled: z.boolean(),
})
export type ModelInfo = z.infer<typeof ModelInfoSchema>

export const ModelsResponseSchema = z.object({
  models: z.array(ModelInfoSchema),
})
export type ModelsResponse = z.infer<typeof ModelsResponseSchema>

export const ChatMessageSchema = z.object({
  role: z.enum(['system', 'user', 'assistant']),
  content: z.string(),
})

export const ChatCompletionRequestSchema = z.object({
  model: z.string().min(1),
  messages: z.array(ChatMessageSchema).min(1),
  temperature: z.number().min(0).max(2).optional(),
  max_tokens: z.number().int().positive().optional(),
  stream: z.boolean().optional(),
})
export type ChatCompletionRequest = z.infer<typeof ChatCompletionRequestSchema>

export const ChatCompletionResponseSchema = z.object({
  id: z.string(),
  object: z.string(),
  created: z.number(),
  model: z.string(),
  choices: z.array(z.object({
    index: z.number().int(),
    message: ChatMessageSchema,
    finish_reason: z.string().nullable().optional(),
  })).min(1),
  usage: z.object({
    prompt_tokens: z.number().int().nonnegative(),
    completion_tokens: z.number().int().nonnegative(),
    total_tokens: z.number().int().nonnegative(),
  }).optional(),
})
export type ChatCompletionResponse = z.infer<typeof ChatCompletionResponseSchema>

export const TransactionInfoSchema = z.object({
  id: z.string(),
  type: z.enum(['deposit', 'usage', 'refund']),
  amountCents: z.number().int(),
  timestamp: z.string(),
  description: z.string().optional(),
})
export type TransactionInfo = z.infer<typeof TransactionInfoSchema>

export const TransactionsResponseSchema = z.object({
  transactions: z.array(TransactionInfoSchema),
  total: z.number().int().nonnegative(),
  limit: z.number().int().positive(),
  offset: z.number().int().nonnegative(),
})
export type TransactionsResponse = z.infer<typeof TransactionsResponseSchema>

export const ErrorResponseSchema = z.object({
  error: z.object({
    code: z.string().optional(),
    message: z.string(),
  }).or(z.string()),
}).passthrough()
```

- [ ] **Step 5: Run and see it pass**

Run: `npx vitest run tests/infrastructure/rest-schemas.test.ts`
Expected: 8 tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/infrastructure/schemas/rest.ts tests/infrastructure/rest-schemas.test.ts tests/fixtures/rest.ts
git commit -m "feat(schemas): add Zod schemas for all REST responses"
```

---

### Task 2.2: MCP tool schemas

**Files:**
- Create: `src/infrastructure/schemas/mcp.ts`, `tests/infrastructure/mcp-schemas.test.ts`

- [ ] **Step 1: Write failing tests**

`tests/infrastructure/mcp-schemas.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import {
  FetchHtmlParamsSchema, MarkdownParamsSchema, LinksParamsSchema,
  ScreenshotParamsSchema, PdfParamsSchema, ExtractParamsSchema,
  SessionCreateParamsSchema, SessionExecParamsSchema,
  SessionCloseParamsSchema, SessionStatusParamsSchema,
  McpToolResultSchema,
} from '@/infrastructure/schemas/mcp'

describe('MCP schemas', () => {
  it('fetch_html requires url + proxy_tier', () => {
    expect(FetchHtmlParamsSchema.parse({ url: 'https://a.com', proxy_tier: 'none' })).toBeDefined()
    expect(() => FetchHtmlParamsSchema.parse({ url: 'https://a.com' })).toThrow()
  })
  it('markdown optional selector', () => {
    expect(MarkdownParamsSchema.parse({ url: 'https://a.com', proxy_tier: 'datacenter' }).selector).toBeUndefined()
    expect(MarkdownParamsSchema.parse({ url: 'https://a.com', proxy_tier: 'datacenter', selector: '#main' }).selector).toBe('#main')
  })
  it('links same_origin_only is optional bool', () => {
    expect(LinksParamsSchema.parse({ url: 'https://a.com', proxy_tier: 'residential', same_origin_only: true })).toBeDefined()
  })
  it('screenshot viewport bounds enforced', () => {
    expect(() => ScreenshotParamsSchema.parse({
      url: 'https://a.com', proxy_tier: 'none', viewport: { width: 100, height: 100 },
    })).toThrow()
  })
  it('pdf format enum', () => {
    expect(PdfParamsSchema.parse({ url: 'https://a.com', proxy_tier: 'none', format: 'A4' }).format).toBe('A4')
  })
  it('extract requires selectors map', () => {
    expect(ExtractParamsSchema.parse({
      url: 'https://a.com', proxy_tier: 'none', selectors: { title: 'h1' },
    }).selectors.title).toBe('h1')
  })
  it('session_create requires proxy_tier', () => {
    expect(SessionCreateParamsSchema.parse({ proxy_tier: 'datacenter' })).toBeDefined()
  })
  it('session_exec requires session_id + action', () => {
    expect(SessionExecParamsSchema.parse({
      session_id: 'sess_1', action: { type: 'goto', url: 'https://a.com' },
    })).toBeDefined()
  })
  it('session_close / session_status require session_id', () => {
    expect(SessionCloseParamsSchema.parse({ session_id: 'sess_1' })).toBeDefined()
    expect(SessionStatusParamsSchema.parse({ session_id: 'sess_1' })).toBeDefined()
  })
  it('generic tool result accepts content array', () => {
    expect(McpToolResultSchema.parse({ content: [{ type: 'text', text: '<html/>' }] })).toBeDefined()
  })
})
```

- [ ] **Step 2: Run and see it fail**

Run: `npx vitest run tests/infrastructure/mcp-schemas.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

`src/infrastructure/schemas/mcp.ts`:
```ts
import { z } from 'zod'

const ProxyTierEnum = z.enum(['none', 'datacenter', 'residential'])

const UrlField = z.string().url().max(2048)

export const FetchHtmlParamsSchema = z.object({
  url: UrlField,
  timeout_ms: z.number().int().min(1000).max(30000).optional(),
  proxy_tier: ProxyTierEnum,
})

export const MarkdownParamsSchema = z.object({
  url: UrlField,
  selector: z.string().optional(),
  proxy_tier: ProxyTierEnum,
})

export const LinksParamsSchema = z.object({
  url: UrlField,
  same_origin_only: z.boolean().optional(),
  proxy_tier: ProxyTierEnum,
})

const ViewportSchema = z.object({
  width: z.number().int().min(320).max(3840),
  height: z.number().int().min(240).max(2160),
})

export const ScreenshotParamsSchema = z.object({
  url: UrlField,
  selector: z.string().optional(),
  full_page: z.boolean().optional(),
  viewport: ViewportSchema.optional(),
  proxy_tier: ProxyTierEnum,
})

export const PdfParamsSchema = z.object({
  url: UrlField,
  format: z.enum(['A4', 'Letter', 'Legal']).optional(),
  proxy_tier: ProxyTierEnum,
})

export const ExtractParamsSchema = z.object({
  url: UrlField,
  selectors: z.record(z.string(), z.string()),
  proxy_tier: ProxyTierEnum,
})

export const SessionCreateParamsSchema = z.object({
  proxy_tier: ProxyTierEnum,
  initial_url: UrlField.optional(),
})

export const SessionExecParamsSchema = z.object({
  session_id: z.string().min(1),
  action: z.object({ type: z.string() }).passthrough(),
})

export const SessionCloseParamsSchema = z.object({
  session_id: z.string().min(1),
})

export const SessionStatusParamsSchema = z.object({
  session_id: z.string().min(1),
})

export const McpContentItemSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('text'), text: z.string() }),
  z.object({ type: z.literal('image'), data: z.string(), mimeType: z.string() }),
  z.object({ type: z.literal('resource'), resource: z.object({ uri: z.string(), mimeType: z.string().optional(), text: z.string().optional(), blob: z.string().optional() }) }),
])

export const McpToolResultSchema = z.object({
  content: z.array(McpContentItemSchema),
  isError: z.boolean().optional(),
})
export type McpToolResult = z.infer<typeof McpToolResultSchema>

export const TOOL_PARAM_SCHEMAS = {
  fetch_html: FetchHtmlParamsSchema,
  markdown: MarkdownParamsSchema,
  links: LinksParamsSchema,
  screenshot: ScreenshotParamsSchema,
  pdf: PdfParamsSchema,
  extract: ExtractParamsSchema,
  session_create: SessionCreateParamsSchema,
  session_exec: SessionExecParamsSchema,
  session_close: SessionCloseParamsSchema,
  session_status: SessionStatusParamsSchema,
} as const
```

- [ ] **Step 4: Run and see it pass**

Run: `npx vitest run tests/infrastructure/mcp-schemas.test.ts`
Expected: 10 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/infrastructure/schemas/mcp.ts tests/infrastructure/mcp-schemas.test.ts
git commit -m "feat(schemas): add Zod schemas for all MCP tool params and results"
```

---

## Phase 3 — Infrastructure layer

### Task 3.1: SSE parser

**Files:**
- Create: `src/infrastructure/stream/sseParser.ts`, `tests/infrastructure/sse-parser.test.ts`

- [ ] **Step 1: Write failing test**

`tests/infrastructure/sse-parser.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { parseSseStream } from '@/infrastructure/stream/sseParser'

function streamFromChunks(chunks: readonly string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder()
  let i = 0
  return new ReadableStream({
    pull(controller) {
      if (i >= chunks.length) { controller.close(); return }
      const chunk = chunks[i]
      i += 1
      if (chunk !== undefined) controller.enqueue(enc.encode(chunk))
    },
  })
}

describe('parseSseStream', () => {
  it('emits one event per data line', async () => {
    const stream = streamFromChunks([
      'data: {"a":1}\n\n',
      'data: {"a":2}\n\n',
    ])
    const events: string[] = []
    for await (const ev of parseSseStream(stream)) {
      events.push(ev.data)
    }
    expect(events).toEqual(['{"a":1}', '{"a":2}'])
  })

  it('handles chunk splits mid-event', async () => {
    const stream = streamFromChunks([
      'data: {"a"',
      ':1}\n\n',
    ])
    const events: string[] = []
    for await (const ev of parseSseStream(stream)) {
      events.push(ev.data)
    }
    expect(events).toEqual(['{"a":1}'])
  })

  it('stops at [DONE] sentinel', async () => {
    const stream = streamFromChunks([
      'data: {"a":1}\n\n',
      'data: [DONE]\n\n',
    ])
    const events: string[] = []
    for await (const ev of parseSseStream(stream)) {
      if (ev.data === '[DONE]') break
      events.push(ev.data)
    }
    expect(events).toEqual(['{"a":1}'])
  })
})
```

- [ ] **Step 2: Run and see it fail**

Run: `npx vitest run tests/infrastructure/sse-parser.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

`src/infrastructure/stream/sseParser.ts`:
```ts
export type SseEvent = Readonly<{
  event?: string
  data: string
  id?: string
}>

export async function* parseSseStream(
  stream: ReadableStream<Uint8Array>,
): AsyncGenerator<SseEvent, void, void> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) {
        if (buffer.trim().length > 0) {
          const ev = parseEvent(buffer)
          if (ev) yield ev
        }
        return
      }
      buffer += decoder.decode(value, { stream: true })
      let sepIndex: number
      while ((sepIndex = buffer.indexOf('\n\n')) !== -1) {
        const raw = buffer.slice(0, sepIndex)
        buffer = buffer.slice(sepIndex + 2)
        const ev = parseEvent(raw)
        if (ev) yield ev
      }
    }
  } finally {
    reader.releaseLock()
  }
}

function parseEvent(raw: string): SseEvent | null {
  const lines = raw.split('\n')
  let event: string | undefined
  let id: string | undefined
  const dataLines: string[] = []
  for (const line of lines) {
    if (line.startsWith(':')) continue
    const colon = line.indexOf(':')
    const field = colon === -1 ? line : line.slice(0, colon)
    const value = colon === -1 ? '' : line.slice(colon + 1).replace(/^ /, '')
    if (field === 'data') dataLines.push(value)
    else if (field === 'event') event = value
    else if (field === 'id') id = value
  }
  if (dataLines.length === 0) return null
  const data = dataLines.join('\n')
  const ev: { event?: string; data: string; id?: string } = { data }
  if (event !== undefined) ev.event = event
  if (id !== undefined) ev.id = id
  return ev
}
```

- [ ] **Step 4: Run and see it pass**

Run: `npx vitest run tests/infrastructure/sse-parser.test.ts`
Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/infrastructure/stream/sseParser.ts tests/infrastructure/sse-parser.test.ts
git commit -m "feat(infra): SSE parser generator"
```

---

### Task 3.2: Error classifier

**Files:**
- Create: `src/infrastructure/rest/classifyError.ts`, `tests/infrastructure/classify-error.test.ts`

- [ ] **Step 1: Write failing test**

`tests/infrastructure/classify-error.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { classifyHttpError } from '@/infrastructure/rest/classifyError'

describe('classifyHttpError', () => {
  it('401 → unauthorized', () => {
    expect(classifyHttpError(401, null, {})).toEqual({ kind: 'unauthorized' })
  })
  it('402 → insufficient_balance', () => {
    expect(classifyHttpError(402, null, {})).toEqual({ kind: 'insufficient_balance' })
  })
  it('429 with Retry-After seconds → rate_limited', () => {
    expect(classifyHttpError(429, null, { 'retry-after': '10' })).toEqual({
      kind: 'rate_limited', retryAfterMs: 10000,
    })
  })
  it('429 no header → default 1000ms', () => {
    expect(classifyHttpError(429, null, {})).toEqual({
      kind: 'rate_limited', retryAfterMs: 1000,
    })
  })
  it('5xx → upstream_error', () => {
    expect(classifyHttpError(502, { error: 'bad gateway' }, {})).toEqual({
      kind: 'upstream_error', status: 502, body: { error: 'bad gateway' },
    })
  })
  it('422 → validation with issues fallback', () => {
    const e = classifyHttpError(422, { message: 'bad' }, {})
    expect(e.kind).toBe('validation')
  })
})
```

- [ ] **Step 2: Run and see it fail**

Run: `npx vitest run tests/infrastructure/classify-error.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

`src/infrastructure/rest/classifyError.ts`:
```ts
import type { RestError, ZodLikeIssue } from '@/domain/errors'

export function classifyHttpError(
  status: number,
  body: unknown,
  headers: Readonly<Record<string, string>>,
): RestError {
  if (status === 401) return { kind: 'unauthorized' }
  if (status === 402) return { kind: 'insufficient_balance' }
  if (status === 429) {
    const retryAfter = headers['retry-after']
    const seconds = retryAfter ? Number(retryAfter) : NaN
    const retryAfterMs = Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 1000
    return { kind: 'rate_limited', retryAfterMs }
  }
  if (status === 422) {
    const issues: readonly ZodLikeIssue[] = extractIssues(body)
    return { kind: 'validation', issues }
  }
  if (status >= 500) return { kind: 'upstream_error', status, body }
  return { kind: 'upstream_error', status, body }
}

function extractIssues(body: unknown): readonly ZodLikeIssue[] {
  if (body && typeof body === 'object' && 'issues' in body) {
    const raw = (body as { issues: unknown }).issues
    if (Array.isArray(raw)) {
      return raw
        .filter((i): i is { path: (string | number)[]; message: string } =>
          i !== null && typeof i === 'object' && 'message' in i && 'path' in i)
        .map(i => ({ path: i.path, message: i.message }))
    }
  }
  return []
}
```

- [ ] **Step 4: Run and see it pass**

Run: `npx vitest run tests/infrastructure/classify-error.test.ts`
Expected: 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/infrastructure/rest/classifyError.ts tests/infrastructure/classify-error.test.ts
git commit -m "feat(infra): HTTP status → RestError classifier"
```

---

### Task 3.3: REST API client (ports + adapter)

**Files:**
- Create: `src/application/ports.ts`, `src/infrastructure/rest/RestApiClient.ts`, `tests/infrastructure/rest-client.test.ts`

- [ ] **Step 1: Define the port interface**

`src/application/ports.ts`:
```ts
import type { Result } from '@/domain/result'
import type { RestError, McpError } from '@/domain/errors'
import type { ApiKey, SessionId } from '@/domain/branded'
import type {
  HealthzResponse, RegisterAgentRequest, RegisterAgentResponse,
  BalanceResponse, GenerateWalletRequest, GenerateWalletResponse,
  ModelsResponse, ChatCompletionRequest, ChatCompletionResponse,
  TransactionsResponse,
} from '@/infrastructure/schemas/rest'
import type { McpToolResult } from '@/infrastructure/schemas/mcp'
import type { McpToolName } from '@/domain/scraper'
import type { Agent } from '@/domain/agent'
import type { HistoryEntry } from '@/domain/history'
import type { McpSession } from '@/domain/scraper'
import type { AgentId } from '@/domain/branded'

export type ChatResponseMeta = Readonly<{
  costCents?: number
  tokensInput?: number
  tokensOutput?: number
  balanceRemainingCents?: number
  requestId?: string
}>

export type ChatResponseWithMeta = Readonly<{
  data: ChatCompletionResponse
  meta: ChatResponseMeta
}>

export type ChatStreamChunk =
  | { readonly kind: 'delta'; readonly text: string }
  | { readonly kind: 'done'; readonly meta: ChatResponseMeta; readonly fullText: string }

export interface RestApiPort {
  healthz(): Promise<Result<HealthzResponse, RestError>>
  registerAgent(req: RegisterAgentRequest): Promise<Result<RegisterAgentResponse, RestError>>
  getBalance(key: ApiKey): Promise<Result<BalanceResponse, RestError>>
  listModels(key: ApiKey, search?: string): Promise<Result<ModelsResponse, RestError>>
  generateWallet(key: ApiKey, req: GenerateWalletRequest): Promise<Result<GenerateWalletResponse, RestError>>
  chatCompletion(key: ApiKey, req: ChatCompletionRequest): Promise<Result<ChatResponseWithMeta, RestError>>
  chatCompletionStream(
    key: ApiKey, req: ChatCompletionRequest, signal: AbortSignal,
  ): AsyncGenerator<ChatStreamChunk, void, void>
  listTransactions(key: ApiKey, params: Readonly<{
    type?: 'deposit' | 'usage' | 'refund'; limit?: number; offset?: number
  }>): Promise<Result<TransactionsResponse, RestError>>
}

export interface McpPort {
  callTool(
    key: ApiKey, tool: McpToolName, params: unknown, signal?: AbortSignal,
  ): Promise<Result<McpToolResult, McpError>>
}

export interface AgentRepo {
  list(): Promise<readonly Agent[]>
  add(agent: Agent): Promise<void>
  rename(id: AgentId, name: string): Promise<void>
  remove(id: AgentId): Promise<void>
  get(id: AgentId): Promise<Agent | undefined>
}

export interface HistoryRepo {
  add(entry: HistoryEntry): Promise<void>
  listByAgent(id: AgentId, limit: number): Promise<readonly HistoryEntry[]>
  clear(id: AgentId): Promise<void>
}

export interface SessionRepo {
  add(agentId: AgentId, session: McpSession): Promise<void>
  listByAgent(id: AgentId): Promise<readonly McpSession[]>
  remove(agentId: AgentId, sessionId: SessionId): Promise<void>
}
```

- [ ] **Step 2: Write tests for RestApiClient using MSW**

`tests/infrastructure/rest-client.test.ts`:
```ts
import { describe, expect, it, beforeAll, afterAll, afterEach } from 'vitest'
import { setupServer } from 'msw/node'
import { http, HttpResponse } from 'msw'
import { RestApiClient } from '@/infrastructure/rest/RestApiClient'
import { ApiKey } from '@/domain/branded'
import * as fx from '../fixtures/rest'

const server = setupServer()
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

const BASE = 'http://localhost/proxy/api'

describe('RestApiClient', () => {
  it('healthz returns Ok', async () => {
    server.use(http.get(`${BASE}/healthz`, () => HttpResponse.json(fx.fxHealthz)))
    const c = new RestApiClient('http://localhost/proxy/api', '/proxy/mcp')
    const r = await c.healthz()
    expect(r.ok).toBe(true)
  })

  it('getBalance returns Ok', async () => {
    server.use(http.get(`${BASE}/api/v1/balance`, () => HttpResponse.json(fx.fxBalance)))
    const c = new RestApiClient('http://localhost/proxy/api', '/proxy/mcp')
    const r = await c.getBalance(ApiKey('sk_test'))
    expect(r.ok).toBe(true)
  })

  it('401 maps to unauthorized', async () => {
    server.use(http.get(`${BASE}/api/v1/balance`, () => new HttpResponse(null, { status: 401 })))
    const c = new RestApiClient('http://localhost/proxy/api', '/proxy/mcp')
    const r = await c.getBalance(ApiKey('sk_test'))
    expect(r).toEqual({ ok: false, error: { kind: 'unauthorized' } })
  })

  it('chatCompletion extracts cost headers', async () => {
    server.use(http.post(`${BASE}/v1/chat/completions`, () =>
      HttpResponse.json(fx.fxChatCompletion, {
        headers: {
          'X-Cost-Usd-Cents': '2',
          'X-Tokens-Input': '3',
          'X-Tokens-Output': '5',
          'X-Balance-Remaining-Cents': '498',
          'X-Request-Id': 'req_1',
        },
      })))
    const c = new RestApiClient('http://localhost/proxy/api', '/proxy/mcp')
    const r = await c.chatCompletion(ApiKey('sk_test'), {
      model: 'gemini-2.5-flash-lite',
      messages: [{ role: 'user', content: 'hi' }],
    })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.value.meta.costCents).toBe(2)
      expect(r.value.meta.balanceRemainingCents).toBe(498)
    }
  })
})
```

- [ ] **Step 3: Run and see it fail**

Run: `npx vitest run tests/infrastructure/rest-client.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 4: Implement**

`src/infrastructure/rest/RestApiClient.ts`:
```ts
import { z } from 'zod'
import { Err, Ok, type Result } from '@/domain/result'
import type { RestError } from '@/domain/errors'
import type { ApiKey } from '@/domain/branded'
import {
  HealthzSchema, RegisterAgentResponseSchema, BalanceResponseSchema,
  GenerateWalletResponseSchema, ModelsResponseSchema,
  ChatCompletionResponseSchema, TransactionsResponseSchema,
  type RegisterAgentRequest, type GenerateWalletRequest,
  type ChatCompletionRequest,
} from '@/infrastructure/schemas/rest'
import { classifyHttpError } from './classifyError'
import { parseSseStream } from '@/infrastructure/stream/sseParser'
import type {
  RestApiPort, ChatResponseWithMeta, ChatResponseMeta, ChatStreamChunk,
} from '@/application/ports'

const DEFAULT_TIMEOUT_MS = 60_000

export class RestApiClient implements RestApiPort {
  constructor(private readonly apiBase: string, _mcpBase: string) {}

  async healthz() {
    return this.getJson('/healthz', HealthzSchema)
  }

  async registerAgent(req: RegisterAgentRequest) {
    return this.postJson('/api/v1/agents/register', req, RegisterAgentResponseSchema)
  }

  async getBalance(key: ApiKey) {
    return this.getJson('/api/v1/balance', BalanceResponseSchema, key)
  }

  async listModels(key: ApiKey, search?: string) {
    const qs = search ? `?search=${encodeURIComponent(search)}` : ''
    return this.getJson(`/api/v1/models${qs}`, ModelsResponseSchema, key)
  }

  async generateWallet(key: ApiKey, req: GenerateWalletRequest) {
    return this.postJson('/api/v1/wallets/generate', req, GenerateWalletResponseSchema, key)
  }

  async chatCompletion(
    key: ApiKey, req: ChatCompletionRequest,
  ): Promise<Result<ChatResponseWithMeta, RestError>> {
    const url = `${this.apiBase}/v1/chat/completions`
    const res = await this.fetchSafe(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      body: JSON.stringify({ ...req, stream: false }),
    })
    if (!res.ok) return res
    const { response } = res.value
    const parsed = ChatCompletionResponseSchema.safeParse(await response.json())
    if (!parsed.success) {
      return Err({ kind: 'validation', issues: parsed.error.issues.map(i => ({ path: i.path, message: i.message })) })
    }
    return Ok({ data: parsed.data, meta: extractMeta(response.headers) })
  }

  async *chatCompletionStream(
    key: ApiKey, req: ChatCompletionRequest, signal: AbortSignal,
  ): AsyncGenerator<ChatStreamChunk, void, void> {
    const url = `${this.apiBase}/v1/chat/completions`
    const res = await fetch(url, {
      method: 'POST',
      signal,
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${key}`,
        accept: 'text/event-stream',
      },
      body: JSON.stringify({ ...req, stream: true }),
    })
    if (!res.ok || !res.body) {
      return
    }
    let full = ''
    for await (const ev of parseSseStream(res.body)) {
      if (ev.data === '[DONE]') {
        yield { kind: 'done', fullText: full, meta: extractMeta(res.headers) }
        return
      }
      try {
        const chunk = JSON.parse(ev.data) as { choices?: { delta?: { content?: string } }[] }
        const delta = chunk.choices?.[0]?.delta?.content ?? ''
        if (delta) {
          full += delta
          yield { kind: 'delta', text: delta }
        }
      } catch { /* ignore malformed chunks */ }
    }
    yield { kind: 'done', fullText: full, meta: extractMeta(res.headers) }
  }

  async listTransactions(
    key: ApiKey, params: Readonly<{ type?: 'deposit' | 'usage' | 'refund'; limit?: number; offset?: number }>,
  ) {
    const qs = new URLSearchParams()
    if (params.type) qs.set('type', params.type)
    if (params.limit !== undefined) qs.set('limit', String(params.limit))
    if (params.offset !== undefined) qs.set('offset', String(params.offset))
    const suffix = qs.toString() ? `?${qs.toString()}` : ''
    return this.getJson(`/api/v1/transactions${suffix}`, TransactionsResponseSchema, key)
  }

  private async getJson<T>(
    path: string, schema: z.ZodType<T>, key?: ApiKey,
  ): Promise<Result<T, RestError>> {
    const res = await this.fetchSafe(`${this.apiBase}${path}`, {
      method: 'GET',
      headers: key ? { authorization: `Bearer ${key}` } : {},
    })
    if (!res.ok) return res
    const body = await res.value.response.json()
    const parsed = schema.safeParse(body)
    if (!parsed.success) {
      return Err({ kind: 'validation', issues: parsed.error.issues.map(i => ({ path: i.path, message: i.message })) })
    }
    return Ok(parsed.data)
  }

  private async postJson<T, B>(
    path: string, body: B, schema: z.ZodType<T>, key?: ApiKey,
  ): Promise<Result<T, RestError>> {
    const res = await this.fetchSafe(`${this.apiBase}${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(key ? { authorization: `Bearer ${key}` } : {}),
      },
      body: JSON.stringify(body),
    })
    if (!res.ok) return res
    const parsed = schema.safeParse(await res.value.response.json())
    if (!parsed.success) {
      return Err({ kind: 'validation', issues: parsed.error.issues.map(i => ({ path: i.path, message: i.message })) })
    }
    return Ok(parsed.data)
  }

  private async fetchSafe(
    url: string, init: RequestInit,
  ): Promise<Result<{ response: Response }, RestError>> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS)
    try {
      const response = await fetch(url, { ...init, signal: controller.signal })
      if (!response.ok) {
        const headersObj: Record<string, string> = {}
        response.headers.forEach((v, k) => { headersObj[k.toLowerCase()] = v })
        const bodyText = await response.text()
        let parsed: unknown = null
        try { parsed = JSON.parse(bodyText) } catch { parsed = bodyText }
        return Err(classifyHttpError(response.status, parsed, headersObj))
      }
      return Ok({ response })
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') {
        return Err({ kind: 'timeout', endpoint: url })
      }
      return Err({ kind: 'network' })
    } finally {
      clearTimeout(timer)
    }
  }
}

function extractMeta(headers: Headers): ChatResponseMeta {
  const costStr = headers.get('x-cost-usd-cents')
  const inStr = headers.get('x-tokens-input')
  const outStr = headers.get('x-tokens-output')
  const balStr = headers.get('x-balance-remaining-cents')
  const reqId = headers.get('x-request-id') ?? undefined
  const meta: { costCents?: number; tokensInput?: number; tokensOutput?: number; balanceRemainingCents?: number; requestId?: string } = {}
  if (costStr !== null) meta.costCents = Number(costStr)
  if (inStr !== null) meta.tokensInput = Number(inStr)
  if (outStr !== null) meta.tokensOutput = Number(outStr)
  if (balStr !== null) meta.balanceRemainingCents = Number(balStr)
  if (reqId !== undefined) meta.requestId = reqId
  return meta
}
```

- [ ] **Step 5: Run and see it pass**

Run: `npx vitest run tests/infrastructure/rest-client.test.ts`
Expected: 4 tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/application/ports.ts src/infrastructure/rest/RestApiClient.ts tests/infrastructure/rest-client.test.ts
git commit -m "feat(infra): REST client with typed port interface"
```

---

### Task 3.4: MCP client

**Files:**
- Create: `src/infrastructure/mcp/McpClient.ts`, `tests/infrastructure/mcp-client.test.ts`

- [ ] **Step 1: Write failing test**

`tests/infrastructure/mcp-client.test.ts`:
```ts
import { describe, expect, it, beforeAll, afterAll, afterEach } from 'vitest'
import { setupServer } from 'msw/node'
import { http, HttpResponse } from 'msw'
import { McpClient } from '@/infrastructure/mcp/McpClient'
import { ApiKey } from '@/domain/branded'

const server = setupServer()
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

const MCP_URL = 'http://localhost/proxy/mcp'

describe('McpClient', () => {
  it('callTool returns Ok with content', async () => {
    server.use(http.post(MCP_URL, async () =>
      HttpResponse.json({
        jsonrpc: '2.0', id: 1,
        result: { content: [{ type: 'text', text: '<html/>' }] },
      })))
    const c = new McpClient(MCP_URL)
    const r = await c.callTool(ApiKey('sk_test'), 'fetch_html', {
      url: 'https://a.com', proxy_tier: 'none',
    })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value.content[0]?.type).toBe('text')
  })

  it('jsonrpc error maps to jsonrpc_error', async () => {
    server.use(http.post(MCP_URL, async () =>
      HttpResponse.json({
        jsonrpc: '2.0', id: 1,
        error: { code: -32000, message: 'tool not found' },
      })))
    const c = new McpClient(MCP_URL)
    const r = await c.callTool(ApiKey('sk_test'), 'fetch_html', {
      url: 'https://a.com', proxy_tier: 'none',
    })
    expect(r).toEqual({ ok: false, error: { kind: 'jsonrpc_error', code: -32000, message: 'tool not found' } })
  })
})
```

- [ ] **Step 2: Run and see it fail**

Run: `npx vitest run tests/infrastructure/mcp-client.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

`src/infrastructure/mcp/McpClient.ts`:
```ts
import { Err, Ok, type Result } from '@/domain/result'
import type { McpError } from '@/domain/errors'
import type { ApiKey } from '@/domain/branded'
import type { McpToolName } from '@/domain/scraper'
import { McpToolResultSchema, type McpToolResult } from '@/infrastructure/schemas/mcp'
import { classifyHttpError } from '@/infrastructure/rest/classifyError'
import type { McpPort } from '@/application/ports'

type JsonRpcRequest = Readonly<{
  jsonrpc: '2.0'
  id: number
  method: string
  params: unknown
}>

type JsonRpcResponse =
  | { readonly jsonrpc: '2.0'; readonly id: number; readonly result: unknown }
  | { readonly jsonrpc: '2.0'; readonly id: number; readonly error: { code: number; message: string; data?: unknown } }

const DEFAULT_TIMEOUT_MS = 90_000

export class McpClient implements McpPort {
  private requestId = 0
  constructor(private readonly mcpUrl: string) {}

  async callTool(
    key: ApiKey, tool: McpToolName, params: unknown, signal?: AbortSignal,
  ): Promise<Result<McpToolResult, McpError>> {
    this.requestId += 1
    const body: JsonRpcRequest = {
      jsonrpc: '2.0',
      id: this.requestId,
      method: 'tools/call',
      params: { name: tool, arguments: params },
    }
    const localController = new AbortController()
    const timer = setTimeout(() => localController.abort(), DEFAULT_TIMEOUT_MS)
    const combined = signal ? anySignal([signal, localController.signal]) : localController.signal
    try {
      const response = await fetch(this.mcpUrl, {
        method: 'POST',
        signal: combined,
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
          authorization: `Bearer ${key}`,
        },
        body: JSON.stringify(body),
      })
      if (!response.ok) {
        const headersObj: Record<string, string> = {}
        response.headers.forEach((v, k) => { headersObj[k.toLowerCase()] = v })
        const text = await response.text()
        let parsedBody: unknown = null
        try { parsedBody = JSON.parse(text) } catch { parsedBody = text }
        return Err(classifyHttpError(response.status, parsedBody, headersObj))
      }
      const json = await response.json() as JsonRpcResponse
      if ('error' in json) {
        return Err({ kind: 'jsonrpc_error', code: json.error.code, message: json.error.message })
      }
      const parsed = McpToolResultSchema.safeParse(json.result)
      if (!parsed.success) {
        return Err({ kind: 'validation', issues: parsed.error.issues.map(i => ({ path: i.path, message: i.message })) })
      }
      return Ok(parsed.data)
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') {
        return Err({ kind: 'timeout', endpoint: this.mcpUrl })
      }
      return Err({ kind: 'network' })
    } finally {
      clearTimeout(timer)
    }
  }
}

function anySignal(signals: readonly AbortSignal[]): AbortSignal {
  const controller = new AbortController()
  for (const s of signals) {
    if (s.aborted) { controller.abort(); return controller.signal }
    s.addEventListener('abort', () => controller.abort(), { once: true })
  }
  return controller.signal
}
```

- [ ] **Step 4: Run and see it pass**

Run: `npx vitest run tests/infrastructure/mcp-client.test.ts`
Expected: 2 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/infrastructure/mcp/McpClient.ts tests/infrastructure/mcp-client.test.ts
git commit -m "feat(infra): MCP client with JSON-RPC 2.0 over HTTP"
```

---

### Task 3.5: Dexie DB + repos

**Files:**
- Create: `src/infrastructure/persistence/db.ts`, `src/infrastructure/persistence/AgentRepo.ts`, `src/infrastructure/persistence/HistoryRepo.ts`, `src/infrastructure/persistence/SessionRepo.ts`, `tests/infrastructure/repos.test.ts`

- [ ] **Step 1: Write failing test**

`tests/infrastructure/repos.test.ts`:
```ts
import { describe, expect, it, beforeEach } from 'vitest'
import { createDb } from '@/infrastructure/persistence/db'
import { DexieAgentRepo } from '@/infrastructure/persistence/AgentRepo'
import { DexieHistoryRepo } from '@/infrastructure/persistence/HistoryRepo'
import { DexieSessionRepo } from '@/infrastructure/persistence/SessionRepo'
import { AgentId, ApiKey, RequestId, SessionId } from '@/domain/branded'
import { Ok } from '@/domain/result'

const AGENT_ID = AgentId('11111111-1111-4111-8111-111111111111')

describe('DexieAgentRepo', () => {
  let repo: DexieAgentRepo
  beforeEach(() => {
    const db = createDb(`test-${Date.now()}-${Math.random()}`)
    repo = new DexieAgentRepo(db)
  })
  it('adds and lists agents', async () => {
    await repo.add({
      id: AGENT_ID, name: 'A', apiKey: ApiKey('sk'), createdAt: new Date(), color: '#123',
    })
    const all = await repo.list()
    expect(all.length).toBe(1)
    expect(all[0]?.name).toBe('A')
  })
})

describe('DexieHistoryRepo', () => {
  let repo: DexieHistoryRepo
  beforeEach(() => {
    const db = createDb(`test-${Date.now()}-${Math.random()}`)
    repo = new DexieHistoryRepo(db)
  })
  it('filters by agent', async () => {
    await repo.add({
      id: RequestId('r1'), agentId: AGENT_ID, timestamp: new Date(),
      kind: 'rest', endpoint: 'GET /x', request: {}, response: Ok({}), durationMs: 10,
    })
    const list = await repo.listByAgent(AGENT_ID, 10)
    expect(list.length).toBe(1)
  })
})

describe('DexieSessionRepo', () => {
  let repo: DexieSessionRepo
  beforeEach(() => {
    const db = createDb(`test-${Date.now()}-${Math.random()}`)
    repo = new DexieSessionRepo(db)
  })
  it('add + remove', async () => {
    await repo.add(AGENT_ID, {
      id: SessionId('sess_1'), createdAt: new Date(), proxyTier: 'none',
    })
    expect((await repo.listByAgent(AGENT_ID)).length).toBe(1)
    await repo.remove(AGENT_ID, SessionId('sess_1'))
    expect((await repo.listByAgent(AGENT_ID)).length).toBe(0)
  })
})
```

- [ ] **Step 2: Run and see it fail**

Run: `npx vitest run tests/infrastructure/repos.test.ts`
Expected: FAIL (modules not found).

- [ ] **Step 3: Implement DB**

`src/infrastructure/persistence/db.ts`:
```ts
import Dexie, { type Table } from 'dexie'
import type { Agent } from '@/domain/agent'
import type { HistoryEntry } from '@/domain/history'
import type { McpSession } from '@/domain/scraper'
import type { AgentId, SessionId } from '@/domain/branded'

export type SessionRow = McpSession & { agentId: AgentId; sessionKey: string }

export class AppDb extends Dexie {
  agents!: Table<Agent, AgentId>
  history!: Table<HistoryEntry, string>
  sessions!: Table<SessionRow, string>

  constructor(name = 'llm4agents-dashboard') {
    super(name)
    this.version(1).stores({
      agents: 'id, name, createdAt',
      history: 'id, agentId, timestamp, kind, endpoint',
      sessions: 'sessionKey, agentId, id, createdAt',
    })
  }
}

export function createDb(name?: string): AppDb {
  return new AppDb(name)
}

export function sessionKey(agentId: AgentId, sessionId: SessionId): string {
  return `${agentId}::${sessionId}`
}
```

- [ ] **Step 4: Implement AgentRepo**

`src/infrastructure/persistence/AgentRepo.ts`:
```ts
import type { Agent } from '@/domain/agent'
import type { AgentId } from '@/domain/branded'
import type { AgentRepo } from '@/application/ports'
import type { AppDb } from './db'

export class DexieAgentRepo implements AgentRepo {
  constructor(private readonly db: AppDb) {}
  async list(): Promise<readonly Agent[]> {
    return await this.db.agents.orderBy('createdAt').toArray()
  }
  async add(agent: Agent): Promise<void> {
    await this.db.agents.put(agent)
  }
  async rename(id: AgentId, name: string): Promise<void> {
    await this.db.agents.update(id, { name })
  }
  async remove(id: AgentId): Promise<void> {
    await this.db.agents.delete(id)
  }
  async get(id: AgentId): Promise<Agent | undefined> {
    return await this.db.agents.get(id)
  }
}
```

- [ ] **Step 5: Implement HistoryRepo**

`src/infrastructure/persistence/HistoryRepo.ts`:
```ts
import type { HistoryEntry } from '@/domain/history'
import type { AgentId } from '@/domain/branded'
import type { HistoryRepo } from '@/application/ports'
import type { AppDb } from './db'

export class DexieHistoryRepo implements HistoryRepo {
  constructor(private readonly db: AppDb) {}
  async add(entry: HistoryEntry): Promise<void> {
    await this.db.history.put(entry)
  }
  async listByAgent(id: AgentId, limit: number): Promise<readonly HistoryEntry[]> {
    return await this.db.history
      .where('agentId').equals(id)
      .reverse()
      .sortBy('timestamp')
      .then(arr => arr.slice(0, limit))
  }
  async clear(id: AgentId): Promise<void> {
    await this.db.history.where('agentId').equals(id).delete()
  }
}
```

- [ ] **Step 6: Implement SessionRepo**

`src/infrastructure/persistence/SessionRepo.ts`:
```ts
import type { AgentId, SessionId } from '@/domain/branded'
import type { McpSession } from '@/domain/scraper'
import type { SessionRepo } from '@/application/ports'
import { type AppDb, sessionKey, type SessionRow } from './db'

export class DexieSessionRepo implements SessionRepo {
  constructor(private readonly db: AppDb) {}
  async add(agentId: AgentId, session: McpSession): Promise<void> {
    const row: SessionRow = { ...session, agentId, sessionKey: sessionKey(agentId, session.id) }
    await this.db.sessions.put(row)
  }
  async listByAgent(id: AgentId): Promise<readonly McpSession[]> {
    const rows = await this.db.sessions.where('agentId').equals(id).toArray()
    return rows.map(({ agentId: _a, sessionKey: _k, ...rest }) => rest)
  }
  async remove(agentId: AgentId, sessionId: SessionId): Promise<void> {
    await this.db.sessions.delete(sessionKey(agentId, sessionId))
  }
}
```

- [ ] **Step 7: Run and see it pass**

Run: `npx vitest run tests/infrastructure/repos.test.ts`
Expected: 3 tests pass.

- [ ] **Step 8: Commit**

```bash
git add src/infrastructure/persistence/ tests/infrastructure/repos.test.ts
git commit -m "feat(infra): Dexie DB with Agent/History/Session repos"
```

---

**Phase 3 complete.** All infrastructure adapters implemented, covered by unit tests without touching the real network.

---

## Phase 4 — Application layer (use cases)

### Task 4.1: withHistory decorator

**Files:**
- Create: `src/application/withHistory.ts`, `tests/application/with-history.test.ts`

- [ ] **Step 1: Write failing test**

`tests/application/with-history.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { withHistory } from '@/application/withHistory'
import { Ok, Err } from '@/domain/result'
import { AgentId, RequestId } from '@/domain/branded'
import type { HistoryRepo } from '@/application/ports'
import type { HistoryEntry } from '@/domain/history'

const AGENT = AgentId('11111111-1111-4111-8111-111111111111')

function fakeRepo(): { repo: HistoryRepo; store: HistoryEntry[] } {
  const store: HistoryEntry[] = []
  return {
    store,
    repo: {
      add: async (e) => { store.push(e) },
      listByAgent: async () => [],
      clear: async () => {},
    },
  }
}

describe('withHistory', () => {
  it('records successful call', async () => {
    const { repo, store } = fakeRepo()
    const result = await withHistory({
      historyRepo: repo,
      agentId: AGENT,
      requestId: RequestId('r1'),
      kind: 'rest',
      endpoint: 'GET /balance',
      request: { foo: 1 },
      now: () => new Date('2026-04-17T00:00:00Z'),
    }, async () => Ok({ balance: 100 }))
    expect(result).toEqual({ ok: true, value: { balance: 100 } })
    expect(store).toHaveLength(1)
    expect(store[0]?.endpoint).toBe('GET /balance')
    expect(store[0]?.response).toEqual({ ok: true, value: { balance: 100 } })
  })

  it('records failed call', async () => {
    const { repo, store } = fakeRepo()
    await withHistory({
      historyRepo: repo,
      agentId: AGENT,
      requestId: RequestId('r2'),
      kind: 'mcp',
      endpoint: 'mcp:fetch_html',
      request: { url: 'x' },
      now: () => new Date(),
    }, async () => Err({ kind: 'network' as const }))
    expect(store).toHaveLength(1)
    expect(store[0]?.response.ok).toBe(false)
  })
})
```

- [ ] **Step 2: Run and see it fail**

Run: `npx vitest run tests/application/with-history.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

`src/application/withHistory.ts`:
```ts
import type { Result } from '@/domain/result'
import type { AgentId, RequestId, UsdCents } from '@/domain/branded'
import type { AppError } from '@/domain/errors'
import type { HistoryEntry } from '@/domain/history'
import type { HistoryRepo } from '@/application/ports'

export type WithHistoryContext<Req> = Readonly<{
  historyRepo: HistoryRepo
  agentId: AgentId
  requestId: RequestId
  kind: 'rest' | 'mcp'
  endpoint: string
  request: Req
  now: () => Date
  extractCostCents?: (value: unknown) => UsdCents | undefined
}>

export async function withHistory<T, E extends AppError, Req>(
  ctx: WithHistoryContext<Req>,
  action: () => Promise<Result<T, E>>,
): Promise<Result<T, E>> {
  const started = Date.now()
  const timestamp = ctx.now()
  const result = await action()
  const durationMs = Date.now() - started
  const costCents = result.ok && ctx.extractCostCents
    ? ctx.extractCostCents(result.value)
    : undefined
  const entry: HistoryEntry = {
    id: ctx.requestId,
    agentId: ctx.agentId,
    timestamp,
    kind: ctx.kind,
    endpoint: ctx.endpoint,
    request: ctx.request,
    response: result as Result<unknown, AppError>,
    ...(costCents !== undefined ? { costCents } : {}),
    durationMs,
  }
  await ctx.historyRepo.add(entry)
  return result
}
```

- [ ] **Step 4: Run and see it pass**

Run: `npx vitest run tests/application/with-history.test.ts`
Expected: 2 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/application/withHistory.ts tests/application/with-history.test.ts
git commit -m "feat(app): withHistory decorator records every use-case call"
```

---

### Task 4.2: Use cases (REST endpoints)

**Files:**
- Create: `src/application/useCases.ts`, `tests/application/use-cases.test.ts`

- [ ] **Step 1: Write failing test**

`tests/application/use-cases.test.ts`:
```ts
import { describe, expect, it, vi } from 'vitest'
import { makeUseCases } from '@/application/useCases'
import { Ok, Err } from '@/domain/result'
import { ApiKey, AgentId, UsdCents } from '@/domain/branded'
import type { RestApiPort, McpPort, HistoryRepo, SessionRepo, AgentRepo } from '@/application/ports'

const AGENT = AgentId('11111111-1111-4111-8111-111111111111')
const KEY = ApiKey('sk_test')

function fakes() {
  const rest: RestApiPort = {
    healthz: vi.fn(async () => Ok({ status: 'ok', service: 'x', timestamp: 't' })),
    registerAgent: vi.fn(async () => Ok({ uuid: '11111111-1111-4111-8111-111111111111', apiKey: 'k', name: 'n', createdAt: 't' })),
    getBalance: vi.fn(async () => Ok({ availableUsdCents: 500, totalDepositedUsd: 5, totalSpentUsd: 0 })),
    listModels: vi.fn(async () => Ok({ models: [] })),
    generateWallet: vi.fn(async () => Ok({ chain: 'solana' as const, token: 'USDC' as const, address: '0x', createdAt: 't' })),
    chatCompletion: vi.fn(async () => Ok({ data: { id: 'x', object: 'chat.completion', created: 0, model: 'm', choices: [{ index: 0, message: { role: 'assistant' as const, content: 'hi' } }] }, meta: { costCents: 2 } })),
    chatCompletionStream: vi.fn(async function* () {}),
    listTransactions: vi.fn(async () => Ok({ transactions: [], total: 0, limit: 50, offset: 0 })),
  }
  const mcp: McpPort = { callTool: vi.fn(async () => Ok({ content: [{ type: 'text' as const, text: 'x' }] })) }
  const agents: AgentRepo = { list: vi.fn(async () => []), add: vi.fn(), rename: vi.fn(), remove: vi.fn(), get: vi.fn(async () => undefined) }
  const history: HistoryRepo = { add: vi.fn(), listByAgent: vi.fn(async () => []), clear: vi.fn() }
  const sessions: SessionRepo = { add: vi.fn(), listByAgent: vi.fn(async () => []), remove: vi.fn() }
  return { rest, mcp, agents, history, sessions }
}

describe('use cases', () => {
  it('healthCheck calls rest.healthz', async () => {
    const f = fakes()
    const uc = makeUseCases({ ...f, now: () => new Date(), newRequestId: () => 'r1' })
    const r = await uc.healthCheck()
    expect(r.ok).toBe(true)
    expect(f.rest.healthz).toHaveBeenCalled()
  })

  it('fetchBalance records history with agentId', async () => {
    const f = fakes()
    const uc = makeUseCases({ ...f, now: () => new Date(), newRequestId: () => 'r1' })
    const r = await uc.fetchBalance(AGENT, KEY)
    expect(r.ok).toBe(true)
    expect(f.history.add).toHaveBeenCalledWith(expect.objectContaining({ agentId: AGENT, endpoint: 'GET /api/v1/balance' }))
  })

  it('executeChatCompletion returns meta + balanceRemaining', async () => {
    const f = fakes()
    const uc = makeUseCases({ ...f, now: () => new Date(), newRequestId: () => 'r1' })
    const r = await uc.executeChatCompletion(AGENT, KEY, {
      model: 'gemini-2.5-flash-lite', messages: [{ role: 'user', content: 'hi' }], stream: false,
    })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value.meta.costCents).toBe(2)
  })

  it('callScraperTool reaches McpPort', async () => {
    const f = fakes()
    const uc = makeUseCases({ ...f, now: () => new Date(), newRequestId: () => 'r1' })
    const r = await uc.callScraperTool(AGENT, KEY, 'fetch_html', { url: 'https://a.com', proxy_tier: 'none' })
    expect(r.ok).toBe(true)
    expect(f.mcp.callTool).toHaveBeenCalledWith(KEY, 'fetch_html', { url: 'https://a.com', proxy_tier: 'none' }, undefined)
  })

  it('registerAgent persists the new agent', async () => {
    const f = fakes()
    const uc = makeUseCases({ ...f, now: () => new Date(), newRequestId: () => 'r1' })
    const r = await uc.registerAgent({ name: 'test' }, '#abcabc')
    expect(r.ok).toBe(true)
    expect(f.agents.add).toHaveBeenCalled()
  })

  it('propagates errors', async () => {
    const f = fakes()
    f.rest.getBalance = vi.fn(async () => Err({ kind: 'unauthorized' as const }))
    const uc = makeUseCases({ ...f, now: () => new Date(), newRequestId: () => 'r1' })
    const r = await uc.fetchBalance(AGENT, KEY)
    expect(r).toEqual({ ok: false, error: { kind: 'unauthorized' } })
  })
})
```

- [ ] **Step 2: Run and see it fail**

Run: `npx vitest run tests/application/use-cases.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

`src/application/useCases.ts`:
```ts
import { Ok, Err, type Result } from '@/domain/result'
import type { RestError, McpError } from '@/domain/errors'
import {
  AgentId, ApiKey, RequestId, SessionId, UsdCents,
} from '@/domain/branded'
import type { Agent } from '@/domain/agent'
import type { McpToolName } from '@/domain/scraper'
import type {
  RestApiPort, McpPort, AgentRepo, HistoryRepo, SessionRepo,
  ChatResponseWithMeta, ChatStreamChunk,
} from '@/application/ports'
import {
  type HealthzResponse, type BalanceResponse, type ModelsResponse,
  type ChatCompletionRequest, type TransactionsResponse,
  type GenerateWalletRequest, type GenerateWalletResponse,
  type RegisterAgentRequest,
} from '@/infrastructure/schemas/rest'
import type { McpToolResult } from '@/infrastructure/schemas/mcp'
import { withHistory } from './withHistory'

export type Deps = Readonly<{
  rest: RestApiPort
  mcp: McpPort
  agents: AgentRepo
  history: HistoryRepo
  sessions: SessionRepo
  now: () => Date
  newRequestId: () => string
}>

export type UseCases = Readonly<{
  healthCheck(): Promise<Result<HealthzResponse, RestError>>
  registerAgent(req: RegisterAgentRequest, color: string): Promise<Result<Agent, RestError>>
  fetchBalance(agent: AgentId, key: ApiKey): Promise<Result<BalanceResponse, RestError>>
  fetchModels(agent: AgentId, key: ApiKey, search?: string): Promise<Result<ModelsResponse, RestError>>
  generateWallet(agent: AgentId, key: ApiKey, req: GenerateWalletRequest): Promise<Result<GenerateWalletResponse, RestError>>
  executeChatCompletion(agent: AgentId, key: ApiKey, req: ChatCompletionRequest): Promise<Result<ChatResponseWithMeta, RestError>>
  streamChatCompletion(
    agent: AgentId, key: ApiKey, req: ChatCompletionRequest, signal: AbortSignal,
  ): AsyncGenerator<ChatStreamChunk, void, void>
  listTransactions(agent: AgentId, key: ApiKey, params: Readonly<{ type?: 'deposit' | 'usage' | 'refund'; limit?: number; offset?: number }>): Promise<Result<TransactionsResponse, RestError>>
  callScraperTool(agent: AgentId, key: ApiKey, tool: McpToolName, params: unknown, signal?: AbortSignal): Promise<Result<McpToolResult, McpError>>
  openSession(agent: AgentId, key: ApiKey, proxyTier: 'none' | 'datacenter' | 'residential', initialUrl?: string): Promise<Result<SessionId, McpError>>
  closeSession(agent: AgentId, key: ApiKey, sessionId: SessionId): Promise<Result<void, McpError>>
}>

export function makeUseCases(deps: Deps): UseCases {
  const track = <T, E extends RestError | McpError>(
    agent: AgentId, kind: 'rest' | 'mcp', endpoint: string, request: unknown,
    action: () => Promise<Result<T, E>>,
  ): Promise<Result<T, E>> =>
    withHistory(
      {
        historyRepo: deps.history,
        agentId: agent,
        requestId: RequestId(deps.newRequestId()),
        kind, endpoint, request,
        now: deps.now,
      },
      action,
    )

  return {
    async healthCheck() {
      return deps.rest.healthz()
    },

    async registerAgent(req, color) {
      const res = await deps.rest.registerAgent(req)
      if (!res.ok) return res
      const agent: Agent = {
        id: AgentId(res.value.uuid),
        name: res.value.name,
        apiKey: ApiKey(res.value.apiKey),
        createdAt: new Date(res.value.createdAt),
        color,
      }
      await deps.agents.add(agent)
      return Ok(agent)
    },

    async fetchBalance(agent, key) {
      return track(agent, 'rest', 'GET /api/v1/balance', {}, () => deps.rest.getBalance(key))
    },

    async fetchModels(agent, key, search) {
      return track(agent, 'rest', 'GET /api/v1/models', { search }, () => deps.rest.listModels(key, search))
    },

    async generateWallet(agent, key, req) {
      return track(agent, 'rest', 'POST /api/v1/wallets/generate', req, () => deps.rest.generateWallet(key, req))
    },

    async executeChatCompletion(agent, key, req) {
      return track(agent, 'rest', 'POST /v1/chat/completions', req, () => deps.rest.chatCompletion(key, req))
    },

    async *streamChatCompletion(agent, key, req, signal) {
      const requestId = RequestId(deps.newRequestId())
      const timestamp = deps.now()
      const started = Date.now()
      let fullText = ''
      let doneMeta: ChatStreamChunk | undefined
      try {
        for await (const chunk of deps.rest.chatCompletionStream(key, req, signal)) {
          if (chunk.kind === 'delta') fullText += chunk.text
          if (chunk.kind === 'done') doneMeta = chunk
          yield chunk
        }
      } finally {
        const durationMs = Date.now() - started
        const costCents = doneMeta?.kind === 'done' && doneMeta.meta.costCents !== undefined
          ? UsdCents(doneMeta.meta.costCents) : undefined
        await deps.history.add({
          id: requestId,
          agentId: agent,
          timestamp,
          kind: 'rest',
          endpoint: 'POST /v1/chat/completions (stream)',
          request: req,
          response: Ok({ fullText, meta: doneMeta?.kind === 'done' ? doneMeta.meta : {} }),
          ...(costCents !== undefined ? { costCents } : {}),
          durationMs,
        })
      }
    },

    async listTransactions(agent, key, params) {
      return track(agent, 'rest', 'GET /api/v1/transactions', params, () => deps.rest.listTransactions(key, params))
    },

    async callScraperTool(agent, key, tool, params, signal) {
      return track(agent, 'mcp', `mcp:${tool}`, params, () => deps.mcp.callTool(key, tool, params, signal))
    },

    async openSession(agent, key, proxyTier, initialUrl) {
      const args: Record<string, unknown> = { proxy_tier: proxyTier }
      if (initialUrl) args.initial_url = initialUrl
      const res = await deps.mcp.callTool(key, 'session_create', args)
      if (!res.ok) return res
      const textItem = res.value.content.find(c => c.type === 'text')
      const raw = textItem && textItem.type === 'text' ? textItem.text : ''
      try {
        const parsed = JSON.parse(raw) as { session_id?: string }
        if (parsed.session_id) {
          const sid = SessionId(parsed.session_id)
          await deps.sessions.add(agent, {
            id: sid,
            createdAt: deps.now(),
            proxyTier,
            ...(initialUrl ? { initialUrl } : {}),
          })
          return Ok(sid)
        }
      } catch { /* fall through */ }
      return Err({ kind: 'invalid_params', details: 'session_create did not return session_id' })
    },

    async closeSession(agent, key, sessionId) {
      const res = await deps.mcp.callTool(key, 'session_close', { session_id: sessionId })
      if (!res.ok) return res
      await deps.sessions.remove(agent, sessionId)
      return Ok(undefined)
    },
  }
}
```

- [ ] **Step 4: Run and see it pass**

Run: `npx vitest run tests/application/use-cases.test.ts`
Expected: 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/application/useCases.ts tests/application/use-cases.test.ts
git commit -m "feat(app): use-case layer with typed orchestration of ports"
```

---

## Phase 5 — Composition root

### Task 5.1: Env validation + composition root

**Files:**
- Create: `src/composition/env.ts`, `src/composition/root.ts`, `tests/application/env.test.ts`

- [ ] **Step 1: Write failing env test**

`tests/application/env.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { loadEnv } from '@/composition/env'

describe('loadEnv', () => {
  it('accepts valid env', () => {
    expect(loadEnv({ VITE_API_BASE: '/proxy/api', VITE_MCP_BASE: '/proxy/mcp' })).toEqual({
      apiBase: '/proxy/api', mcpBase: '/proxy/mcp',
    })
  })
  it('rejects missing', () => {
    expect(() => loadEnv({})).toThrowError(/VITE_API_BASE/)
  })
})
```

- [ ] **Step 2: Run and see it fail**

Run: `npx vitest run tests/application/env.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement env loader**

`src/composition/env.ts`:
```ts
import { z } from 'zod'

const EnvSchema = z.object({
  VITE_API_BASE: z.string().min(1),
  VITE_MCP_BASE: z.string().min(1),
})

export type AppEnv = Readonly<{ apiBase: string; mcpBase: string }>

export function loadEnv(raw: Readonly<Record<string, string | undefined>>): AppEnv {
  const parsed = EnvSchema.safeParse(raw)
  if (!parsed.success) {
    const errors = parsed.error.issues.map(i => `  ${i.path.join('.')}: ${i.message}`).join('\n')
    throw new Error(`Invalid environment:\n${errors}`)
  }
  return { apiBase: parsed.data.VITE_API_BASE, mcpBase: parsed.data.VITE_MCP_BASE }
}
```

- [ ] **Step 4: Implement composition root**

`src/composition/root.ts`:
```ts
import { RestApiClient } from '@/infrastructure/rest/RestApiClient'
import { McpClient } from '@/infrastructure/mcp/McpClient'
import { createDb } from '@/infrastructure/persistence/db'
import { DexieAgentRepo } from '@/infrastructure/persistence/AgentRepo'
import { DexieHistoryRepo } from '@/infrastructure/persistence/HistoryRepo'
import { DexieSessionRepo } from '@/infrastructure/persistence/SessionRepo'
import { makeUseCases, type UseCases } from '@/application/useCases'
import type { AppEnv } from './env'

export type AppContainer = Readonly<{
  useCases: UseCases
}>

export function composeApp(env: AppEnv): AppContainer {
  const rest = new RestApiClient(env.apiBase, env.mcpBase)
  const mcp = new McpClient(env.mcpBase)
  const db = createDb()
  const agents = new DexieAgentRepo(db)
  const history = new DexieHistoryRepo(db)
  const sessions = new DexieSessionRepo(db)
  const useCases = makeUseCases({
    rest, mcp, agents, history, sessions,
    now: () => new Date(),
    newRequestId: () => crypto.randomUUID(),
  })
  return { useCases }
}
```

- [ ] **Step 5: Run and see it pass**

Run: `npx vitest run tests/application/env.test.ts`
Expected: 2 tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/composition/ tests/application/env.test.ts
git commit -m "feat(composition): typed env loader + root container"
```

---

## Phase 6 — Presentation layer (UI)

### Task 6.1: Init shadcn/ui CLI

**Files:**
- Create: `components.json`, `src/presentation/components/ui/*` (generated)

- [ ] **Step 1: Initialize shadcn**

Run:
```bash
npx shadcn@latest init -y \
  --base-color slate \
  --css-variables true
```

When prompted for paths:
- `src/presentation/components` for components
- `src` for import path root
- CSS file: `src/index.css`

- [ ] **Step 2: Add base components**

Run:
```bash
npx shadcn@latest add button input textarea select dialog tabs table card badge toast dropdown-menu tooltip separator scroll-area sheet skeleton label switch
```

- [ ] **Step 3: Verify typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add components.json src/presentation/components/ src/index.css tailwind.config.ts package.json package-lock.json src/lib 2>/dev/null || true
git commit -m "chore: install shadcn/ui base components"
```

---

### Task 6.2: Zustand store for active agent and theme

**Files:**
- Create: `src/presentation/hooks/useAppStore.ts`, `tests/application/store.test.ts`

- [ ] **Step 1: Write failing test**

`tests/application/store.test.ts`:
```ts
import { describe, expect, it, beforeEach } from 'vitest'
import { useAppStore } from '@/presentation/hooks/useAppStore'
import { AgentId } from '@/domain/branded'

const AGENT = AgentId('11111111-1111-4111-8111-111111111111')

describe('useAppStore', () => {
  beforeEach(() => {
    useAppStore.setState({ activeAgentId: undefined, theme: 'light', mainnetBannerAck: false })
  })
  it('setActiveAgent updates state', () => {
    useAppStore.getState().setActiveAgent(AGENT)
    expect(useAppStore.getState().activeAgentId).toBe(AGENT)
  })
  it('toggleTheme flips theme', () => {
    useAppStore.getState().toggleTheme()
    expect(useAppStore.getState().theme).toBe('dark')
  })
  it('ackMainnet sets banner flag', () => {
    useAppStore.getState().ackMainnet()
    expect(useAppStore.getState().mainnetBannerAck).toBe(true)
  })
})
```

- [ ] **Step 2: Run and see it fail**

Run: `npx vitest run tests/application/store.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

`src/presentation/hooks/useAppStore.ts`:
```ts
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { AgentId } from '@/domain/branded'

type Theme = 'light' | 'dark'

type AppState = {
  activeAgentId: AgentId | undefined
  theme: Theme
  mainnetBannerAck: boolean
  setActiveAgent: (id: AgentId | undefined) => void
  toggleTheme: () => void
  ackMainnet: () => void
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      activeAgentId: undefined,
      theme: 'light',
      mainnetBannerAck: false,
      setActiveAgent: (id) => set({ activeAgentId: id }),
      toggleTheme: () => set((s) => ({ theme: s.theme === 'light' ? 'dark' : 'light' })),
      ackMainnet: () => set({ mainnetBannerAck: true }),
    }),
    { name: 'llm4agents-ui' },
  ),
)
```

- [ ] **Step 4: Run and see it pass**

Run: `npx vitest run tests/application/store.test.ts`
Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/presentation/hooks/useAppStore.ts tests/application/store.test.ts
git commit -m "feat(ui): Zustand store for active agent + theme + mainnet ack"
```

---

### Task 6.3: App providers (QueryClient, AppContainer context, Router)

**Files:**
- Create: `src/presentation/hooks/useAppContainer.ts`, `src/presentation/layout/Providers.tsx`
- Modify: `src/app.tsx`

- [ ] **Step 1: Create container context**

`src/presentation/hooks/useAppContainer.ts`:
```ts
import { createContext, useContext } from 'react'
import type { AppContainer } from '@/composition/root'

export const AppContainerContext = createContext<AppContainer | null>(null)

export function useAppContainer(): AppContainer {
  const ctx = useContext(AppContainerContext)
  if (!ctx) throw new Error('AppContainer not provided')
  return ctx
}
```

- [ ] **Step 2: Create Providers component**

`src/presentation/layout/Providers.tsx`:
```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
import { useMemo, type ReactNode } from 'react'
import { AppContainerContext } from '@/presentation/hooks/useAppContainer'
import { composeApp } from '@/composition/root'
import { loadEnv } from '@/composition/env'

export function Providers({ children }: { children: ReactNode }) {
  const queryClient = useMemo(() => new QueryClient({
    defaultOptions: {
      queries: {
        retry: (count, err) => {
          const kind = (err as { kind?: string } | null)?.kind
          if (kind === 'unauthorized' || kind === 'insufficient_balance' || kind === 'validation') return false
          return count < 2
        },
        refetchOnWindowFocus: false,
        staleTime: 30_000,
      },
    },
  }), [])

  const container = useMemo(() => {
    const env = loadEnv({
      VITE_API_BASE: import.meta.env.VITE_API_BASE ?? '/proxy/api',
      VITE_MCP_BASE: import.meta.env.VITE_MCP_BASE ?? '/proxy/mcp',
    })
    return composeApp(env)
  }, [])

  return (
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        <AppContainerContext.Provider value={container}>
          {children}
        </AppContainerContext.Provider>
      </QueryClientProvider>
    </BrowserRouter>
  )
}
```

- [ ] **Step 3: Rewrite src/app.tsx with layout skeleton**

`src/app.tsx`:
```tsx
import { Route, Routes, Navigate } from 'react-router-dom'
import { Providers } from '@/presentation/layout/Providers'
import { AppShell } from '@/presentation/layout/AppShell'
import { Home } from '@/presentation/routes/Home'
import { Agents } from '@/presentation/routes/Agents'
import { Models } from '@/presentation/routes/Models'
import { Chat } from '@/presentation/routes/Chat'
import { Wallet } from '@/presentation/routes/Wallet'
import { Transactions } from '@/presentation/routes/Transactions'
import { ScraperOneShot } from '@/presentation/routes/ScraperOneShot'
import { ScraperSessions } from '@/presentation/routes/ScraperSessions'
import { Health } from '@/presentation/routes/Health'
import { Settings } from '@/presentation/routes/Settings'

export function App() {
  return (
    <Providers>
      <AppShell>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/agents" element={<Agents />} />
          <Route path="/models" element={<Models />} />
          <Route path="/chat" element={<Chat />} />
          <Route path="/wallet" element={<Wallet />} />
          <Route path="/transactions" element={<Transactions />} />
          <Route path="/scraper/one-shot" element={<ScraperOneShot />} />
          <Route path="/scraper/sessions" element={<ScraperSessions />} />
          <Route path="/health" element={<Health />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AppShell>
    </Providers>
  )
}
```

- [ ] **Step 4: Commit (routes are stubbed — will be implemented next)**

```bash
git add src/presentation/hooks/useAppContainer.ts src/presentation/layout/Providers.tsx src/app.tsx
git commit -m "feat(ui): Providers wiring (QueryClient + AppContainer + Router)"
```

Note: `npm run dev` will fail until the routes and AppShell exist — implemented in 6.4+.

---

### Task 6.4: AppShell layout (Sidebar + Topbar + MainnetBanner)

**Files:**
- Create: `src/presentation/layout/AppShell.tsx`, `src/presentation/layout/Sidebar.tsx`, `src/presentation/layout/Topbar.tsx`, `src/presentation/layout/MainnetBanner.tsx`, `src/presentation/layout/ThemeEffect.tsx`

- [ ] **Step 1: Write ThemeEffect**

`src/presentation/layout/ThemeEffect.tsx`:
```tsx
import { useEffect } from 'react'
import { useAppStore } from '@/presentation/hooks/useAppStore'

export function ThemeEffect() {
  const theme = useAppStore((s) => s.theme)
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme])
  return null
}
```

- [ ] **Step 2: Write MainnetBanner**

`src/presentation/layout/MainnetBanner.tsx`:
```tsx
import { useAppStore } from '@/presentation/hooks/useAppStore'
import { Button } from '@/presentation/components/ui/button'

export function MainnetBanner() {
  const ack = useAppStore((s) => s.mainnetBannerAck)
  const dismiss = useAppStore((s) => s.ackMainnet)
  if (ack) return null
  return (
    <div className="bg-amber-500 text-amber-950 px-4 py-2 text-sm flex items-center justify-between">
      <span>⚠ MAINNET — this dashboard talks to real money on real chains.</span>
      <Button size="sm" variant="secondary" onClick={dismiss}>I understand</Button>
    </div>
  )
}
```

- [ ] **Step 3: Write Sidebar**

`src/presentation/layout/Sidebar.tsx`:
```tsx
import { NavLink } from 'react-router-dom'

const links: readonly { to: string; label: string }[] = [
  { to: '/', label: 'Home' },
  { to: '/agents', label: 'Agents' },
  { to: '/models', label: 'Models' },
  { to: '/chat', label: 'Chat' },
  { to: '/wallet', label: 'Wallet' },
  { to: '/transactions', label: 'Transactions' },
  { to: '/scraper/one-shot', label: 'Scraper (one-shot)' },
  { to: '/scraper/sessions', label: 'Scraper (sessions)' },
  { to: '/health', label: 'Health' },
  { to: '/settings', label: 'Settings' },
]

export function Sidebar() {
  return (
    <nav className="w-56 border-r border-border bg-muted/30 p-3 space-y-1">
      <div className="font-semibold text-sm mb-3 px-2">llm4agents</div>
      {links.map((l) => (
        <NavLink
          key={l.to}
          to={l.to}
          end={l.to === '/'}
          className={({ isActive }) =>
            `block px-2 py-1.5 rounded text-sm ${isActive ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'}`
          }
        >
          {l.label}
        </NavLink>
      ))}
    </nav>
  )
}
```

- [ ] **Step 4: Write Topbar**

`src/presentation/layout/Topbar.tsx`:
```tsx
import { AgentSwitcher } from '@/presentation/components/AgentSwitcher'
import { BalanceBadge } from '@/presentation/components/BalanceBadge'
import { Button } from '@/presentation/components/ui/button'
import { useAppStore } from '@/presentation/hooks/useAppStore'

export function Topbar() {
  const theme = useAppStore((s) => s.theme)
  const toggle = useAppStore((s) => s.toggleTheme)
  return (
    <header className="h-14 border-b border-border flex items-center justify-between px-4 gap-3">
      <AgentSwitcher />
      <div className="flex items-center gap-3">
        <BalanceBadge />
        <Button size="sm" variant="ghost" onClick={toggle}>
          {theme === 'light' ? 'Dark' : 'Light'}
        </Button>
      </div>
    </header>
  )
}
```

- [ ] **Step 5: Write AppShell**

`src/presentation/layout/AppShell.tsx`:
```tsx
import type { ReactNode } from 'react'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'
import { MainnetBanner } from './MainnetBanner'
import { ThemeEffect } from './ThemeEffect'

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="h-screen flex flex-col">
      <ThemeEffect />
      <MainnetBanner />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <div className="flex-1 flex flex-col overflow-hidden">
          <Topbar />
          <main className="flex-1 overflow-auto p-6">{children}</main>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 6: Commit (depends on AgentSwitcher/BalanceBadge in next tasks)**

```bash
git add src/presentation/layout/
git commit -m "feat(ui): AppShell layout with Sidebar, Topbar, MainnetBanner"
```

---

### Task 6.5: AgentSwitcher + BalanceBadge + CostBadge

**Files:**
- Create: `src/presentation/components/AgentSwitcher.tsx`, `src/presentation/components/BalanceBadge.tsx`, `src/presentation/components/CostBadge.tsx`, `src/presentation/hooks/useAgents.ts`, `src/presentation/hooks/useBalance.ts`

- [ ] **Step 1: Implement useAgents hook**

`src/presentation/hooks/useAgents.ts`:
```ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAppContainer } from './useAppContainer'
import type { Agent } from '@/domain/agent'
import type { AgentId } from '@/domain/branded'

const KEY = ['agents'] as const

export function useAgents() {
  const { useCases: _ } = useAppContainer()
  void _
  const qc = useQueryClient()
  const listQuery = useQuery({
    queryKey: KEY,
    queryFn: async (): Promise<readonly Agent[]> => {
      const { useCases: _2 } = { useCases: null as unknown as never }
      void _2
      throw new Error('replaced below')
    },
  })
  return { listQuery, invalidate: () => qc.invalidateQueries({ queryKey: KEY }) }
}
```

Note: the above is a stub to fix the pattern. Replace with the full working version below.

Replace file contents with:
```ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAppContainer } from './useAppContainer'
import type { Agent } from '@/domain/agent'

const KEY = ['agents'] as const

export function useAgents() {
  const container = useAppContainer()
  const qc = useQueryClient()

  const listQuery = useQuery({
    queryKey: KEY,
    queryFn: async (): Promise<readonly Agent[]> => {
      // Direct access to repo via container — expose through a use case in a future refactor
      const repo = (container as unknown as { _agentRepo?: unknown })._agentRepo
      void repo
      return []
    },
  })

  const register = useMutation({
    mutationFn: async (params: { name: string; color: string }) => {
      const res = await container.useCases.registerAgent({ name: params.name }, params.color)
      if (!res.ok) throw res.error
      return res.value
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  })

  return { listQuery, register }
}
```

**Correction:** the above reveals that `AgentRepo` isn't exposed via the use cases. Fix: extend `UseCases` with `listAgents` and `removeAgent`.

Edit `src/application/useCases.ts` — in the `UseCases` type add:
```ts
listAgents(): Promise<readonly Agent[]>
removeAgentLocal(id: AgentId): Promise<void>
```

In `makeUseCases` add implementations:
```ts
async listAgents() { return deps.agents.list() },
async removeAgentLocal(id) { await deps.agents.remove(id) },
```

Then update `src/presentation/hooks/useAgents.ts`:
```ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAppContainer } from './useAppContainer'
import type { Agent } from '@/domain/agent'
import type { AgentId } from '@/domain/branded'

const KEY = ['agents'] as const

export function useAgents() {
  const container = useAppContainer()
  const qc = useQueryClient()

  const listQuery = useQuery({
    queryKey: KEY,
    queryFn: async (): Promise<readonly Agent[]> => container.useCases.listAgents(),
  })

  const register = useMutation({
    mutationFn: async (params: { name: string; color: string }) => {
      const res = await container.useCases.registerAgent({ name: params.name }, params.color)
      if (!res.ok) throw res.error
      return res.value
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  })

  const remove = useMutation({
    mutationFn: async (id: AgentId) => container.useCases.removeAgentLocal(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  })

  return { listQuery, register, remove }
}
```

- [ ] **Step 2: Implement useBalance**

`src/presentation/hooks/useBalance.ts`:
```ts
import { useQuery } from '@tanstack/react-query'
import { useAppContainer } from './useAppContainer'
import { useAppStore } from './useAppStore'
import { useAgents } from './useAgents'
import type { BalanceResponse } from '@/infrastructure/schemas/rest'

export function useBalance() {
  const container = useAppContainer()
  const activeId = useAppStore((s) => s.activeAgentId)
  const { listQuery } = useAgents()
  const agent = listQuery.data?.find((a) => a.id === activeId)
  return useQuery({
    queryKey: ['agent', activeId, 'balance'],
    enabled: !!agent,
    queryFn: async (): Promise<BalanceResponse> => {
      if (!agent) throw new Error('no agent')
      const res = await container.useCases.fetchBalance(agent.id, agent.apiKey)
      if (!res.ok) throw res.error
      return res.value
    },
  })
}
```

- [ ] **Step 3: Implement AgentSwitcher**

`src/presentation/components/AgentSwitcher.tsx`:
```tsx
import { useAgents } from '@/presentation/hooks/useAgents'
import { useAppStore } from '@/presentation/hooks/useAppStore'
import { AgentId } from '@/domain/branded'

export function AgentSwitcher() {
  const { listQuery } = useAgents()
  const active = useAppStore((s) => s.activeAgentId)
  const setActive = useAppStore((s) => s.setActiveAgent)

  const agents = listQuery.data ?? []
  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-muted-foreground">Agent:</span>
      <select
        value={active ?? ''}
        onChange={(e) => setActive(e.target.value ? AgentId(e.target.value) : undefined)}
        className="h-8 rounded border border-border bg-background px-2 text-sm"
      >
        <option value="">— none —</option>
        {agents.map((a) => (
          <option key={a.id} value={a.id}>{a.name}</option>
        ))}
      </select>
    </div>
  )
}
```

- [ ] **Step 4: Implement BalanceBadge**

`src/presentation/components/BalanceBadge.tsx`:
```tsx
import { useBalance } from '@/presentation/hooks/useBalance'

export function BalanceBadge() {
  const q = useBalance()
  if (!q.data) return <span className="text-xs text-muted-foreground">Balance —</span>
  const usd = (q.data.availableUsdCents / 100).toFixed(2)
  return <span className="text-xs font-medium">Balance: ${usd}</span>
}
```

- [ ] **Step 5: Implement CostBadge**

`src/presentation/components/CostBadge.tsx`:
```tsx
import type { ChatResponseMeta } from '@/application/ports'

export function CostBadge({ meta }: { meta: ChatResponseMeta | undefined }) {
  if (!meta) return null
  const parts: string[] = []
  if (meta.costCents !== undefined) parts.push(`$${(meta.costCents / 100).toFixed(4)}`)
  if (meta.tokensInput !== undefined) parts.push(`in: ${meta.tokensInput}`)
  if (meta.tokensOutput !== undefined) parts.push(`out: ${meta.tokensOutput}`)
  if (meta.balanceRemainingCents !== undefined)
    parts.push(`remaining: $${(meta.balanceRemainingCents / 100).toFixed(2)}`)
  return <div className="text-xs text-muted-foreground">{parts.join(' • ')}</div>
}
```

- [ ] **Step 6: Commit**

```bash
git add src/application/useCases.ts src/presentation/hooks/useAgents.ts src/presentation/hooks/useBalance.ts src/presentation/components/
git commit -m "feat(ui): AgentSwitcher, BalanceBadge, CostBadge + agent/balance hooks"
```

---

### Task 6.6: ErrorView + shared UI helpers

**Files:**
- Create: `src/presentation/components/ErrorView.tsx`, `src/presentation/components/JsonView.tsx`, `src/presentation/components/Section.tsx`

- [ ] **Step 1: Write ErrorView**

`src/presentation/components/ErrorView.tsx`:
```tsx
import type { AppError } from '@/domain/errors'
import { describeError } from '@/domain/errors'
import { assertNever } from '@/domain/result'

export function ErrorView({ error }: { error: AppError }) {
  const msg = describeError(error)
  return (
    <div className="rounded border border-destructive/40 bg-destructive/10 text-destructive-foreground p-3 text-sm">
      <div className="font-semibold">{humanKind(error)}</div>
      <div>{msg}</div>
      {'body' in error && error.body !== null ? (
        <pre className="mt-2 text-xs overflow-auto">{safeStringify(error.body)}</pre>
      ) : null}
    </div>
  )
}

function humanKind(e: AppError): string {
  switch (e.kind) {
    case 'network': return 'Network error'
    case 'timeout': return 'Timeout'
    case 'unauthorized': return 'Unauthorized'
    case 'insufficient_balance': return 'Insufficient balance'
    case 'rate_limited': return 'Rate limited'
    case 'validation': return 'Validation failed'
    case 'upstream_error': return 'Upstream error'
    case 'jsonrpc_error': return 'MCP JSON-RPC error'
    case 'invalid_params': return 'Invalid params'
    default: return assertNever(e)
  }
}

function safeStringify(v: unknown): string {
  try { return JSON.stringify(v, null, 2) } catch { return String(v) }
}
```

- [ ] **Step 2: Write JsonView**

`src/presentation/components/JsonView.tsx`:
```tsx
export function JsonView({ value }: { value: unknown }) {
  let text: string
  try { text = JSON.stringify(value, null, 2) } catch { text = String(value) }
  return <pre className="text-xs bg-muted p-3 rounded overflow-auto max-h-96">{text}</pre>
}
```

- [ ] **Step 3: Write Section**

`src/presentation/components/Section.tsx`:
```tsx
import type { ReactNode } from 'react'

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-6">
      <h2 className="text-lg font-semibold mb-3">{title}</h2>
      {children}
    </section>
  )
}
```

- [ ] **Step 4: Commit**

```bash
git add src/presentation/components/ErrorView.tsx src/presentation/components/JsonView.tsx src/presentation/components/Section.tsx
git commit -m "feat(ui): ErrorView + JsonView + Section helpers"
```

---

### Task 6.7: Route — Agents (register, list, delete, activate)

**Files:**
- Create: `src/presentation/routes/Agents.tsx`

- [ ] **Step 1: Implement**

`src/presentation/routes/Agents.tsx`:
```tsx
import { useState } from 'react'
import { Button } from '@/presentation/components/ui/button'
import { Input } from '@/presentation/components/ui/input'
import { Card } from '@/presentation/components/ui/card'
import { Section } from '@/presentation/components/Section'
import { ErrorView } from '@/presentation/components/ErrorView'
import { useAgents } from '@/presentation/hooks/useAgents'
import { useAppStore } from '@/presentation/hooks/useAppStore'
import type { AppError } from '@/domain/errors'

function pickColor(seed: string): string {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0
  const hue = Math.abs(h) % 360
  return `hsl(${hue} 70% 50%)`
}

export function Agents() {
  const { listQuery, register, remove } = useAgents()
  const active = useAppStore((s) => s.activeAgentId)
  const setActive = useAppStore((s) => s.setActiveAgent)
  const [name, setName] = useState('')

  const onCreate = async () => {
    if (!name.trim()) return
    await register.mutateAsync({ name: name.trim(), color: pickColor(name) })
    setName('')
  }

  const err = register.error as AppError | null

  return (
    <div>
      <Section title="Register new agent">
        <Card className="p-4 flex gap-2 items-end max-w-xl">
          <div className="flex-1">
            <label className="text-sm block mb-1">Name</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="my-agent" />
          </div>
          <Button onClick={onCreate} disabled={register.isPending}>
            {register.isPending ? 'Registering…' : 'Register'}
          </Button>
        </Card>
        {err ? <div className="mt-3"><ErrorView error={err} /></div> : null}
      </Section>

      <Section title="Your agents">
        <div className="space-y-2">
          {(listQuery.data ?? []).map((a) => (
            <Card key={a.id} className="p-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-full" style={{ background: a.color }} />
                <div>
                  <div className="font-medium">{a.name}</div>
                  <div className="text-xs text-muted-foreground">{a.id}</div>
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant={active === a.id ? 'default' : 'secondary'}
                  onClick={() => setActive(a.id)}
                >
                  {active === a.id ? 'Active' : 'Activate'}
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => remove.mutate(a.id)}
                >
                  Delete
                </Button>
              </div>
            </Card>
          ))}
          {(listQuery.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No agents yet. Register one above.</p>
          ) : null}
        </div>
      </Section>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/presentation/routes/Agents.tsx
git commit -m "feat(ui): /agents route — register, list, activate, delete"
```

---

### Task 6.8: Route — Home (balance, last transactions, MCP sessions from IndexedDB)

**Files:**
- Create: `src/presentation/routes/Home.tsx`, `src/presentation/hooks/useActiveAgent.ts`, `src/presentation/hooks/useTransactions.ts`

- [ ] **Step 1: Write useActiveAgent helper**

`src/presentation/hooks/useActiveAgent.ts`:
```ts
import { useAgents } from './useAgents'
import { useAppStore } from './useAppStore'
import type { Agent } from '@/domain/agent'

export function useActiveAgent(): Agent | undefined {
  const activeId = useAppStore((s) => s.activeAgentId)
  const { listQuery } = useAgents()
  return listQuery.data?.find((a) => a.id === activeId)
}
```

- [ ] **Step 2: Write useTransactions**

`src/presentation/hooks/useTransactions.ts`:
```ts
import { useQuery } from '@tanstack/react-query'
import { useAppContainer } from './useAppContainer'
import { useActiveAgent } from './useActiveAgent'

export function useTransactions(params: {
  type?: 'deposit' | 'usage' | 'refund'; limit?: number; offset?: number
} = {}) {
  const container = useAppContainer()
  const agent = useActiveAgent()
  return useQuery({
    queryKey: ['agent', agent?.id, 'transactions', params],
    enabled: !!agent,
    queryFn: async () => {
      if (!agent) throw new Error('no agent')
      const res = await container.useCases.listTransactions(agent.id, agent.apiKey, params)
      if (!res.ok) throw res.error
      return res.value
    },
  })
}
```

- [ ] **Step 3: Write Home**

`src/presentation/routes/Home.tsx`:
```tsx
import { Link } from 'react-router-dom'
import { Card } from '@/presentation/components/ui/card'
import { Section } from '@/presentation/components/Section'
import { useBalance } from '@/presentation/hooks/useBalance'
import { useTransactions } from '@/presentation/hooks/useTransactions'
import { useActiveAgent } from '@/presentation/hooks/useActiveAgent'
import { Button } from '@/presentation/components/ui/button'

export function Home() {
  const agent = useActiveAgent()
  const balance = useBalance()
  const tx = useTransactions({ limit: 5 })

  if (!agent) {
    return (
      <Card className="p-6 max-w-xl">
        <h1 className="text-xl font-semibold mb-2">Welcome</h1>
        <p className="text-sm text-muted-foreground mb-4">
          Create your first agent to begin. Testing happens against mainnet — deposits are real money.
        </p>
        <Link to="/agents"><Button>Go to Agents</Button></Link>
      </Card>
    )
  }

  return (
    <div>
      <Section title="Balance">
        <Card className="p-4">
          {balance.isLoading ? 'Loading…' :
            balance.data ? (
              <div>
                <div className="text-2xl font-semibold">${(balance.data.availableUsdCents / 100).toFixed(2)}</div>
                <div className="text-xs text-muted-foreground">
                  deposited ${balance.data.totalDepositedUsd.toFixed(2)} • spent ${balance.data.totalSpentUsd.toFixed(2)}
                </div>
                <Button size="sm" variant="secondary" className="mt-3" onClick={() => balance.refetch()}>Refresh</Button>
              </div>
            ) : <span className="text-sm text-muted-foreground">No balance data</span>}
        </Card>
      </Section>

      <Section title="Recent transactions">
        <Card className="p-4">
          {tx.data && tx.data.transactions.length > 0 ? (
            <ul className="text-sm divide-y divide-border">
              {tx.data.transactions.map((t) => (
                <li key={t.id} className="py-2 flex justify-between">
                  <span>{t.type} — {t.description ?? '—'}</span>
                  <span className={t.type === 'deposit' ? 'text-green-500' : ''}>
                    ${(t.amountCents / 100).toFixed(2)}
                  </span>
                </li>
              ))}
            </ul>
          ) : <span className="text-sm text-muted-foreground">No transactions yet</span>}
        </Card>
      </Section>
    </div>
  )
}
```

- [ ] **Step 4: Commit**

```bash
git add src/presentation/hooks/useActiveAgent.ts src/presentation/hooks/useTransactions.ts src/presentation/routes/Home.tsx
git commit -m "feat(ui): /home route with balance card + last transactions"
```

---

### Task 6.9: Route — Models

**Files:**
- Create: `src/presentation/routes/Models.tsx`, `src/presentation/hooks/useModels.ts`

- [ ] **Step 1: Write hook**

`src/presentation/hooks/useModels.ts`:
```ts
import { useQuery } from '@tanstack/react-query'
import { useAppContainer } from './useAppContainer'
import { useActiveAgent } from './useActiveAgent'

export function useModels(search?: string) {
  const container = useAppContainer()
  const agent = useActiveAgent()
  return useQuery({
    queryKey: ['agent', agent?.id, 'models', search],
    enabled: !!agent,
    queryFn: async () => {
      if (!agent) throw new Error('no agent')
      const res = await container.useCases.fetchModels(agent.id, agent.apiKey, search)
      if (!res.ok) throw res.error
      return res.value
    },
  })
}
```

- [ ] **Step 2: Write Models route**

`src/presentation/routes/Models.tsx`:
```tsx
import { useState } from 'react'
import { Input } from '@/presentation/components/ui/input'
import { Card } from '@/presentation/components/ui/card'
import { useModels } from '@/presentation/hooks/useModels'
import { Section } from '@/presentation/components/Section'
import { ErrorView } from '@/presentation/components/ErrorView'
import type { AppError } from '@/domain/errors'

export function Models() {
  const [search, setSearch] = useState('')
  const q = useModels(search || undefined)
  const err = q.error as AppError | null

  return (
    <div>
      <Section title="Models">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search models…"
          className="max-w-sm mb-4"
        />
        {err ? <ErrorView error={err} /> : null}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {(q.data?.models ?? []).map((m) => (
            <Card key={m.id} className="p-3">
              <div className="font-medium">{m.name} <span className="text-xs text-muted-foreground">({m.id})</span></div>
              <div className="text-xs text-muted-foreground">
                ctx {m.contextWindow.toLocaleString()} tokens •
                in ${(m.pricing.inputPer1mCents / 100).toFixed(2)}/1M •
                out ${(m.pricing.outputPer1mCents / 100).toFixed(2)}/1M
              </div>
              {!m.enabled ? <div className="text-xs text-destructive mt-1">disabled</div> : null}
            </Card>
          ))}
        </div>
      </Section>
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add src/presentation/hooks/useModels.ts src/presentation/routes/Models.tsx
git commit -m "feat(ui): /models route with search + pricing cards"
```

---

### Task 6.10: Route — Wallet + Health

**Files:**
- Create: `src/presentation/routes/Wallet.tsx`, `src/presentation/routes/Health.tsx`

- [ ] **Step 1: Implement Wallet**

`src/presentation/routes/Wallet.tsx`:
```tsx
import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Button } from '@/presentation/components/ui/button'
import { Card } from '@/presentation/components/ui/card'
import { Section } from '@/presentation/components/Section'
import { ErrorView } from '@/presentation/components/ErrorView'
import { useAppContainer } from '@/presentation/hooks/useAppContainer'
import { useActiveAgent } from '@/presentation/hooks/useActiveAgent'
import { useBalance } from '@/presentation/hooks/useBalance'
import type { AppError } from '@/domain/errors'
import type { GenerateWalletResponse } from '@/infrastructure/schemas/rest'

export function Wallet() {
  const agent = useActiveAgent()
  const container = useAppContainer()
  const balance = useBalance()
  const [chain, setChain] = useState<'solana' | 'polygon'>('solana')
  const [token, setToken] = useState<'USDT' | 'USDC'>('USDC')

  const gen = useMutation({
    mutationFn: async (): Promise<GenerateWalletResponse> => {
      if (!agent) throw new Error('no agent')
      const res = await container.useCases.generateWallet(agent.id, agent.apiKey, { chain, token })
      if (!res.ok) throw res.error
      return res.value
    },
  })

  if (!agent) return <p className="text-sm text-muted-foreground">Select an agent first.</p>
  const err = gen.error as AppError | null

  return (
    <div>
      <Section title="Balance">
        <Card className="p-4 flex items-center gap-4">
          <div className="text-2xl font-semibold">
            {balance.data ? `$${(balance.data.availableUsdCents / 100).toFixed(2)}` : '—'}
          </div>
          <Button size="sm" variant="secondary" onClick={() => balance.refetch()}>Refresh</Button>
        </Card>
      </Section>

      <Section title="Generate deposit wallet">
        <Card className="p-4 space-y-3 max-w-xl">
          <div className="flex gap-3">
            <label className="text-sm">
              Chain:
              <select value={chain} onChange={(e) => setChain(e.target.value as 'solana' | 'polygon')} className="ml-2 h-8 rounded border border-border bg-background px-2 text-sm">
                <option value="solana">solana</option>
                <option value="polygon">polygon</option>
              </select>
            </label>
            <label className="text-sm">
              Token:
              <select value={token} onChange={(e) => setToken(e.target.value as 'USDT' | 'USDC')} className="ml-2 h-8 rounded border border-border bg-background px-2 text-sm">
                <option value="USDC">USDC</option>
                <option value="USDT">USDT</option>
              </select>
            </label>
          </div>
          <Button onClick={() => gen.mutate()} disabled={gen.isPending}>
            {gen.isPending ? 'Generating…' : 'Generate wallet'}
          </Button>
          {gen.data ? (
            <div className="rounded border border-border p-3 text-sm">
              <div><b>Chain:</b> {gen.data.chain} • <b>Token:</b> {gen.data.token}</div>
              <div className="mt-1 font-mono break-all">{gen.data.address}</div>
              <Button size="sm" variant="secondary" className="mt-2"
                onClick={() => void navigator.clipboard.writeText(gen.data!.address)}>
                Copy address
              </Button>
            </div>
          ) : null}
          {err ? <ErrorView error={err} /> : null}
        </Card>
      </Section>
    </div>
  )
}
```

- [ ] **Step 2: Implement Health**

`src/presentation/routes/Health.tsx`:
```tsx
import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { Button } from '@/presentation/components/ui/button'
import { Card } from '@/presentation/components/ui/card'
import { useAppContainer } from '@/presentation/hooks/useAppContainer'
import { Section } from '@/presentation/components/Section'
import type { HealthzResponse } from '@/infrastructure/schemas/rest'

export function Health() {
  const container = useAppContainer()
  const [lastPing, setLastPing] = useState<string | undefined>()

  const ping = useMutation({
    mutationFn: async (): Promise<HealthzResponse> => {
      const res = await container.useCases.healthCheck()
      if (!res.ok) throw res.error
      setLastPing(new Date().toISOString())
      return res.value
    },
  })

  return (
    <Section title="Health check">
      <Card className="p-4 max-w-xl space-y-3">
        <Button onClick={() => ping.mutate()} disabled={ping.isPending}>
          {ping.isPending ? 'Pinging…' : 'Ping /healthz'}
        </Button>
        {ping.data ? (
          <div className="text-sm">
            <div>status: <b>{ping.data.status}</b></div>
            <div>service: {ping.data.service}</div>
            <div>server time: {ping.data.timestamp}</div>
            <div>client ping at: {lastPing}</div>
          </div>
        ) : null}
      </Card>
    </Section>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add src/presentation/routes/Wallet.tsx src/presentation/routes/Health.tsx
git commit -m "feat(ui): /wallet (generate + balance) and /health routes"
```

---

### Task 6.11: Route — Transactions

**Files:**
- Create: `src/presentation/routes/Transactions.tsx`

- [ ] **Step 1: Implement**

`src/presentation/routes/Transactions.tsx`:
```tsx
import { useState } from 'react'
import { Section } from '@/presentation/components/Section'
import { Card } from '@/presentation/components/ui/card'
import { Button } from '@/presentation/components/ui/button'
import { useTransactions } from '@/presentation/hooks/useTransactions'
import { ErrorView } from '@/presentation/components/ErrorView'
import type { AppError } from '@/domain/errors'

const PAGE = 50

export function Transactions() {
  const [type, setType] = useState<'all' | 'deposit' | 'usage' | 'refund'>('all')
  const [offset, setOffset] = useState(0)
  const q = useTransactions({
    ...(type !== 'all' ? { type } : {}),
    limit: PAGE,
    offset,
  })
  const err = q.error as AppError | null

  return (
    <Section title="Transactions">
      <div className="flex gap-2 mb-3">
        {(['all', 'deposit', 'usage', 'refund'] as const).map((t) => (
          <Button key={t} size="sm" variant={type === t ? 'default' : 'secondary'} onClick={() => { setType(t); setOffset(0) }}>
            {t}
          </Button>
        ))}
      </div>

      {err ? <ErrorView error={err} /> : null}

      <Card className="p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left">
            <tr>
              <th className="p-2">Type</th>
              <th className="p-2">Amount</th>
              <th className="p-2">When</th>
              <th className="p-2">Description</th>
            </tr>
          </thead>
          <tbody>
            {(q.data?.transactions ?? []).map((t) => (
              <tr key={t.id} className="border-t border-border">
                <td className="p-2">{t.type}</td>
                <td className="p-2">${(t.amountCents / 100).toFixed(2)}</td>
                <td className="p-2">{new Date(t.timestamp).toLocaleString()}</td>
                <td className="p-2 text-muted-foreground">{t.description ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <div className="flex gap-2 mt-3">
        <Button size="sm" variant="secondary" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE))}>
          Prev
        </Button>
        <Button size="sm" variant="secondary"
          disabled={!q.data || offset + PAGE >= q.data.total}
          onClick={() => setOffset(offset + PAGE)}>
          Next
        </Button>
        <span className="text-sm text-muted-foreground self-center">
          {q.data ? `${offset + 1}–${Math.min(offset + PAGE, q.data.total)} of ${q.data.total}` : ''}
        </span>
      </div>
    </Section>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/presentation/routes/Transactions.tsx
git commit -m "feat(ui): /transactions with type filter + pagination"
```

---

### Task 6.12: Route — Settings

**Files:**
- Create: `src/presentation/routes/Settings.tsx`

- [ ] **Step 1: Implement**

`src/presentation/routes/Settings.tsx`:
```tsx
import { Button } from '@/presentation/components/ui/button'
import { Card } from '@/presentation/components/ui/card'
import { Section } from '@/presentation/components/Section'
import { useAppStore } from '@/presentation/hooks/useAppStore'

export function Settings() {
  const theme = useAppStore((s) => s.theme)
  const toggle = useAppStore((s) => s.toggleTheme)
  const ack = useAppStore((s) => s.mainnetBannerAck)

  return (
    <div>
      <Section title="Theme">
        <Card className="p-4 max-w-xl flex items-center gap-3">
          <span>Current: {theme}</span>
          <Button size="sm" onClick={toggle}>Toggle</Button>
        </Card>
      </Section>

      <Section title="Mainnet banner">
        <Card className="p-4 max-w-xl">
          <div className="text-sm">Acknowledged: <b>{ack ? 'yes' : 'no'}</b></div>
          <Button size="sm" variant="secondary" className="mt-2" onClick={() => useAppStore.setState({ mainnetBannerAck: false })}>
            Reset acknowledgement
          </Button>
        </Card>
      </Section>

      <Section title="Local data">
        <Card className="p-4 max-w-xl space-y-2">
          <Button
            size="sm"
            variant="destructive"
            onClick={async () => {
              if (!confirm('Wipe all local data (agents, history, MCP sessions)?')) return
              const dbs = await indexedDB.databases()
              await Promise.all(dbs.map((d) => d.name ? new Promise<void>((resolve) => {
                const req = indexedDB.deleteDatabase(d.name!)
                req.onsuccess = () => resolve()
                req.onerror = () => resolve()
                req.onblocked = () => resolve()
              }) : Promise.resolve()))
              localStorage.clear()
              window.location.reload()
            }}>
            Wipe local data
          </Button>
        </Card>
      </Section>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/presentation/routes/Settings.tsx
git commit -m "feat(ui): /settings route — theme toggle + wipe local data"
```

---

### Task 6.13: Route — Chat (with streaming + model confirm guardrail)

**Files:**
- Create: `src/presentation/routes/Chat.tsx`, `src/presentation/hooks/useChatStream.ts`, `src/presentation/components/ModelPicker.tsx`

- [ ] **Step 1: Define default model constant**

`src/domain/defaults.ts`:
```ts
import { Model } from './branded'

export const DEFAULT_MODEL = Model('gemini-2.5-flash-lite')
```

Commit preemptively:
```bash
git add src/domain/defaults.ts
git commit -m "feat(domain): hardcoded default model gemini-2.5-flash-lite"
```

- [ ] **Step 2: Write useChatStream hook**

`src/presentation/hooks/useChatStream.ts`:
```ts
import { useCallback, useRef, useState } from 'react'
import { useAppContainer } from './useAppContainer'
import { useActiveAgent } from './useActiveAgent'
import type { ChatResponseMeta } from '@/application/ports'
import type { ChatCompletionRequest } from '@/infrastructure/schemas/rest'
import type { AppError } from '@/domain/errors'

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
      setState({ status: 'error', partial, error: (e as AppError) ?? { kind: 'network' } })
    }
  }, [container, agent])

  const stop = useCallback(() => abortRef.current?.abort(), [])

  return { state, start, stop }
}
```

- [ ] **Step 3: Write ModelPicker**

`src/presentation/components/ModelPicker.tsx`:
```tsx
import { useMemo, useState } from 'react'
import { DEFAULT_MODEL } from '@/domain/defaults'
import type { ModelInfo } from '@/infrastructure/schemas/rest'

export function ModelPicker({
  models, value, onChange,
}: {
  models: readonly ModelInfo[]
  value: string
  onChange: (id: string) => void
}) {
  const defaultModel = useMemo(() => models.find((m) => m.id === DEFAULT_MODEL), [models])
  const [confirmPending, setConfirmPending] = useState<string | null>(null)

  const handle = (nextId: string) => {
    if (nextId === value) return
    const next = models.find((m) => m.id === nextId)
    if (!next || !defaultModel) { onChange(nextId); return }
    const nextPrice = next.pricing.inputPer1mCents + next.pricing.outputPer1mCents
    const defaultPrice = defaultModel.pricing.inputPer1mCents + defaultModel.pricing.outputPer1mCents
    if (nextPrice > defaultPrice) {
      setConfirmPending(nextId)
    } else {
      onChange(nextId)
    }
  }

  return (
    <>
      <select
        value={value}
        onChange={(e) => handle(e.target.value)}
        className="h-8 rounded border border-border bg-background px-2 text-sm"
      >
        {models.map((m) => <option key={m.id} value={m.id}>{m.name} ({m.id})</option>)}
      </select>
      {confirmPending ? (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-background border border-border rounded p-4 max-w-md">
            <h3 className="font-semibold mb-2">Confirm more expensive model</h3>
            <p className="text-sm text-muted-foreground mb-4">
              You are switching from <b>{DEFAULT_MODEL}</b> to <b>{confirmPending}</b>, which costs more per token.
              Calls against this model will spend more real money.
            </p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setConfirmPending(null)} className="px-3 py-1 text-sm rounded border border-border">Cancel</button>
              <button
                onClick={() => { onChange(confirmPending); setConfirmPending(null) }}
                className="px-3 py-1 text-sm rounded bg-destructive text-destructive-foreground"
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

- [ ] **Step 4: Write Chat route**

`src/presentation/routes/Chat.tsx`:
```tsx
import { useState } from 'react'
import { Button } from '@/presentation/components/ui/button'
import { Textarea } from '@/presentation/components/ui/textarea'
import { Card } from '@/presentation/components/ui/card'
import { Section } from '@/presentation/components/Section'
import { ErrorView } from '@/presentation/components/ErrorView'
import { CostBadge } from '@/presentation/components/CostBadge'
import { ModelPicker } from '@/presentation/components/ModelPicker'
import { useModels } from '@/presentation/hooks/useModels'
import { useBalance } from '@/presentation/hooks/useBalance'
import { useChatStream } from '@/presentation/hooks/useChatStream'
import { useActiveAgent } from '@/presentation/hooks/useActiveAgent'
import { Link } from 'react-router-dom'
import type { ChatMessage } from '@/domain/chat'
import { DEFAULT_MODEL } from '@/domain/defaults'

export function Chat() {
  const agent = useActiveAgent()
  const balance = useBalance()
  const models = useModels()
  const [model, setModel] = useState<string>(DEFAULT_MODEL)
  const [messages, setMessages] = useState<readonly ChatMessage[]>([])
  const [input, setInput] = useState('')
  const { state, start, stop } = useChatStream()

  if (!agent) return <p className="text-sm text-muted-foreground">Select an agent first.</p>
  const noBalance = balance.data && balance.data.availableUsdCents === 0
  if (noBalance) {
    return (
      <Card className="p-6 max-w-xl">
        <h2 className="font-semibold mb-2">Balance is $0.00</h2>
        <p className="text-sm mb-3">Chat completions cost real money. Deposit funds first.</p>
        <Link to="/wallet"><Button>Go to Wallet</Button></Link>
      </Card>
    )
  }

  const send = () => {
    if (!input.trim()) return
    const next = [...messages, { role: 'user' as const, content: input.trim() }]
    setMessages(next)
    setInput('')
    void start({ model, messages: next, stream: true })
  }

  const onDone = () => {
    if (state.status === 'done') {
      setMessages((m) => [...m, { role: 'assistant', content: state.fullText }])
    }
  }

  return (
    <Section title="Chat">
      <Card className="p-4 mb-3 flex flex-wrap gap-3 items-center">
        <span className="text-sm">Model:</span>
        <ModelPicker
          models={models.data?.models ?? []}
          value={model}
          onChange={setModel}
        />
        <span className="ml-auto">
          <CostBadge meta={state.status === 'done' ? state.meta : undefined} />
        </span>
      </Card>

      <Card className="p-4 mb-3 space-y-2 max-h-[50vh] overflow-auto">
        {messages.map((m, i) => (
          <div key={i} className={`text-sm ${m.role === 'user' ? 'font-medium' : 'text-foreground/90'}`}>
            <div className="text-xs text-muted-foreground">{m.role}</div>
            <div className="whitespace-pre-wrap">{m.content}</div>
          </div>
        ))}
        {state.status === 'streaming' ? (
          <div className="text-sm">
            <div className="text-xs text-muted-foreground">assistant (streaming)</div>
            <div className="whitespace-pre-wrap">{state.partial}</div>
          </div>
        ) : null}
        {state.status === 'error' ? <ErrorView error={state.error} /> : null}
      </Card>

      <Card className="p-3 flex gap-2 items-end">
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type a message. Enter to send, Shift+Enter for newline."
          rows={3}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
          }}
        />
        {state.status === 'streaming' ? (
          <Button variant="destructive" onClick={stop}>Stop</Button>
        ) : (
          <Button onClick={send} disabled={!input.trim()}>Send</Button>
        )}
        {state.status === 'done' ? (
          <Button variant="secondary" onClick={onDone}>Add to history</Button>
        ) : null}
      </Card>
    </Section>
  )
}
```

- [ ] **Step 5: Commit**

```bash
git add src/domain/defaults.ts src/presentation/hooks/useChatStream.ts src/presentation/components/ModelPicker.tsx src/presentation/routes/Chat.tsx
git commit -m "feat(ui): /chat with streaming + model confirm guardrail + balance lock"
```

---

### Task 6.14: Route — Scraper one-shot (6 tools)

**Files:**
- Create: `src/presentation/routes/ScraperOneShot.tsx`, `src/presentation/components/ProxyTierSelector.tsx`

- [ ] **Step 1: Write ProxyTierSelector**

`src/presentation/components/ProxyTierSelector.tsx`:
```tsx
import { PROXY_TIERS, type ProxyTier } from '@/domain/scraper'

export function ProxyTierSelector({
  value, onChange,
}: { value: ProxyTier; onChange: (t: ProxyTier) => void }) {
  return (
    <div className="flex gap-2">
      {PROXY_TIERS.map((t) => (
        <label key={t} className="text-sm flex items-center gap-1">
          <input type="radio" name="proxy_tier" value={t} checked={value === t} onChange={() => onChange(t)} />
          {t}
        </label>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Write ScraperOneShot route**

`src/presentation/routes/ScraperOneShot.tsx`:
```tsx
import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Section } from '@/presentation/components/Section'
import { Card } from '@/presentation/components/ui/card'
import { Button } from '@/presentation/components/ui/button'
import { Input } from '@/presentation/components/ui/input'
import { Textarea } from '@/presentation/components/ui/textarea'
import { ErrorView } from '@/presentation/components/ErrorView'
import { JsonView } from '@/presentation/components/JsonView'
import { ProxyTierSelector } from '@/presentation/components/ProxyTierSelector'
import { useAppContainer } from '@/presentation/hooks/useAppContainer'
import { useActiveAgent } from '@/presentation/hooks/useActiveAgent'
import type { ProxyTier, OneShotTool } from '@/domain/scraper'
import { ONE_SHOT_TOOLS } from '@/domain/scraper'
import type { AppError } from '@/domain/errors'
import type { McpToolResult } from '@/infrastructure/schemas/mcp'

export function ScraperOneShot() {
  const agent = useActiveAgent()
  const container = useAppContainer()
  const [tool, setTool] = useState<OneShotTool>('fetch_html')
  const [url, setUrl] = useState('https://example.com')
  const [tier, setTier] = useState<ProxyTier>('none')
  const [selectorText, setSelectorText] = useState('')
  const [extractMap, setExtractMap] = useState('{\n  "title": "h1"\n}')

  const run = useMutation({
    mutationFn: async (): Promise<McpToolResult> => {
      if (!agent) throw new Error('no agent')
      const params = buildParams(tool, url, tier, selectorText, extractMap)
      const res = await container.useCases.callScraperTool(agent.id, agent.apiKey, tool, params)
      if (!res.ok) throw res.error
      return res.value
    },
  })

  if (!agent) return <p className="text-sm text-muted-foreground">Select an agent first.</p>
  const err = run.error as AppError | null

  return (
    <Section title="Scraper — one-shot tools">
      <Card className="p-4 mb-3 space-y-3">
        <div className="flex gap-2 flex-wrap">
          {ONE_SHOT_TOOLS.map((t) => (
            <Button key={t} size="sm" variant={tool === t ? 'default' : 'secondary'} onClick={() => setTool(t)}>
              {t}
            </Button>
          ))}
        </div>
        <div>
          <label className="text-sm block mb-1">URL</label>
          <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" />
        </div>
        <div>
          <label className="text-sm block mb-1">Proxy tier</label>
          <ProxyTierSelector value={tier} onChange={setTier} />
        </div>
        {(tool === 'markdown' || tool === 'screenshot') ? (
          <div>
            <label className="text-sm block mb-1">Selector (optional)</label>
            <Input value={selectorText} onChange={(e) => setSelectorText(e.target.value)} placeholder="#main" />
          </div>
        ) : null}
        {tool === 'extract' ? (
          <div>
            <label className="text-sm block mb-1">Selectors JSON (name → CSS)</label>
            <Textarea value={extractMap} onChange={(e) => setExtractMap(e.target.value)} rows={4} />
          </div>
        ) : null}
        <Button onClick={() => run.mutate()} disabled={run.isPending}>
          {run.isPending ? 'Running…' : `Run ${tool}`}
        </Button>
      </Card>

      {err ? <ErrorView error={err} /> : null}
      {run.data ? <Preview tool={tool} result={run.data} /> : null}
    </Section>
  )
}

function buildParams(tool: OneShotTool, url: string, tier: ProxyTier, selectorText: string, extractMap: string): unknown {
  switch (tool) {
    case 'fetch_html': return { url, proxy_tier: tier }
    case 'markdown':   return selectorText ? { url, proxy_tier: tier, selector: selectorText } : { url, proxy_tier: tier }
    case 'links':      return { url, proxy_tier: tier }
    case 'screenshot': return selectorText ? { url, proxy_tier: tier, selector: selectorText } : { url, proxy_tier: tier }
    case 'pdf':        return { url, proxy_tier: tier }
    case 'extract': {
      let selectors: Record<string, string>
      try { selectors = JSON.parse(extractMap) as Record<string, string> } catch { selectors = {} }
      return { url, proxy_tier: tier, selectors }
    }
  }
}

function Preview({ tool, result }: { tool: OneShotTool; result: McpToolResult }) {
  const firstItem = result.content[0]
  if (!firstItem) return <JsonView value={result} />
  if (tool === 'screenshot' && firstItem.type === 'image') {
    return <img src={`data:${firstItem.mimeType};base64,${firstItem.data}`} alt="screenshot" className="max-w-full border border-border rounded" />
  }
  if (tool === 'pdf' && firstItem.type === 'resource' && firstItem.resource.blob) {
    return <iframe src={`data:application/pdf;base64,${firstItem.resource.blob}`} className="w-full h-[70vh] border border-border rounded" title="pdf-preview" />
  }
  if (tool === 'markdown' && firstItem.type === 'text') {
    return <pre className="text-sm bg-muted p-3 rounded whitespace-pre-wrap">{firstItem.text}</pre>
  }
  return <JsonView value={result} />
}
```

- [ ] **Step 3: Commit**

```bash
git add src/presentation/components/ProxyTierSelector.tsx src/presentation/routes/ScraperOneShot.tsx
git commit -m "feat(ui): /scraper/one-shot with 6 tools + typed previews"
```

---

### Task 6.15: Route — Scraper sessions

**Files:**
- Create: `src/presentation/routes/ScraperSessions.tsx`, `src/presentation/hooks/useSessions.ts`

- [ ] **Step 1: Write useSessions**

`src/presentation/hooks/useSessions.ts`:
```ts
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAppContainer } from './useAppContainer'
import { useActiveAgent } from './useActiveAgent'
import type { McpSession } from '@/domain/scraper'

export function useSessions() {
  const container = useAppContainer()
  const agent = useActiveAgent()
  const qc = useQueryClient()
  const key = ['agent', agent?.id, 'sessions'] as const
  const query = useQuery({
    queryKey: key,
    enabled: !!agent,
    queryFn: async (): Promise<readonly McpSession[]> => {
      // expose a minimal listSessions through useCases to honor layering:
      return (container.useCases as unknown as { listSessionsFor?: (a: unknown) => Promise<readonly McpSession[]> }).listSessionsFor?.(agent)
        ?? []
    },
  })
  return { query, invalidate: () => qc.invalidateQueries({ queryKey: key }) }
}
```

**Correction:** Expose listing through UseCases properly.

Edit `src/application/useCases.ts` — add to the `UseCases` type:
```ts
listSessionsFor(agent: AgentId): Promise<readonly McpSession[]>
```

And to the implementation in `makeUseCases`:
```ts
async listSessionsFor(agent) { return deps.sessions.listByAgent(agent) },
```

Rewrite `src/presentation/hooks/useSessions.ts`:
```ts
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAppContainer } from './useAppContainer'
import { useActiveAgent } from './useActiveAgent'

export function useSessions() {
  const container = useAppContainer()
  const agent = useActiveAgent()
  const qc = useQueryClient()
  const key = ['agent', agent?.id, 'sessions'] as const
  const query = useQuery({
    queryKey: key,
    enabled: !!agent,
    queryFn: async () => {
      if (!agent) throw new Error('no agent')
      return container.useCases.listSessionsFor(agent.id)
    },
  })
  return { query, invalidate: () => qc.invalidateQueries({ queryKey: key }) }
}
```

- [ ] **Step 2: Write ScraperSessions route**

`src/presentation/routes/ScraperSessions.tsx`:
```tsx
import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Section } from '@/presentation/components/Section'
import { Card } from '@/presentation/components/ui/card'
import { Button } from '@/presentation/components/ui/button'
import { Input } from '@/presentation/components/ui/input'
import { Textarea } from '@/presentation/components/ui/textarea'
import { ErrorView } from '@/presentation/components/ErrorView'
import { JsonView } from '@/presentation/components/JsonView'
import { ProxyTierSelector } from '@/presentation/components/ProxyTierSelector'
import { useAppContainer } from '@/presentation/hooks/useAppContainer'
import { useActiveAgent } from '@/presentation/hooks/useActiveAgent'
import { useSessions } from '@/presentation/hooks/useSessions'
import { SessionId, type AgentId } from '@/domain/branded'
import type { ProxyTier } from '@/domain/scraper'
import type { AppError } from '@/domain/errors'

export function ScraperSessions() {
  const agent = useActiveAgent()
  const container = useAppContainer()
  const { query, invalidate } = useSessions()
  const [tier, setTier] = useState<ProxyTier>('none')
  const [initialUrl, setInitialUrl] = useState('')
  const [actionText, setActionText] = useState<Record<string, string>>({})
  const [lastResult, setLastResult] = useState<unknown>(null)

  const createSession = useMutation({
    mutationFn: async () => {
      if (!agent) throw new Error('no agent')
      const res = await container.useCases.openSession(agent.id, agent.apiKey, tier, initialUrl || undefined)
      if (!res.ok) throw res.error
      await invalidate()
      return res.value
    },
  })

  const closeSession = useMutation({
    mutationFn: async (id: string) => {
      if (!agent) throw new Error('no agent')
      const res = await container.useCases.closeSession(agent.id, agent.apiKey, SessionId(id))
      if (!res.ok) throw res.error
      await invalidate()
    },
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
      setLastResult(res.value)
    },
  })

  const statusCheck = useMutation({
    mutationFn: async (sessionId: string) => {
      if (!agent) throw new Error('no agent')
      const res = await container.useCases.callScraperTool(agent.id, agent.apiKey, 'session_status', { session_id: sessionId })
      if (!res.ok) throw res.error
      setLastResult(res.value)
    },
  })

  if (!agent) return <p className="text-sm text-muted-foreground">Select an agent first.</p>

  const createErr = createSession.error as AppError | null
  const execErr = execAction.error as AppError | null

  return (
    <Section title="Scraper — sessions">
      <Card className="p-4 mb-3 space-y-3 max-w-xl">
        <div>
          <label className="text-sm block mb-1">Proxy tier</label>
          <ProxyTierSelector value={tier} onChange={setTier} />
        </div>
        <div>
          <label className="text-sm block mb-1">Initial URL (optional)</label>
          <Input value={initialUrl} onChange={(e) => setInitialUrl(e.target.value)} placeholder="https://…" />
        </div>
        <Button onClick={() => createSession.mutate()} disabled={createSession.isPending}>
          {createSession.isPending ? 'Creating…' : 'Create session'}
        </Button>
        {createErr ? <ErrorView error={createErr} /> : null}
      </Card>

      <div className="space-y-3">
        {(query.data ?? []).map((s) => (
          <Card key={s.id} className="p-4">
            <div className="flex justify-between items-start mb-2">
              <div>
                <div className="font-mono text-sm">{s.id}</div>
                <div className="text-xs text-muted-foreground">
                  {s.proxyTier} • created {new Date(s.createdAt).toLocaleString()}
                </div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="secondary" onClick={() => statusCheck.mutate(s.id)}>Status</Button>
                <Button size="sm" variant="destructive" onClick={() => closeSession.mutate(s.id)}>Close</Button>
              </div>
            </div>
            <div>
              <label className="text-sm block mb-1">Action JSON</label>
              <Textarea
                rows={4}
                value={actionText[s.id] ?? '{\n  "type": "goto",\n  "url": "https://example.com"\n}'}
                onChange={(e) => setActionText((m) => ({ ...m, [s.id]: e.target.value }))}
              />
              <Button
                size="sm"
                className="mt-2"
                onClick={() => execAction.mutate({ sessionId: s.id, action: actionText[s.id] ?? '' })}
                disabled={execAction.isPending}
              >
                Execute
              </Button>
            </div>
          </Card>
        ))}
        {(query.data ?? []).length === 0 ? <p className="text-sm text-muted-foreground">No sessions.</p> : null}
      </div>

      {execErr ? <div className="mt-3"><ErrorView error={execErr} /></div> : null}
      {lastResult !== null ? <div className="mt-3"><JsonView value={lastResult} /></div> : null}
    </Section>
  )
}

// avoid unused import
void (null as unknown as AgentId)
```

- [ ] **Step 3: Commit**

```bash
git add src/application/useCases.ts src/presentation/hooks/useSessions.ts src/presentation/routes/ScraperSessions.tsx
git commit -m "feat(ui): /scraper/sessions — create, exec, close, status"
```

---

**Phase 6 complete.** All 10 routes wired. `npm run dev` renders the full app.

---

## Phase 7 — Documentation, lint, and final verification

### Task 7.1: ESLint config with no-floating-promises

**Files:**
- Create: `eslint.config.js`

- [ ] **Step 1: Write config**

`eslint.config.js`:
```js
import tsParser from '@typescript-eslint/parser'
import tsPlugin from '@typescript-eslint/eslint-plugin'
import reactHooks from 'eslint-plugin-react-hooks'

export default [
  {
    files: ['src/**/*.{ts,tsx}', 'tests/**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: './tsconfig.json',
        ecmaVersion: 2022,
        sourceType: 'module',
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
      'react-hooks': reactHooks,
    },
    rules: {
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
  { ignores: ['dist/**', 'node_modules/**', 'src/presentation/components/ui/**'] },
]
```

- [ ] **Step 2: Add lint script to package.json**

Add to `"scripts"`:
```json
"lint": "eslint src tests"
```

- [ ] **Step 3: Run lint and fix any violations**

Run: `npm run lint`

Expected: May report violations in the code written so far (e.g. missing `await`). Fix each — typical fixes:
- Add `void` prefix to intentionally-unawaited promises in event handlers.
- Add `await` to floating promises.

- [ ] **Step 4: Commit**

```bash
git add eslint.config.js package.json src/
git commit -m "chore: ESLint config with no-floating-promises + react-hooks"
```

---

### Task 7.2: README.md

**Files:**
- Create: `README.md`

- [ ] **Step 1: Write README**

```markdown
# llm4agents dashboard

Local interactive dashboard to test every endpoint of the [llm4agents](https://api.llm4agents.com) API — 7 REST endpoints plus 10 MCP scraper tools — with multi-agent isolation and mainnet-safe guardrails.

## Requirements

- Node 20+
- Access to `api.llm4agents.com` and `mcp.llm4agents.com`
- (Optional) `/etc/hosts` entry so teammates can reach this machine as `skywalker`

## Quick start

```bash
npm install
npm run dev
```

Open `http://localhost:4201` (or `http://skywalker:4201` from a teammate's laptop once their `/etc/hosts` is configured).

## Workflow

1. Go to `/agents` → register your first agent → the API key is persisted in this browser's IndexedDB.
2. Go to `/wallet` → "Generate wallet" → deposit USDC/USDT on Solana or Polygon.
3. Refresh balance manually → when credited, `/chat` unlocks.
4. Default model is `gemini-2.5-flash-lite`. Switching to a more expensive model prompts a confirmation.

## Scripts

- `npm run dev` — Vite dev server, port 4201, exposed on the network.
- `npm run build` — static build (`dist/`).
- `npm run preview` — serve the build on 4201.
- `npm test` — Vitest watcher.
- `npm run test:ci` — Vitest single run.
- `npm run test:coverage` — coverage report.
- `npm run typecheck` — `tsc --noEmit`.
- `npm run lint` — ESLint.

## Mainnet warning

This dashboard is wired to **production mainnet**. See `docs/mainnet-warning.md`.

## Architecture

See `docs/superpowers/specs/2026-04-17-llm4agents-dashboard-design.md`.
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: README with quick start and mainnet warning"
```

---

### Task 7.3: Mainnet warning + Manual QA checklist

**Files:**
- Create: `docs/mainnet-warning.md`, `docs/manual-qa.md`

- [ ] **Step 1: Write mainnet-warning.md**

```markdown
# Mainnet Warning — Testing Procedure

This dashboard talks to the **production** llm4agents API against **mainnet** wallets.

## Before testing

1. Start the dashboard (`npm run dev`) and register an agent in `/agents`.
2. In `/wallet`, generate a deposit wallet (Solana or Polygon, USDC or USDT).
3. Make a **real deposit** of a small amount (e.g., $5) to the generated address.
4. Return to `/wallet` and hit "Refresh" until the balance is credited.
5. Only then is `/chat` enabled.

## Default guardrails

- Chat completions default to **gemini-2.5-flash-lite** (cheapest).
- Selecting a more expensive model pops a confirmation dialog.
- No automatic retries for chat completions — manual only.
- No background polling on paid endpoints.

## Do NOT

- Leave automatic retries / polling enabled anywhere in the code.
- Ship changes that default to a more expensive model.
- Commit `.env.local` (already gitignored).
- Share your API key; it is stored in this browser only.
```

- [ ] **Step 2: Write manual-qa.md**

```markdown
# Manual QA Checklist

Run before each release or major change. Each check = one human action.

## Setup

- [ ] Fresh browser profile (or `/settings` → "Wipe local data").
- [ ] `.env.local` points at staging or real API.
- [ ] `npm run dev` boots without errors on port 4201.

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
```

- [ ] **Step 3: Commit**

```bash
git add docs/mainnet-warning.md docs/manual-qa.md
git commit -m "docs: mainnet warning + manual QA checklist"
```

---

### Task 7.4: Final verification

**Files:** none — verification only.

- [ ] **Step 1: Typecheck passes clean**

Run: `npm run typecheck`
Expected: zero errors.

- [ ] **Step 2: All tests pass**

Run: `npm run test:ci`
Expected: all suites green.

- [ ] **Step 3: Coverage meets threshold**

Run: `npm run test:coverage`
Expected: ≥80% lines in `src/domain` and `src/application`.

- [ ] **Step 4: Lint clean**

Run: `npm run lint`
Expected: zero errors.

- [ ] **Step 5: Dev build boots**

Run: `npm run dev` — open `http://localhost:4201` — expect the AppShell with the sidebar and mainnet banner. Close with `q`.

- [ ] **Step 6: Production build**

Run: `npm run build && npm run preview` — open `http://localhost:4201` — confirm same behavior. Close.

- [ ] **Step 7: Manual QA walk-through (first pass)**

Run through `docs/manual-qa.md`. Ticks are OK; unchecked items become follow-up tasks.

- [ ] **Step 8: Tag v0.1**

```bash
git tag -a v0.1 -m "llm4agents dashboard v0.1 — all endpoints covered"
```

---

## Done.

At this point:
- Every REST endpoint and MCP tool has a typed UI.
- Multi-agent isolation works (per-browser IndexedDB).
- Mainnet guardrails are in place (default model, no auto-retry on chat, confirmation dialog, balance-0 lock).
- Unit tests cover domain + application + infrastructure (schemas, clients, repos).
- Manual QA checklist is ready for real-money testing once the first deposit clears.
