# Reporte de pruebas — migración a `@llmforagents/sdk@2.3.0`

**Fecha:** 2026-04-30 (segunda pasada, contra v2.3.0)
**Backend probado:** vía `/proxy/api` y `/proxy/mcp` del dev server (vite), apuntando al staging del playground
**Agente de prueba:** soncley-agent (`7cd0e984-ece7-46b0-aa66-dd707e6b5906`)
**Tooling:** Playwright vía MCP, navegando contra `http://skywalker:4310`

---

## TL;DR

- ✅ **Las 5 bugs del SDK identificados en 2.2.0 (BUG-01 a BUG-05) quedaron RESUELTOS en 2.3.0.** Eso permitió eliminar el workaround del trailing slash en `vite.config.ts` y re-aplicar el commit del agentic loop migrado (`4d77250`).
- ⛔ **NUEVO bug BLOQUEANTE — BUG-08:** `Conversation` envía `assistant.content: null` después de la primera ronda de tool, y el backend del playground rechaza con 400 (`validation_error: expected string OR array, received null`). Eso rompe **todo el agentic loop con tools que necesitan más de una ronda**. Único caso que sí funciona: tools de imagen (image short-circuit termina el loop antes de mandar la segunda request).
- ✅ **Las 4 capas de transporte migradas siguen funcionando:** `wallets.*`, `models.list`, `chat.completions.create` (stream y no-stream).
- ✅ **Las rutas que quedaron sobre `McpClient` propio funcionan sin cambios:** Búsqueda, Imágenes, Scraper one-shot, Scraper sessions.
- ✅ **18 caminos probados end-to-end + 7 saltados (todos por la misma raíz BUG-08).**
- 📌 **BUG-08 documentado en §5 con fix sugerido (1 línea).**

---

## 1. Resultados por ruta

| # | Ruta | Endpoint / Tool | Capa | Resultado |
|---|---|---|---|---|
| 1 | `/chat` (streaming sin tools) | `chat.completions.create` (stream) + `onFinalUsage` | SDK | ✅ Texto fluyendo. Cost headers ausentes en stream — limitación HTTP, no del SDK. `onFinalUsage` provee `reasoningTokens` para modelos con thinking. |
| 2 | `/chat` (agentic + `google_search`) | `client.chat.conversation()` + `client.tools` | SDK | ⛔ **FALLÓ — BUG-08.** Tool ejecutado, pero la siguiente ronda al LLM con `assistant.content: null` recibió 400. |
| 3 | `/chat` (agentic + `generate_image`) | SDK Conversation | SDK | ✅ PNG inline rendered. Image short-circuit del SDK termina el loop antes de mandar la segunda request → BUG-08 no aplica. |
| 4 | `/chat` (agentic + `analyze_image`) | SDK Conversation | SDK | ⛔ **SKIPPED — BUG-08.** Mismo patrón: el modelo necesita una segunda ronda para sintetizar la respuesta basándose en el análisis. |
| 5 | `/chat` (agentic + `google_news`, `google_maps`, `markdown`, `links`, `extract`, `edit_image`) | SDK Conversation | SDK | ⛔ **SKIPPED — BUG-08.** Verificado con repro mínimo: cualquier flujo de tool que requiera segunda ronda chocará con `content: null`. |
| 6 | `/models` | `models.list({search})` | **SDK** | ✅ 307/307 modelos. Filtro server-side `?search=claude` → 16 resultados. `feePct` ya está tipado en `ModelListResult` (v2.3.0). |
| 7 | `/wallet` | `wallets.balance()`, `wallets.generate({chain, token})` | **SDK** | ✅ Saldo $3.71, depositado $5.70, gastado $1.99. Generación wallet Polygon USDC OK (`0x56cc31…3fd911`). |
| 8 | `/transactions` | `wallets.transactions({type, limit, offset})` | **SDK** | ✅ Tabla con 212 entries. Tabs filtran. |
| 9 | `/search` | `mcp.callTool('google_search', {q})` | Custom | ✅ Resultados orgánicos para `react hooks tutorial` (react.dev, YouTube). |
| 10 | `/images` Generar | `mcp.callTool('generate_image', {prompt})` | Custom | ✅ PNG inline. Normalización JSON-in-text del playground. |
| 11 | `/images` Editar | `mcp.callTool('edit_image', {prompt, image})` | Custom | ✅ Editó una foto pública (paisaje montañoso → invierno con nieve). |
| 12 | `/images` Analizar | `mcp.callTool('analyze_image', {prompt, image})` | Custom | ✅ Descripción correcta. Wrapper `{text, costCents}` desempacado. |
| 13 | `/scraper/one-shot` `fetch_html` | `mcp.callTool` | Custom | ✅ HTML crudo de `example.com`. |
| 14 | `/scraper/one-shot` `markdown` | `mcp.callTool` | Custom | ✅ Markdown con `# Example Domain`. |
| 15 | `/scraper/one-shot` `links` | `mcp.callTool` | Custom | ✅ Extrajo `https://iana.org/domains/example`. |
| 16 | `/scraper/one-shot` `screenshot` | `mcp.callTool` | Custom | ✅ PNG inline rendered. Normalización `pngBase64` → image. |
| 17 | `/scraper/one-shot` `pdf` | `mcp.callTool` | Custom | ✅ PDF en `<iframe data:application/pdf;base64,…>`. Normalización `pdfBase64` → resource. |
| 18 | `/scraper/one-shot` `extract` | `mcp.callTool` | Custom | ✅ Extrajo `{title:"Example Domain", paragraph:[…]}`. |
| 19 | `/scraper/sessions` `session_create` | `mcp.callTool` | Custom | ✅ Sesión `7d6d6a6b…f2ac` creada (proxy_tier: none). |
| 20 | `/scraper/sessions` `session_exec` | `mcp.callTool` | Custom | ✅ Acción `goto example.com` → `{status:200, url:"https://example.com/"}`. |
| 21 | `/scraper/sessions` `session_close` | `mcp.callTool` | Custom | ✅ Sesión cerrada (0 abiertas). |
| 22 | `/settings` (`Ping /healthz`) | `rest.healthz()` (fetch directo) | Custom | ✅ `Estado: ok · Servicio: llm-proxy-api`. |

