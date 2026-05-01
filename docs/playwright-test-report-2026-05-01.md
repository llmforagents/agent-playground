# Playwright E2E Test Report — 2026-05-01

**SDK:** `@llmforagents/sdk@2.3.1` (latest published on npm)
**Backend:** `https://api.llm4agents.com`
**Pruebas iniciales (1ª pasada):** corridas en dev `:4301` (Vite proxy). Reporte original abajo.
**Pruebas adicionales (2ª pasada — gaps de cobertura):** corridas en preview `:4310` (build de producción servido por systemd, requests directas al backend con CORS). Sección "Gaps cubiertos en 2ª pasada" abajo.
**Agent:** `soncley-agent` (`7cd0e984-ece7-46b0-aa66-dd707e6b5906`)
**Balance final:** ~$3.40
**Tester:** Claude Code (Playwright MCP)

## Resumen

| # | Endpoint / Feature | Resultado | Notas |
|---|---|---|---|
| 1 | `/agents` — registro local + reveal/mask key | ✅ | Key revelada coincide con la inyectada |
| 2 | `/` — Home (balance, depositado, gastado) | ✅ | Balance $3.62, dep $5.70, gastado $2.08 |
| 3 | `/wallet` — sync 4 wallets existentes + idempotente | ✅ | polygon-USDC, solana-USDC, +2 |
| 4 | `/transactions` — 232 tx, paginación, filtro Uso | ✅ | 232 todas → 223 sólo Uso |
| 5 | `/models` — 309 modelos + búsqueda `haiku` (4/309) | ✅ | Pricing, contexto y proveedor visibles |
| 6 | `/chat` — stream sin tools (`gemini-2.5-flash-lite`) | ✅ | "TypeScript es JavaScript con tipado estático opcional." |
| 7 | `/chat` — agentic con `google_search` | 🔴 | **Bug del SDK**, ver detalle abajo |
| 8 | `/chat` — `generate_image` (512×512) | ✅ | PNG 275KB inline + descarga |
| 8b | `/chat` — `generate_image` validación 256×256 | ✅ | Zod rechaza correctamente con mensaje claro |
| 8c | `/chat` — `edit_image` agentic | 🔴 | El modelo inventa URL OpenAI (BUG-07 conocido) |
| 8d | `/chat` — `analyze_image` agentic | 🔴 | Backend: "Vision API returned empty response" |
| 9 | `/search` — `google_search` standalone "capital de Australia" | ✅ | 10 resultados orgánicos correctos |
| 10 | `/images` — `generate_image` standalone | ✅ | 1024×1024 generada |
| 10b | `/images` — `analyze_image` standalone | 🔴 | Mismo bug Vision API empty response |
| 11 | `/scraper/one-shot` — `fetch_html` example.com | ✅ | HTML 200 OK, JSON con `finalUrl` |
| 12 | `/scraper/sessions` — crear y cerrar sesión | ✅ | Sesión `3cbf326c-…2bcb` creada y cerrada |
| 13 | `/settings` — toggle tema dark→light, healthcheck | ✅ | `dark` class removida, `/healthz` → ok |

**Score 1ª pasada:** 13 ✅ / 3 🔴 sobre 16 escenarios verificados.
**Score 2ª pasada (gaps):** 13 ✅ / 2 🔴 sobre 15 escenarios adicionales.
**Score total combinado:** 26 ✅ / 5 🔴 sobre 31 escenarios.
**Después de aplicar fixes (3ª iteración):** 29 ✅ / 3 🔴 — los 3 restantes son bugs externos (SDK 2.3.2 pendiente + backend Vision API + backend image fetcher).

---

## 🔴 Bug 1 (BLOCKING) — Agentic loop multi-round con tools de búsqueda

**Síntoma:** Cualquier prompt que requiera al modelo usar `google_search` y luego responder con el resultado **rompe la segunda ronda al LLM**.

| Proveedor | Modelo | Error upstream | requestId |
|---|---|---|---|
| Google AI Studio | `google/gemini-2.5-flash-lite` | **400** `Tool message must have either name or tool_call_id` | `05fa095f-110a-42ec-85b0-8f64def533d7` |
| Anthropic | `anthropic/claude-haiku-4.5` | **500** Internal Server Error | `177dfe8b-9a5f-4778-a312-a80cbeacc068` |

