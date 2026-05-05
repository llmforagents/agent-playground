# Contexto del proyecto — `playground-llm4agents`

> Documento autocontenido para arrancar una sesión nueva (Claude Code web, otra IDE, otro humano). Pegalo o leelo de una pasada y vas a saber **qué es el proyecto, cómo está, cómo trabajarlo, qué evitar**.
>
> **Última actualización:** 2026-05-05 · **Branch base:** `main` · **SDK:** `@llmforagents/sdk@2.3.2` · **Estado:** 100% verde en local y producción.

---

## 1. Qué es esto

Dashboard React/TypeScript local que ejerce **toda la API y los servidores MCP de [llm4agents.com](https://llm4agents.com)**. Es un playground para devs: registrar un agente, ver el saldo, mandar chat completions con/sin tools, generar/editar/analizar imágenes, scrapear, buscar en Google, ver transacciones, todo en una UI bilingüe (EN/ES) con guardrails contra gastar de más en mainnet.

- **Backend REST:** `https://api.llm4agents.com` (8 endpoints REST)
- **Backend MCP:** `https://mcp.llm4agents.com/mcp` (17 tools: scraper, search, image)
- **Producción del dashboard:** `https://playground.llm4agents.com/` (build estático en Cloudflare Pages)
- **Dev local:** `http://localhost:4301` (Vite)
- **Preview local:** `http://localhost:4310`

El proyecto **mueve dinero real on-chain** (Solana/Polygon, USDC/USDT). El default es `gemini-2.5-flash-lite` ($0.12/$0.48 por 1M tokens) precisamente para que cualquier prueba inadvertida cueste centavos. Hay un banner de advertencia mainnet al primer login.

---

## 2. Stack

**Runtime**
- React `19.2.4` + react-dom + react-router-dom `7.14.1`
- Vite `8.0.4` (+ plugin React `6.0.1`), TypeScript `~6.0.2` con `strict + noUncheckedIndexedAccess + exactOptionalPropertyTypes`
- TailwindCSS `4.2.2` + shadcn `4.3.0` + radix-ui `1.4.3` + lucide-react
- Estado: **Zustand `5.0.12`** (persistido en localStorage) + **TanStack Query `5.99.0`**
- Persistencia local: **Dexie `4.4.2`** (IndexedDB, db `llm4agents-dashboard` v20, **no** `llm4agents`)
- Validación: **Zod `4.3.6`** **solo en boundaries** (env, REST responses, MCP responses) — NO en domain
- SDK del backend: **`@llmforagents/sdk@2.3.2`**
- UI extra: sonner (toasts), next-themes (light/dark), `@monaco-editor/react`

**Dev**
- Vitest `4.1.4` + jsdom + @testing-library + MSW `2.13.4` + fake-indexeddb
- ESLint `9.39.4` con `no-floating-promises` y `no-explicit-any` como **error**
- Despliegue: Cloudflare Pages (`wrangler.toml`)

---

## 3. Arquitectura — Clean / Ports & Adapters

```
src/
├── domain/         (12 archivos) — tipos puros, sin deps de infra
├── application/    (4 archivos)  — casos de uso, orquestación
├── infrastructure/ (13 archivos) — REST, MCP, SDK, Dexie, SSE, Zod
├── presentation/   (~66 archivos) — React, hooks, layout, rutas
├── composition/    (2 archivos)  — composition root + env (Zod)
├── lib/            (4 archivos)  — utilidades transversales
├── app.tsx         — definición de Routes
├── main.tsx        — bootstrap
└── index.css       — Tailwind v4
```

**Inyección de dependencias en `src/composition/root.ts`** (`composeApp(env): AppContainer`): instancia `RestApiClient`, `McpClient`, los 4 `Dexie*Repo`, los pasa a `makeUseCases(...)`, y expone `AppContainer` consumido vía Context (`useAppContainer`).

### Capa Domain (`src/domain/`)
- **Branded types** para identidad: `AgentId`, `ApiKey`, `SessionId`, `UsdCents`, `RequestId`, `ChainId`, `WalletAddress`, `Model` — todos con función-constructora que valida (no Zod).
- **Discriminated unions** para errores (`RestError`, `McpError` → `AppError`), pasos agénticos (`AgenticStep`), eventos del loop (`AgenticEvent`).
- `Result<T,E>` con `Ok()/Err()/assertNever()` en `result.ts`.
- `chatTools.ts` — catálogo `CHAT_TOOLS` con las 9 tools expuestas al chat (3 search + 4 scraper-texto + 3 image). El resto (screenshot/pdf/sessions/batch/`/v1/tx/send`) está deliberadamente **fuera** del chat.
- `i18n.ts` — diccionarios EN/ES con ~420 claves, soporte para reasoning models.
- `defaults.ts` — `DEFAULT_MODEL = 'google/gemini-2.5-flash-lite'`.

### Capa Application (`src/application/`)
- `ports.ts` — interfaces de los puertos (`RestApiPort`, `McpPort`, repos).
- `useCases.ts` — `makeUseCases(deps)` devuelve **19 casos de uso** envueltos con `withHistory()` para tracking automático.
- `runAgenticChat.ts` — **el corazón agentic.** Generador `async function*` que emite `AgenticEvent`. Configura el SDK con `maxToolRounds: 3` (default), `enablePromptToolFallback: true`, y un `BASE_SYSTEM_PROMPT` (líneas 27-43) que instruye al modelo sobre los guardrails.
- `withHistory.ts` — decorador genérico que captura timestamp/duration/cost y persiste en `HistoryRepo`.

### Capa Infrastructure (`src/infrastructure/`)
- `sdk/sdkClient.ts` — factory que instancia `LLM4AgentsClient`. Cada llamada arma un cliente fresco (multi-agent, sin caché).
- `sdk/translateSdkError.ts` — mapea `LLM4AgentsError.code` a `RestError` discriminado.
- `rest/RestApiClient.ts` — HTTP REST. **Rutas que bypasan el SDK porque éste no las cubre**: `/healthz` (sin auth), `/api/v1/agents/register` (sin auth — el agente aún no existe), `/api/v1/playground/claim` (Turnstile + GitHub OAuth).
- `mcp/McpClient.ts` — JSON-RPC 2.0 hacia `mcp.llm4agents.com/mcp`. Hace **mucha normalización** post-hoc en `normalizeMcpResult` (líneas 107-175) para tools que envuelven sus resultados con esquemas distintos (alias `mime_type→mimeType`, promueve imágenes anidadas, des-envuelve JSON-en-text para `imageBase64`/`pngBase64`/`pdfBase64`/`analyze_image{text,costCents}`).
- `stream/sseParser.ts` — generator async que parsea SSE; deriva token meta del chunk `usage` cuando los headers HTTP del proxy no llegaron antes (commit `204cada`).
- `persistence/db.ts` + 4 repos — Dexie v2 con tablas `agents`, `history`, `sessions`, `wallets`. **Nombre real de la DB: `llm4agents-dashboard`, version 20**.
- `schemas/rest.ts` + `schemas/mcp.ts` — Zod schemas para todas las boundaries HTTP.

### Capa Presentation (`src/presentation/`)
- `app.tsx` define las rutas (no hay router separado, todo inline en `<App>`).
- **13 rutas:** `/`, `/agents`, `/wallet`, `/transactions`, `/chat`, `/models`, `/scraper/one-shot`, `/scraper/sessions`, `/search`, `/images`, `/settings`, `/guide`, `/oauth/github/callback`. Más `/health → /settings` redirect y `* → /`.
- `presentation/layout/` — `Providers` (BrowserRouter + QueryClient + AppContainer Context), `AppShell` (Sidebar/Topbar/Toaster), `MainnetBanner`, `ThemeEffect`.
- `presentation/hooks/` — 13 hooks: `useT`, `useAppStore`, `useChatStore`, `useAppContainer`, `useActiveAgent`, `useAgents`, `useChatStream`, `useAgenticChat`, `useBalance`, `useModels`, `useTransactions`, `useSessions`, `useWallets`, `useSyncActiveAgent`.
- **Stores Zustand persistidos en localStorage:**
  - `useAppStore` (clave `llm4agents-ui`): `activeAgentId`, `theme`, `locale`, `mainnetBannerAck`.
  - `useChatStore` (clave `llm4agents-chats`): `byAgent: Record<AgentId, { entries, model, toolsOn, effort }>` con `makeSafeStorage()` que maneja `QuotaExceededError`.
- `presentation/components/ui/` — 17 componentes shadcn (no se modifican, ESLint los ignora).

---

## 4. Comandos del proyecto

```bash
npm install               # primera vez
npm run dev               # Vite dev server :4301
npm run preview           # serve dist/ en :4310
npm run build             # tsc --noEmit && vite build
npm run typecheck         # tsc --noEmit
npm run test              # vitest watch
npm run test:ci           # vitest run (debe dar 99/99)
npm run test:coverage     # cobertura, umbrales 80% líneas/funciones/statements + 75% branches sobre domain/application/infrastructure
npm run lint              # eslint src tests
```

**Despliegue prod:** `scripts/deploy-cloudflare.sh` corre typecheck + tests + build + `wrangler pages deploy dist/`.

**Servicio local en `:4310`:** systemd user service `llm4agents-dashboard` (ver `scripts/dashboard-service.sh status|logs|start|stop|restart|rebuild`).

---

## 5. Variables de entorno

`.env.example`:
```
VITE_API_BASE=https://api.llm4agents.com
VITE_MCP_BASE=https://mcp.llm4agents.com
# Opcionales — solo activan el botón "Claim test USD"
VITE_GITHUB_CLIENT_ID=
VITE_TURNSTILE_SITE_KEY=
```

`composition/env.ts` valida con Zod: si las dos `VITE_*` core faltan, la app falla al boot.

`vite.config.ts` proxy en dev: `/proxy/api → VITE_API_BASE`, `/proxy/mcp → VITE_MCP_BASE/mcp`. Esto evita CORS en local. **En prod no hay proxy** — el SDK postea directo, por eso `composition/root.ts:44-47` normaliza `mcpUrl` para garantizar que termine en `/mcp` (commit `264fff6`).

---

## 6. Estado actual de bugs y features

### ✅ Resueltos

| Bug | Origen | Cómo se resolvió |
|---|---|---|
| **Bug 1** — `Tool message must have either name or tool_call_id` (multi-round) | Backend `api.llm4agents.com` (no SDK como se sospechó al inicio) | El SDK 2.3.2 ya envía `tool_call_id`+`name` correctamente; el backend dejó de descartarlos al adaptar a OpenRouter. Confirmado en local + prod 2026-05-04 con `gemini-2.5-flash-lite` y `claude-haiku-4.5` |
| **Bug 2** — `analyze_image` Vision API empty response | Backend Vision provider | Desapareció. Funciona con `picsum.photos`, etc. |
| **BUG-08** — `assistant.content: null` en 2da ronda agentic | SDK 2.3.0 | SDK 2.3.2 corrige |
| **Anti-fabricación de URLs** en agentic | Frontend prompt | Commit `5f225a1` — system prompt prohíbe inventar URLs |
| **mcpUrl normalization** | Frontend | Commit `264fff6` — siempre termina en `/mcp` |
| **SSE token meta fallback** | Frontend | Commit `204cada` — usa chunk `usage` cuando los headers no llegaron antes |

### 🟡 Pendientes (no bloqueantes)

| Issue | Severidad | Workaround |
|---|---|---|
| **Bug 3** — `edit_image`/`analyze_image` 403 con Wikimedia/`img.magnific.com` | Backend image fetcher (sin User-Agent realista) | Usar `picsum.photos`, `raw.githubusercontent.com`, `i.imgur.com`, o `data:image/...;base64,...` URIs |
| Mensaje genérico `Chat.tsx:142-152` "Error: la respuesta no se pudo completar" | UX | Cuando `error.kind !== 'unknown'`, debería mostrar `error.body` |
| Falta UI **"Importar agente existente"** en `/agents` | UX | DevTools / Playwright: inyectar en `IndexedDB > llm4agents-dashboard > agents` + setear `localStorage.llm4agents-ui.state.activeAgentId` |
| `/wallet Guardadas: 0` post-import | UX | Botón "Sincronizar wallets desde backend" cubriría el gap |

### Auditorías E2E recientes
- **2026-05-04 local** — 16/16 escenarios verde (`docs/playwright-test-report-2026-05-01.md` y la siguiente, no formalizada). Bug 1 confirmado resuelto.
- **2026-05-04 prod** — 16/16 escenarios verde (`docs/playwright-test-report-2026-05-04-prod.md`). Mismo agente reutilizado por inyección Dexie cross-dominio.

---

## 7. Convenciones de código (importantes)

1. **Branded types con función-constructora** para todos los IDs (no Zod en domain). Ej:
   ```ts
   const id = AgentId('uuid-string')  // valida formato UUID y devuelve AgentId
   ```
2. **Discriminated unions** para errores y eventos. Siempre con `kind: '...'` como discriminante.
3. **`Result<T, E>`** en lugar de excepciones para errores esperados (REST/MCP).
4. **Zod solo en boundaries**: `composition/env.ts`, `infrastructure/schemas/rest.ts`, `infrastructure/schemas/mcp.ts`. Nunca en `domain/` ni `application/`.
5. **Inmutabilidad**: structs `Readonly<{...}>`, arrays `readonly T[]`, props `Readonly<{...}>`.
6. **Reglas TS estrictas** ya activas (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`).
7. **ESLint**: `no-floating-promises` es **error**; `no-explicit-any` es **error**. Si una promesa no se await, prefijala con `void`.
8. **i18n**: nada hardcodeado en JSX. Usar `useT()` y agregar la key en `domain/i18n.ts` (EN + ES).
9. **Persistencia**: la API key del agente vive solo en IndexedDB local. **No commitear claves**, no se deben loggear.

---

## 8. Guardrails de costo (defensa en profundidad)

| # | Guardrail | Dónde |
|---|---|---|
| 1 | `maxToolRounds: 3` (cap duro) | `runAgenticChat.ts:25,99` |
| 2 | Same-args dedup (instrucción al modelo + cache del SDK) | `runAgenticChat.ts:42` y SDK |
| 3 | Image short-circuit (no chat.completion de síntesis tras image) | `runAgenticChat.ts:40` (prompt) + UI |
| 4 | Confirmación al cambiar a modelo caro | `ModelPicker` + `i18n.ts models.confirmExpensive` |
| 5 | NO auto-retry en `unauthorized`/`insufficient_balance`/`validation` | `Providers.tsx` QueryClient retry |
| 6 | `/v1/tx/send` deliberadamente fuera del chat | `domain/chatTools.ts` |
| 7 | Multi-agent isolation (cada agente tiene su API key/saldo/historial) | Domain + IndexedDB por agentId |

**Estimación de costos por escenario en `gemini-2.5-flash-lite`:**
- Chat simple (sin tools): ~$0.0005-$0.002
- Chat con `google_search` 1 round: ~$0.005-$0.012
- `generate_image`: $0.01 (≤1.5MP) / $0.02 (>1.5MP)
- `edit_image`: $0.02
- `analyze_image`: $0.006

Una auditoría E2E completa de los 16 escenarios cuesta ~$0.13.

---

## 9. Testing

- **`npm run test:ci` debe dar `99 passed (99) / 17 files`** (estado actual). Si sale rojo, hay regresión.
- Tests por capa: 4 domain, 4 application, 8 infrastructure, 1 presentation.
- Setup: `tests/setup.ts` carga `@testing-library/jest-dom/vitest` + `fake-indexeddb/auto`.
- MSW está disponible (`msw@^2.13.4`) pero no en setup global — se monta puntualmente.
- **Coverage thresholds** (vitest.config.ts): 80% lines/funcs/statements y 75% branches sobre `domain/`, `application/`, `infrastructure/` (no presentation).

---

## 10. Lo que NO se debe hacer

1. **No agregar Zod al domain o application** — boundary-only.
2. **No agregar tools al chat sin pensar costo + UX**. La lista en `chatTools.ts` está pensada: las omitidas son sessions stateful, screenshot/pdf con payloads enormes, batch search, y `/v1/tx/send` (mueve dinero on-chain — siempre requiere intención explícita).
3. **No usar URLs de Wikimedia o `img.magnific.com` (Akamai)** en `analyze_image`/`edit_image`. El backend image fetcher no manda UA realista. Usar `picsum.photos`, GitHub raw, imgur, o data URIs.
4. **No commitear API keys** ni datos del IndexedDB.
5. **No subir `maxToolRounds`** sin discutirlo. Cada round es un chat.completion adicional.
6. **No skipear hooks de pre-commit con `--no-verify`**.
7. **No tocar `src/presentation/components/ui/**`** — son componentes shadcn vanilla, ESLint los ignora.
8. **No remover el banner mainnet ni los confirms de modelos caros** — son la última línea de defensa contra gastar de más.

---

## 11. Tareas comunes y dónde tocar

| Tarea | Archivos relevantes |
|---|---|
| Agregar una tool nueva al chat | `domain/chatTools.ts` (CHAT_TOOLS array) + posible schema en `infrastructure/schemas/mcp.ts` |
| Agregar un nuevo string i18n | `domain/i18n.ts` (ambos diccionarios EN/ES) |
| Agregar una ruta nueva | `app.tsx` + `presentation/routes/` + sidebar en `presentation/layout/Sidebar.tsx` |
| Cambiar el modelo default | `domain/defaults.ts` |
| Agregar un endpoint REST nuevo | `application/ports.ts` (interface) → `infrastructure/rest/RestApiClient.ts` (impl) → `application/useCases.ts` (use case) → `presentation/hooks/` (hook con TanStack Query) |
| Cambiar el system prompt agentic | `runAgenticChat.ts:27-43` (`BASE_SYSTEM_PROMPT`) |
| Tocar el schema de IndexedDB | `infrastructure/persistence/db.ts` — bumpear version y agregar migration handler |
| Agregar un test | `tests/<capa>/<archivo>.test.ts(x)` siguiendo la estructura existente |

---

## 12. Persistencia local (Dexie)

DB: `llm4agents-dashboard` (version 20)

Tablas:
- `agents` PK `id` — `{ id: AgentId, name, apiKey, createdAt, color }`
- `history` PK `id` — `{ id, agentId, timestamp, kind: 'rest'|'mcp', endpoint, request, response, costCents?, durationMs }`
- `sessions` PK `sessionKey` (composite `agentId::sessionId`) — sesiones scraper
- `wallets` PK `walletKey` — referencias UX a wallets generadas (la fuente de verdad es el backend)

**Movilidad cross-dominio del agente:**
```js
// Extraer (en cualquier dominio donde ya tenés el agente):
indexedDB.open('llm4agents-dashboard') → tx('agents','readonly').getAll()

// Inyectar (en otro dominio para reusar el mismo agente):
indexedDB.open('llm4agents-dashboard') → tx('agents','readwrite').put(agent)
localStorage.setItem('llm4agents-ui', JSON.stringify({ state: { activeAgentId: agent.id } }))
// Recargar.
```

---

## 13. Documentación complementaria

| Doc | Contenido |
|---|---|
| `README.md` | Quick start + tabla de rutas |
| `docs/superpowers/specs/2026-04-17-llm4agents-dashboard-design.md` | Spec arquitectónica original |
| `docs/chat-tools.md` | 9 tools del chat vs 7 excluidas con razones |
| `docs/mainnet-warning.md` | Política mainnet + cero retries automáticos |
| `docs/testing-guide.md` | 10 prompts manuales para QA |
| `docs/external-bugs-blocking-100-percent.md` | Histórico de bugs externos (Bug 1/2/3) — actualizado a 2026-05-02 con SDK 2.3.2 |
| `docs/sdk-migration-test-report.md` | Migración a SDK 2.3.0 (BUG-08 documentado) |
| `docs/playwright-test-report-2026-05-01.md` | Auditoría E2E 26/31 contra SDK 2.3.1 (histórico) |
| `docs/playwright-test-report-2026-05-04-prod.md` | Auditoría 16/16 contra producción (más reciente) |
| `docs/sdk-migration-blockers-v2.1.0.md`, `sdk-migration-analysis.md` | Histórico de migraciones previas |
| `docs/manual-qa.md`, `deploy-cloudflare.md` | Procedimientos operativos |

---

## 14. Estado de git al cierre de esta sesión

- Branch base: `main`
- Última auditoría sin commitear: `docs/playwright-test-report-2026-05-04-prod.md` (untracked)
- Sin cambios staged
- `main` está N commits adelantada de `origin/main` (no se hizo `git push`)

Si querés alinear remoto: `git push origin main` (con tu auth de GitLab/GitHub).

---

## 15. Cosas a confirmar antes de tocar código

1. **Saldo del agente:** correr el dev server, abrir `/`, anotar saldo. Cualquier prueba con el chat lo gasta.
2. **Tests verdes:** `npm run test:ci` debe dar 99/99.
3. **Typecheck limpio:** `npm run typecheck` sin output.
4. **Healthz OK:** ir a `/settings` → "Ping /healthz" → debe decir `ok`.

Si algo de esto está rojo, **no implementes features nuevas**: arreglá la regresión primero.

---

> **Tip final:** este proyecto está pensado como sandbox de QA del backend de llm4agents. Cuando haya un bug, el primer reflejo debería ser separar **frontend vs SDK vs backend** capturando el body del POST (con Playwright network interception sirve mucho), antes de empezar a parchar.