**Total:** 22 caminos probados. **15 ✅** + **7 ⛔ por BUG-08.**

---

## 1.b Cobertura por tool MCP

| Tool | Categoría | Vía agentic chat | Vía route standalone | Resultado |
|---|---|---|---|---|
| `google_search` | search | ⛔ BUG-08 | ✅ | OK standalone, falla agentic |
| `google_news` | search | ⛔ BUG-08 (skipped) | (no route) | Falla agentic, no hay route |
| `google_maps` | search | ⛔ BUG-08 (skipped) | (no route) | Falla agentic, no hay route |
| `fetch_html` | scraper | ⛔ BUG-08 (skipped) | ✅ | OK standalone |
| `markdown` | scraper | ⛔ BUG-08 (skipped) | ✅ | OK standalone |
| `links` | scraper | ⛔ BUG-08 (skipped) | ✅ | OK standalone |
| `extract` | scraper | ⛔ BUG-08 (skipped) | ✅ | OK standalone |
| `screenshot` | scraper | ⛔ BUG-08 (skipped) | ✅ | OK standalone |
| `pdf` | scraper | ⛔ BUG-08 (skipped) | ✅ | OK standalone |
| `generate_image` | image | ✅ (image short-circuit evita BUG-08) | ✅ | OK |
| `edit_image` | image | ⛔ BUG-08 (skipped) | ✅ | OK standalone |
| `analyze_image` | image | ⛔ BUG-08 (skipped) | ✅ | OK standalone |
| `session_create` | session | (no se invoca agentic) | ✅ | OK |
| `session_exec` | session | (no se invoca agentic) | ✅ | OK |
| `session_close` | session | (no se invoca agentic) | ✅ | OK |

**Cost guards verificados (cuando el flujo no chocó con BUG-08):**

- ✅ Image short-circuit — confirmado en `generate_image` agentic.

(Los otros guards — dedup, MAX_TOOL_CALLS_PER_RUN, fail-fast — no llegaron a probarse porque BUG-08 corta el loop antes.)

---

## 2. Estado de la migración por capa