**Causa raíz (probable):** Tras ejecutar el tool, el SDK reconstruye el mensaje `role: 'tool'` para la próxima request al LLM, pero **omite los campos `name`/`tool_call_id`** que ambos proveedores requieren. El error 400 de Google es la prueba directa; en Anthropic el provider lo traduce a 500. La tool MCP ejecuta exitosamente ("listo" en UI) — el fallo es **estrictamente** entre el SDK y el LLM en la segunda iteración.

**Diferencia con BUG-08 anterior:** El reporte previo (`docs/sdk-migration-test-report.md`, 2026-04-30) describía `assistant.content: null`. Este bug (2026-05-01) es **mensaje `tool` mal formado**. Puede ser un fix parcial o un bug nuevo introducido en `2.3.1`.

**Reproducción mínima:**
1. `/chat` con tools ON, modelo Gemini 2.5 Flash Lite o Claude Haiku 4.5
2. Prompt: "¿Quién ganó el Mundial 2022? Usá google_search y respondeme corto."
3. Tool ejecuta OK, segunda request al LLM falla 400/500.

**Impacto:** **Toda** combinación agentic con tools que NO sean image (que cortan el loop al primer turno) está rota.

---

## 🔴 Bug 2 — `analyze_image` (backend, no SDK ni playground)

**Síntoma:** `analyze_image` con URL HTTPS pública válida devuelve consistentemente:
```
Upstream error 502
"Vision API returned empty response"
```

**Probado:**
- Standalone `/images` → falla
- Agentic `/chat` → falla con misma respuesta

**Origen:** Backend de LLM4Agents, downstream de Vision API. El playground propaga el error correctamente.

---

## 🔴 Bug 3 — `edit_image` agentic (BUG-07 ya documentado)

**Síntoma:** El modelo, al recibir el pedido "editá la imagen anterior", inventa una URL `https://cdn.oaistatic.com/API/generated/img_…png` que devuelve 404.

**Causa:** El system prompt no le da al modelo el `data:image/png;base64,…` de la imagen del turno anterior, así que el modelo alucina una URL OpenAI.

**Fix sugerido:** En `runAgenticChat.ts`, al detectar `generate_image`/`edit_image` en historial, inyectar el base64 del último resultado como contexto recuperable, o documentar explícitamente al modelo que NO puede llamar `edit_image` sin que el usuario adjunte la imagen.

---

## ✅ Confirmaciones positivas

- **SDK efectivamente en uso**: requests `/proxy/api/v1/chat/completions` confirmado en consola de red, todos los endpoints REST pasan por `LLM4AgentsClient` (`sdk.wallets.balance()`, `sdk.models.list()`, `sdk.wallets.transactions()`, `sdk.chat.completions.create()`, `sdk.chat.conversation()`).
- **Streaming chat sin tools** funciona perfecto en Gemini.
- **Validación Zod en bordes** funciona: `generate_image 256x256` se rechaza con mensaje detallado y sin cobrar tokens.
- **`generate_image` 1024×1024 standalone y 512×512 agentic** generan PNGs correctos.
- **MCP scraper** (one-shot + session-based) funciona limpio.
- **Sincronización de wallets** trae 4 direcciones del backend correctamente.
- **Filtros y paginación** de transactions funcionan (232 → 223 al filtrar Uso).
- **Theming** dark→light vía clase `dark` en `<html>` es instantáneo.
- **Healthcheck** `/healthz` → `{ status: "ok", service: "llm-proxy-api" }`.

---

## Comparativa con `sdk-migration-test-report.md` (2026-04-30)

| BUG previo | Estado en 2.3.1 |
|---|---|
| BUG-01 Accept header MCP | ✅ Cerrado |
| BUG-02 trailing slashes | ✅ Cerrado |
| BUG-03 reasoning_tokens | ✅ Cerrado |
| BUG-04 feePct | ✅ Cerrado |
| BUG-05 cost headers stream | ✅ Cerrado |
| **BUG-08 agentic `assistant.content: null`** | 🟡 **Aparentemente cambió a "Tool message must have name/tool_call_id"** — sigue rompiendo el loop |
| BUG-07 edit_image | 🔴 Igual (no es del SDK, es del prompt) |

---

---

## Gaps cubiertos en 2ª pasada (2026-05-01, sobre `:4310` preview)

| # | Gap | Resultado | Detalle |
|---|---|---|---|
| 14 | Cambio idioma EN ↔ ES en runtime | ✅ | "Inicio→Home, Saldo→Balance, Gastado→Spent" sin reload |
| 15 | `/search` Noticias | ✅ | Resultados Verge, Ars Technica, BleepingComputer con timestamps |
| 16 | `/search` Mapas | ✅ | Pizzerías Buenos Aires con direcciones, ratings, URL |
| 17 | `/search` Batch (2 queries) | ✅ | TypeScript + React en una llamada |
| 18 | `/scraper` `markdown` | ✅ | Markdown estructurado |
| 19 | `/scraper` `links` | ✅ | Array de `{href, text, rel}` |
| 20 | `/scraper` `screenshot` | ✅ | Captura PNG inline |
| 21 | `/scraper` `pdf` | ✅ | PDF generado |
| 22 | `/scraper` `extract` con selectores CSS | ✅ | `{title, paragraph[]}` extraídos correctamente |
| 23 | EffortSelector aparece según modelo | ✅ | Sólo se muestra para modelos en `REASONING_PREFIXES` (Claude Sonnet 4, OpenAI o-series, DeepSeek R1, Gemini 2.5 \*-thinking). Familia: enum_effort / boolean_toggle / token_budget |
| 24 | Reasoning text en bubble | ✅ | Bloque "💭 Razonamiento" expansible, contenido completo del thinking |
| 25 | **`reasoning_tokens` count en UI** | 🔴 | **Backend devuelve `usage.completion_tokens_details.reasoning_tokens=132` en el último chunk del SSE, pero el playground NO lo muestra como CostBadge.** El componente `CostBadge.tsx:47-57` existe pero `meta.reasoningTokens` llega vacío al Bubble. |
| 26 | Mobile drawer (375×812) | ✅ | Topbar colapsa: hamburger + agent name + balance compacto. Drawer se abre con sidebar completa + botón cerrar |
| 27 | Mobile bottom sheet de tools | ✅ | Tools agrupadas por categoría (Búsqueda 3, Web scraper 4, Imagen 3) con costo por llamada y descripción |
| 28 | `edit_image` standalone con URL Wikipedia | 🔴 | **403 Forbidden** — backend del provider de imagen no puede fetchear desde upload.wikimedia.org |
| 29 | `edit_image` standalone con URL `picsum.photos` | ✅ | PNG editado correctamente cuando la URL es accesible al backend |

### Bug 4 — `reasoning_tokens` no se renderiza en UI (NUEVO, regresión)

**Evidencia:** Captura del último SSE chunk vía Playwright network:
```json
{
  "usage": {
    "prompt_tokens": 87,
    "completion_tokens": 514,
    "total_tokens": 601,
    "cost": 0.007971,
    "completion_tokens_details": {"reasoning_tokens": 132}
  }
}
```

**Síntoma:** El bubble del asistente queda sin CostBadge — no aparece "in: …", "out: …", ni "🧠 reasoning: 132 tok".

**Causa probable (a investigar):** entre el `onFinalUsage` callback del SDK (`RestApiClient.ts:103-133` — ese fue el código que migró BUG-03 a v2.3.0) y el `meta` del componente Bubble vía `useChatStream`, algún campo se pierde. Posiblemente:
- a) El SDK 2.3.1 ya NO está invocando `onFinalUsage` (regresión silenciosa).
- b) El `meta` se calcula pero no se asocia al último Bubble (race condition al cerrar el stream).

**Fix sugerido (sin tocar SDK):** debug paso a paso:
1. `console.log` en `RestApiClient.ts` dentro del callback `onFinalUsage` para verificar si se invoca.
2. `console.log` en `useChatStream.ts` cuando recibe el meta final.
3. `console.log` en `CostBadge` para ver qué `meta` recibe.

Esto le tomaría 10-15 min al desarrollador y desambigua si es del SDK o del playground.

### Bug 5 — `edit_image` upstream falla por bloqueo de user-agent

**Síntoma:** edit_image con URLs de Wikipedia/Wikimedia devuelve 403 Forbidden upstream. Con URLs permisivas (`picsum.photos`) funciona.