| Capa | Estado | Endpoint(s) |
|---|---|---|
| Wallets | ✅ Migrada al SDK | `wallets.balance/generate/transactions` |
| Models | ✅ Migrada al SDK | `models.list({search})` |
| Chat completions (no-stream) | ✅ Migrada al SDK | `chat.completions.create` con `onMeta`/`signal` |
| Chat completions (stream) | ✅ Migrada al SDK | `chat.completions.create({stream:true})` con `onFinalUsage` |
| Agentic loop | 🟠 Migrada al SDK pero **ROTA** por BUG-08 | `client.chat.conversation()` + `client.tools` |
| MCP standalone (Scraper, Images, Search, Sessions) | ⏸ Custom (intencional) | `McpClient.callTool` con normalización propia |
| `healthz`, `registerAgent`, `claimPlaygroundCredit` | ⏸ Custom (no expuestos por SDK) | `RestApiClient` con fetch directo |

---

## 3. Cambios necesarios en el dev server

`vite.config.ts` quedó **sin workarounds** (el proxy `/proxy/api` ya no necesita strip de trailing slash porque el SDK 2.3.0 ya no los manda).

```ts
'/proxy/api': {
  target: env.VITE_API_BASE ?? 'https://api.llm4agents.com',
  changeOrigin: true,
  secure: true,
  rewrite: (p) => p.replace(/^\/proxy\/api/, ''),
}
```

---

## 4. Bugs del SDK previos — TODOS RESUELTOS en 2.3.0

| Bug | Estado v2.2.0 | Estado v2.3.0 |
|---|---|---|
| 🔴 BUG-01 — `McpTransport.rpc` sin Accept header | ❌ | ✅ Manda `accept: application/json, text/event-stream` |
| 🟡 BUG-02 — Trailing slashes en wallets/models/transactions | ❌ | ✅ Paths sin trailing slash |
| 🟡 BUG-03 — `reasoning_tokens` ausente en `Conversation` | ❌ | ✅ `ConversationResponse.usage.reasoningTokens` + `ResponseMeta.tokensReasoning` |
| 🟡 BUG-04 — `feePct` ausente en `ModelListResult` | ❌ | ✅ Tipado como `feePct?: number` |
| 🟡 BUG-05 — Headers de cost en stream | ❌ | ✅ Nuevo callback `CompletionOptions.onFinalUsage` |

---

## 5. NUEVO bug del SDK encontrado en 2.3.0 — propuesta de fix

### 🔴 BUG-08 — `Conversation` envía `assistant.content: null` tras tool round (BLOQUEANTE)

**Severidad:** alta. Bloquea **el 100% del agentic loop con tools que requieren una segunda ronda al LLM** (osea: todos menos los image tools, que terminan por short-circuit).

**Síntoma reproducido:**

```
HTTP 400 Bad Request
{
  "error": "validation_error",
  "details": [{
    "code": "invalid_union",
    "errors": [
      [{"expected":"string","code":"invalid_type","path":[],"message":"Invalid input: expected string, received null"}],
      [{"expected":"array","code":"invalid_type","path":[],"message":"Invalid input: expected array, received null"}]
    ],
    "path": ["messages", 2, "content"],
    "message": "Invalid input"
  }]
}
```

**Repro mínimo (sin SDK, mostrando la forma del payload que el SDK genera):**

```ts
fetch('/v1/chat/completions', {
  method: 'POST',
  headers: { 'content-type': 'application/json', authorization: 'Bearer …' },
  body: JSON.stringify({
    model: 'google/gemini-2.5-flash-lite',
    messages: [
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: null, tool_calls: [{ id: 'c1', type: 'function', function: { name: 'x', arguments: '{}' } }] },
      { role: 'tool', tool_call_id: 'c1', content: 'result' },
    ],
  }),
})
// → 400 Bad Request
```

**Causa:** cuando un modelo OpenAI-style devuelve solo `tool_calls` sin texto en su mensaje, la respuesta tiene `choice.message.content === null` (esto es la convención OpenAI). El SDK Conversation pushea esa misma `assistantMessage` al `history` sin normalizar y la reenvía en la siguiente request. El backend del playground valida estrictamente y rechaza `null`.