**Origen:** Backend del provider de imágenes (no playground, no SDK). Probablemente hace fetch directo de la URL sin user-agent realista o sin honrar redirects/cookies.

**Workaround para usuarios:** usar URLs de hosts permisivos o pegar base64 directamente.

### Bug 6 — MCP URL faltante en producción (DESCUBIERTO durante los fixes)

**Síntoma:** En `:4310` (preview = build de producción), TODAS las tools MCP devolvían **HTTP 404**. Capturado vía Playwright network: `POST https://mcp.llm4agents.com/ → 404` (path raíz, no `/mcp`).

**Causa raíz:**
- En dev `:4301`, el proxy de Vite reescribía `/proxy/mcp` → `${VITE_MCP_BASE}/mcp` agregando el path.
- En preview/producción NO hay proxy. El SDK usa `mcpUrl` literalmente como lo recibe.
- `composition/root.ts:34` pasaba `env.mcpBase = 'https://mcp.llm4agents.com'` (sin `/mcp`) al SDK como `sdkConfig.mcpUrl`.
- El SDK por default tiene `DEFAULT_MCP_URL = 'https://mcp.llm4agents.com/mcp'` pero al recibir `mcpUrl` lo respeta verbatim.
- → POST a `https://mcp.llm4agents.com/` → 404.

**Impacto:** crítico — sin esto, ninguna tool MCP funciona en producción (`google_search`, `generate_image`, `edit_image`, `analyze_image`, scraper, etc.).

**Fix aplicado:** ver sección "Fixes aplicados" más abajo.

---

## Fixes aplicados al playground (2026-05-01)

Tres bugs controlables desde el playground fueron resueltos. Los 3 bugs restantes (1, 2, 5) dependen del SDK o del backend.

### ✅ Fix Bug 4 — `reasoning_tokens` no llegaba al UI

**Archivo:** `src/infrastructure/rest/RestApiClient.ts`

**Diagnóstico de la causa raíz:**
1. Inspección del SDK instalado (`node_modules/@llmforagents/sdk/dist/index.js:400-425`) reveló que `parseSSE` busca `lastUsage.reasoning_tokens` (top-level), pero los providers LLM (Google, Anthropic vía OpenRouter) lo nestean en `lastUsage.completion_tokens_details.reasoning_tokens`. → callback `onFinalUsage` recibía `reasoningTokens: undefined`.
2. `buildMeta(headers)` (SDK línea 337-353) lee `costUsdCents`, `tokensInput`, `tokensOutput`, etc. desde HEADERS HTTP (`x-cost-usd-cents`, `x-tokens-input`, etc.). En streaming, esos headers no llegan antes de los chunks SSE → `onMeta` recibía meta vacío.

**Cambio:** capturar `chunk.usage` directamente del último chunk SSE como fallback, sin depender de los callbacks rotos del SDK.

```typescript
// chatCompletionStream() — captura chunk.usage en cada iteración
let lastUsage: SseUsage | undefined
for await (const raw of stream) {
  const chunk = raw as { choices?: ...; usage?: SseUsage }
  if (chunk.usage) lastUsage = chunk.usage
  // ... yield deltas
}
yield { kind: 'done', meta: metaFromSdk(capturedMeta, finalReasoningTokens, lastUsage), ... }

// metaFromSdk() — fallback chain: SDK callback → SDK headers → SSE usage chunk
const tokensInput = m?.tokensInput ?? usage?.prompt_tokens
const tokensOutput = m?.tokensOutput ?? usage?.completion_tokens
const reasoning = reasoningTokens ?? usage?.completion_tokens_details?.reasoning_tokens
const costCents = m?.costUsdCents ?? (usage?.cost !== undefined ? usage.cost * 100 : undefined)
```

**Verificación:** chat con Claude Sonnet 4 + effort medio → CostBadge muestra `$0.0030 · in: 388 · out: 125 · (68 pensando)` con `(68 pensando)` en color amber. ✅

### ✅ Fix Bug 3 — `edit_image` agentic con URL alucinada

**Archivo:** `src/application/runAgenticChat.ts:40-42` (system prompt)

**Cambio:** agregada nueva línea CRITICAL al system prompt:

```
- CRITICAL for edit_image and analyze_image: these tools REQUIRE an explicit
  image source supplied in the LATEST user message — either an https:// URL or
  a base64 data URI. You DO NOT have access to images produced in previous
  turns: results of generate_image are shown only to the user, not to you.
  NEVER fabricate an image URL (e.g. "cdn.oaistatic.com/...", "openai.com/...",
  or any guessed link). If the user asks to edit or analyze "the previous
  image" without re-attaching it, do NOT call the tool — instead reply asking
  the user to paste the image URL or data URI again, briefly explaining you
  can't see prior images.
```

**Verificación:** prompt "Editá la imagen anterior con edit_image: agregale un sombrero rojo" con Claude Sonnet 4 → modelo responde sin llamar tool: *"No puedo ver la imagen anterior porque no tengo acceso a las imágenes generadas en turnos previos. Para editar una imagen con `edit_image`, necesito que vuelvas a pegar la URL de la imagen o el data URI (base64) en tu mensaje. ¿Podrías compartir nuevamente la imagen?"* ✅ Sin URLs inventadas, sin tool calls fallidos, sin gasto inútil.

### ✅ Fix Bug 6 — MCP URL faltante en producción

**Archivo:** `src/composition/root.ts:34, 42-49`

**Cambio:** función helper `ensureMcpPath()` que normaliza la URL antes de pasarla al SDK.

```typescript
sdkConfig: { baseUrl: env.apiBase, mcpUrl: ensureMcpPath(env.mcpBase) },

function ensureMcpPath(base: string): string {
  const trimmed = base.replace(/\/+$/, '')
  return trimmed.endsWith('/mcp') ? trimmed : `${trimmed}/mcp`
}
```

**Verificación:** servicio `:4310` reiniciado con build nuevo → MCP tools responden 200 OK. Prompt edit_image confirmó que el endpoint MCP ya no devuelve 404. ✅

### Estado final del playground

| # | Bug | Estado | Quién lo arregla |
|---|---|---|---|
| 1 | Agentic loop multi-round (`Tool message must have name/tool_call_id`) | 🔴 abierto | SDK ≥ 2.3.2 |
| 2 | `analyze_image` Vision API empty response | 🔴 abierto | Backend |
| 3 | `edit_image` agentic alucina URLs | ✅ **RESUELTO** | Playground (system prompt) |
| 4 | `reasoning_tokens` no en UI | ✅ **RESUELTO** | Playground (workaround sobre callbacks rotos del SDK) |
| 5 | `edit_image` URLs externas 403 | 🔴 abierto | Backend (user-agent del fetcher) |
| 6 | MCP URL falta `/mcp` en preview/prod | ✅ **RESUELTO** | Playground (normalización) |

**3 de 3 bugs controlables desde el playground resueltos.** Los 3 restantes son bloqueos externos (SDK + backend).

---

## Cleanup

- Sesión scraper `3cbf326c-…2bcb` cerrada al final.
- 29 screenshots en `test-*.png` (raíz del proyecto).
- Dev server sigue corriendo en `http://localhost:4301/`.

## Recomendaciones (siguientes pasos para llegar al 100%)

1. **Reportar al equipo del SDK** dos issues:
   - "Tool message must have name or tool_call_id" en segundo round agentic (Bug 1). Adjuntar requestId Google `05fa095f-110a-42ec-85b0-8f64def533d7`.
   - `parseSSE` lee `lastUsage.reasoning_tokens` cuando los providers lo mandan en `lastUsage.completion_tokens_details.reasoning_tokens` (Bug 4 origen). Fix recomendado: leer ambos paths.
2. **Reportar al backend** dos issues:
   - `Vision API returned empty response` con URL pública estándar (Bug 2).
   - `edit_image` upstream falla con 403 al fetchear de Wikipedia/Wikimedia (Bug 5). Posiblemente falta user-agent realista en el HTTP client del provider de imagen.
3. **No re-revertir** el agentic loop migrado: el problema está en el SDK, no en el playground. Esperar `2.3.2` o superior.
4. **Verificar el workaround del Bug 4** cuando salga el SDK con fix nativo: si v2.3.2 devuelve `tokensReasoning` correctamente desde `onFinalUsage`, el fallback en `metaFromSdk()` simplemente quedará dormido (sin cambios de código necesarios — la cadena `??` lo absorbe).