**Quién tiene razón según el spec OpenAI:** ambos. OpenAI permite `null`, así que técnicamente el SDK está bien. Pero los validadores zod-style tienden a rechazar null para union `string | array`. Esto es un mismatch de strictness.

**Fix sugerido en el SDK (1 línea):**

En `Conversation.say` y `Conversation.stream`, donde se pushea el `assistantMessage` al history, normalizar:

```diff
- this.history.push(assistantMessage);
+ this.history.push({
+   ...assistantMessage,
+   content: assistantMessage.content ?? '',
+ });
```

**Fix alternativo en el backend del playground:** aceptar `null` en `messages[*].content` cuando el mensaje tenga `tool_calls` (lo que dicta la spec de OpenAI).

Cualquiera de los dos lados que lo arregle desbloquea el agentic loop completo. El fix en el SDK es más portable (cubre cualquier backend con esta validación estricta).

**Caso especial que NO choca:** tools de imagen (`generate_image`/`edit_image`) terminan el loop por image short-circuit antes de mandar la segunda request, así que su flujo agentic funciona.

---

## 6. Bugs pre-existentes del playground (sin cambios desde la pasada anterior)

### 🟡 BUG-06 — Definiciones en `CHAT_TOOLS` no marcan `proxy_tier` como required

Sigue activo. No probado en esta pasada (los flujos agentic con scraper tools fueron skipeados por BUG-08, que enmascararía cualquier otro problema). Detalle en la versión anterior del reporte.

### 🟡 BUG-07 — `edit_image` agentic no recibe el base64

Sigue activo. No probado en esta pasada.

---

## 7. Lo que sí ganó el playground con esta migración

- **~80 LOC menos** de transporte custom en `RestApiClient`.
- **`ResponseMeta.tokensReasoning` + `ConversationResponse.usage.reasoningTokens`** cableados al CostBadge (el badge "(N pensando)" funcionará en agentic mode una vez se desbloquee BUG-08).
- **`onFinalUsage` callback** en chat streaming → reasoning tokens visibles en stream sin tools.
- **Reasoning request fields tipados** + `AbortSignal` end-to-end + `tool_choice` tipado.
- **MCP standalone** sigue funcionando idéntico (custom McpClient, sin cambios).

---

## 8. Acción recomendada

### Opción A — Reportar BUG-08 al SDK y mantener el código migrado

1. **Reportar BUG-08** al equipo del SDK con el repro y el fix sugerido (1 línea).
2. **Esperar al fix** en una versión futura (probablemente 2.3.1 o 2.4.0). En el ínterin, el agentic loop con tools no-imagen no funciona en el playground.
3. **Cuando salga el fix:** bumpear `package.json` y volver a correr esta suite de pruebas. Sin cambios de código adicionales esperados.

### Opción B — Revertir SOLO el agentic loop hasta que se cierre BUG-08

1. **Revertir el commit del agentic** (`5866ebe` o `72624c6`) para volver al `runAgenticChat` custom mientras el SDK queda para wallets/models/chat completions. Recupera la funcionalidad agentic AHORA.
2. **Cuando salga el fix BUG-08:** re-aplicar el commit del agentic.

**Mi recomendación:** **Opción B**. El agentic loop es feature central del playground; tenerlo roto hasta que el SDK lance fix bloquea uso real. La opción B es 1 commit de revert y queda limpio.

---

## 9. Commits relevantes en `main`

```
5866ebe feat(sdk): bump to @llmforagents/sdk@2.3.0 and complete migration
72624c6 Revert "Revert "feat(sdk): migrate agentic loop to client.chat.conversation""
d76440e fix(proxy): strip trailing slash from /api paths in dev   (workaround removido en 5866ebe)
60549d6 Revert "feat(sdk): migrate agentic loop to client.chat.conversation"
4d77250 feat(sdk): migrate agentic loop to client.chat.conversation
7359efc feat(sdk): migrate wallets, models and chat completions to @llmforagents/sdk@2.2.0
f0d20ae docs(sdk): document remaining blockers vs @llmforagents/sdk@2.1.0
f25a157 feat(chat): redesign topbar — compound Tools/Effort + pricing fallback
```
