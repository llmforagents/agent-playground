# Análisis de migración a `@llmforagents/sdk@1.0.0`

**Fecha:** 2026-04-29
**Estado:** Análisis técnico — sin decisiones de implementación tomadas
**Asume:** SendTx ya removido del playground (ver Fase 1 separada)
**Fuente:** lectura directa de `node_modules/@llmforagents/sdk/dist/index.js` (778 líneas) + `index.d.ts` + `README.md`

---

## TL;DR honesto

Después de leer el código real del SDK, **solo 3 endpoints son migrables limpios**: `balance`, `generateWallet`, `listTransactions`. Todos los demás tienen bloqueadores técnicos verificables en el código del SDK que listo abajo.

| ¿Migrar? | Endpoints |
|---|---|
| ✅ **SÍ** (gana, sin pérdidas funcionales) | `wallets.balance`, `wallets.generate`, `wallets.transactions` |
| ❌ **NO** (rompe features del playground) | `chat completions` no-stream, `chat completions` stream, `mcp callTool`, `runAgenticChat` |
| ⚠️ **NO** (gap funcional aceptable de evaluar) | `models.list(search)` |
| ❌ **N/A** (el SDK no lo expone) | `healthz`, `registerAgent`, `claimPlaygroundCredit` |

---

## 1. Chat completions — `client.chat.completions.create(...)`

### Lo que dice el código del SDK

**No-streaming** (`ChatCompletions.create({stream:false})` en `index.js:243-248`):

```js
async create(params) {
  if (params.stream) {
    return this.createStream(params);
  }
  return this.http.post('/v1/chat/completions', params);
}
```

El método `http.post()` (`index.js:56-71`):

```js
async post(path, body) {
  const { res, text } = await this.request('POST', path, body);
  if (!res.ok) {
    throw mapHttpError(res.status, text, res.headers.get('x-request-id') ?? void 0);
  }
  try {
    return JSON.parse(text);   // ← solo el body parsed, NADA de los headers
  } catch { ... }
}
```

**Verificado: `http.post()` descarta `res.headers` completamente.** Solo se rescata `x-request-id` para el error path. En el happy path, los headers se pierden.

**Streaming** (`ChatCompletions.createStream` y `parseSSE` en `index.js:249-278`):

```js
async createStream(params) {
  const { stream } = await this.http.postStream('/v1/chat/completions', params);
  //          ^^^^ ← destructura SOLO stream, descarta requestId y headers que postStream sí devuelve
  return this.parseSSE(stream);
}
```

`postStream` en `index.js:107-139` devuelve `{ stream, requestId, headers }`. Pero `createStream` los descarta. Aunque pudiéramos modificarlo (no podemos — son privados), la API pública del SDK solo devuelve `AsyncIterable<StreamChunk>`.

**`parseSSE` parsea cada chunk como JSON tal cual viene de OpenRouter.** Eso significa que `chunk.usage` existe si el upstream lo envía (típico en último chunk para algunos providers), pero `chunk.cost`, `chunk.balanceRemaining` NO — esos vienen en headers, no en el body.

### Qué pierde el playground si migra

Los headers que el playground extrae hoy en `RestApiClient.extractMeta()`:

| Header | Uso en el playground |
|---|---|
| `x-cost-usd-cents` | Mostrado en `CostBadge` (costo del request en USD cents) |
| `x-tokens-input` | Mostrado en `CostBadge` (tokens de entrada) |
| `x-tokens-output` | Mostrado en `CostBadge` (tokens de salida) |
| `x-balance-remaining-cents` | Mostrado en `CostBadge` (saldo restante) |
| `x-request-id` | Mostrado en errores y guarda en historial |

Migrando al SDK perdés **los 5**. El usuario dejaría de ver costos en tiempo real y saldo restante después de cada chat.

### Bloqueadores adicionales verificados

1. **No acepta `AbortSignal` externo** (`index.js:87, 117, 150`): el SDK siempre usa `AbortSignal.timeout(this.timeout)` interno. **No hay forma de abortar un stream desde el botón "Stop"** del Chat. El playground hoy usa `AbortController` propio en `chatCompletionStream(..., signal)`.

2. **El tipo `ChatCompletionParams` es estricto** (`.d.ts:193-200`):
   ```ts
   interface ChatCompletionParams {
     readonly model: string
     readonly messages: readonly ChatMessage[]
     readonly temperature?: number
     readonly max_tokens?: number
     readonly tools?: readonly ToolDefinition[]
     readonly stream?: boolean
   }
   ```
   **NO incluye `tool_choice`, `reasoning`, `include_reasoning`, `extra_body`, ni passthrough.** Si querés enviar reasoning (caso de uso original que disparó este análisis), tendrías que castear con `as any` y aún así esperar que el SDK no descarte el campo en serialización (no lo hace porque pasa `params` íntegro a `JSON.stringify`, pero perdés type safety).

3. **`ChatResponse.usage` solo tiene `prompt_tokens` y `completion_tokens`** (`.d.ts:206-209`). No expone `reasoning_tokens`, ni `total_tokens` (lo computa el código consumidor).

### Veredicto

**NO migrar.** El cost badge es central a la UX del playground (es un sandbox de pruebas con dinero real, ver costos en vivo es el feature). Pierdes también la cancelación de streams y el passthrough para reasoning.

---

## 2. MCP tools — `client.tools.call(name, args)` y `client.tools.scraper/search/image.*`

### Lo que dice el código del SDK

`McpTransport.callTool` en `index.js:183-195`:

```js
async callTool(name, args) {
  const response = await this.rpc('tools/call', { name, arguments: args });
  const text = response.content
    .filter(c => c.type === 'text')   // ← SOLO items text
    .map(c => c.text)
    .join('\n');
  if (response.isError) {
    throw new LLM4AgentsError(text || `Tool ${name} failed`, 'tool_execution_error', ...);
  }
  return text;   // ← devuelve string, no McpToolResult
}
```

**Verificado en código:**
- El SDK **filtra y descarta** items con `type !== 'text'`.
- **Pierdes** `type: 'image'` (screenshots, generate_image, edit_image).
- **Pierdes** `type: 'resource'` (PDFs del scraper).
- **No hay normalizaciones** (`mime_type` → `mimeType`, sniffing de PNG/JPEG/GIF/WebP por magic bytes, unwrapping de `imageBase64`/`pngBase64`/`pdfBase64` de respuestas envueltas en JSON-text).

### Comparación con `McpClient.normalizeMcpResult` del playground

El playground (`src/infrastructure/mcp/McpClient.ts:107-175`) tiene 70 líneas dedicadas a normalizar respuestas del MCP server:

| Caso real | Playground hoy | SDK |
|---|---|---|
| Screenshot devuelve `{ type: 'image', data: '<b64 png>', mimeType: 'image/png' }` | Renderiza inline + botón descarga | **Lo descarta** |
| `generate_image` devuelve `{ type: 'text', text: '{"imageBase64":"...","mimeType":"image/png"}' }` | Detecta el JSON-en-texto, promueve a item `image` | **Devuelve el JSON crudo como string** |
| Scraper screenshot wrappea como `{ pngBase64, ... }` | Convierte a item `image` con MIME `image/png` | **Devuelve el JSON crudo** |
| Scraper PDF wrappea como `{ pdfBase64, ... }` | Convierte a `resource` con MIME `application/pdf` para renderizar en `<iframe>` | **Lo descarta** |
| `analyze_image` envuelve respuesta como `{ "text": "...respuesta...", "costCents": n }` | Desempaca para mostrar solo la respuesta | **Devuelve el JSON crudo** |
| Servers que envían `mime_type` (snake_case) | Normaliza a `mimeType` (camelCase) | **Ignora** (espera camelCase del backend) |
| Imagen sin `mimeType` declarado | Sniffing de magic bytes (`iVBORw0KGgo` → png, `/9j/` → jpeg, etc.) | **No hace sniffing** |

### Routes del playground que rompen al migrar

Verificando los consumidores de `useCases.callScraperTool`:

- `routes/ScraperOneShot.tsx`: muestra screenshots, PDFs, links extraídos. Rompe.
- `routes/ScraperSessions.tsx`: similar. Rompe.
- `routes/Search.tsx`: muestra resultados Google. **Funcionaría** (los resultados son text).
- `routes/Images.tsx`: `generate_image`, `edit_image`, `analyze_image`. **Rompe completamente** las dos primeras (devuelven imágenes).
- `runAgenticChat.ts`: el `summarizeResult` espera `{ summary, content }` con detección de tipo. Rompe — recibirías solo strings.

### Veredicto

**NO migrar.** Romperías 4 de las 5 rutas que usan MCP (Scraper one-shot, Scraper sessions, Images) y el agentic loop del Chat (que renderiza imágenes inline cuando el LLM llama `generate_image`).

---

## 3. Wallets — `client.wallets.balance/generate/transactions`

### Código del SDK (`index.js:530-551`)

```js
class Wallets {
  async generate(params) {
    return this.http.post('/api/v1/wallets/generate', { chain: params.chain, token: params.token });
  }
  async balance() {
    return this.http.get('/api/v1/balance/');   // ← slash trailing (playground usa sin slash, normalmente backend redirige)
  }
  async transactions(filter) {
    const params = {};
    if (filter?.type) params.type = filter.type;
    if (filter?.limit !== undefined) params.limit = String(filter.limit);
    if (filter?.offset !== undefined) params.offset = String(filter.offset);
    const hasParams = Object.keys(params).length > 0;
    return this.http.get('/api/v1/transactions/', hasParams ? params : undefined);
  }
}
```

### Comparación con el playground

| Aspecto | Playground hoy | SDK | Match |
|---|---|---|---|
| `getBalance(key)` → `BalanceResponse` | `getJson('/api/v1/balance', BalanceResponseSchema, key)` | `wallets.balance()` → `Balance` | ✅ Equivalente. Tipos coinciden 1:1 (uuid, availableUsdCents, availableUsd, totalDepositedUsd, totalSpentUsd, wallets, requestId) |
| `generateWallet(key, {chain, token})` → `GenerateWalletResponse` | `postJson('/api/v1/wallets/generate', req, ...)` | `wallets.generate({chain, token})` → `WalletInfo` | ✅ Equivalente. SDK incluye `requestId` en la respuesta |
| `listTransactions(key, {type, limit, offset})` → `TransactionsResponse` | `getJson('/api/v1/transactions${qs}', ...)` | `wallets.transactions({type, limit, offset})` → `TransactionList` | ✅ Equivalente. Mismo shape (transactions, total, limit, offset, requestId) |

### Trade-offs

**Ganás:**
- ~30 LOC menos de transporte (3 métodos en `RestApiClient`).
- Tipos del SDK como source of truth (auto-update con `npm`).

**Pagás:**
- +189 KB en bundle (SDK no permite tree-shaking del cliente único `LLM4AgentsClient`).
- Una capa de traducción de errores `LLM4AgentsError` → `RestError` (Result wrapping).
- Pequeño overhead de instanciar el cliente SDK por llamada (porque `apiKey` se fija en construcción y el playground es multi-agente).

### Veredicto

**SÍ es migrable, pero el ROI es bajo.** Son 3 endpoints triviales (GET balance, POST generate wallet, GET transactions). Si lo hacés es por alineación con el provider o futuro-proofing, no por simplicidad.

---

## 4. Models — `client.models.list()`

### Código del SDK (`index.js:770-772`)

```js
this.models = {
  list: () => http.get('/api/v1/models/').then(res => res.models)
};
```

### Comparación

| Aspecto | Playground hoy | SDK |
|---|---|---|
| Endpoint | `GET /api/v1/models?search=<q>` | `GET /api/v1/models/` |
| `search` param | ✅ Sí (server-side filter sobre 290+ modelos) | ❌ NO |
| Devuelve | `{ models, feePct, requestId }` | `models[]` (descarta `feePct` y `requestId`) |
| `feePct` por modelo | Lo expone | El tipo `ModelInfo` del SDK no lo incluye |

### Veredicto

**Migrable con pérdida.** Si querés mantener:
- Búsqueda server-side: tenés que llamar al endpoint custom (no al SDK), o descargar todo y filtrar client-side (factible para 290 entradas con debounce).
- `feePct` global: necesitás llamada custom o asumir un default.

Si descargar todo + filtrar client-side te alcanza, podés migrar. Si no, mantené fetch directo.

---

## 5. Conversation (agentic loop) — `client.chat.conversation()`

### Código del SDK (`index.js:283-527`)

El SDK ofrece `Conversation` con `say()` y `stream()` para correr un loop agéntico tipo "user → assistant → tool → assistant → ...". Tiene:

- `maxToolRounds` (default 10) — equivalente al cap de tool calls.
- `onToolCall(name, args) => boolean` — hook para cancelar tools individuales.
- `onToolResult(name, result) => void` — hook post-call.
- Maneja history automáticamente.
- Stream emite eventos `text`, `tool_start`, `tool_end`, `done`.

### Comparación con `runAgenticChat` del playground

| Feature | Playground (`runAgenticChat`) | SDK (`Conversation`) |
|---|---|---|
| Cap absoluto de tool calls | ✅ `MAX_TOOL_CALLS_PER_RUN = 3` | ✅ `maxToolRounds` (default 10) |
| Dedup por `(toolName, args)` | ✅ Bloquea segunda llamada idéntica con mensaje al modelo | ❌ NO. Si el modelo llama lo mismo 5 veces, se ejecuta 5 veces. |
| Image short-circuit | ✅ Después de un PNG terminal, cierra sin síntesis | ❌ NO. Sigue iterando hasta `maxToolRounds`. |
| Native ↔ prompt-mode fallback | ✅ Si el modelo no soporta tool calling nativo, retry en prompt-mode con JSON parsing | ❌ NO. Asume native. Si el modelo no soporta tools, falla. |
| Cost guard fail-fast en MCP error | ✅ Aborta sin retry | ❌ El SDK captura el error y mete `result: err.message` como respuesta — el LLM ve el error y puede reintentar (gasta más) |
| Eventos para UI (rendering en vivo) | ✅ `thinking`, `assistant_text`, `tool_call`, `tool_result`, `mode_fallback`, `aborted`, `final`, `error` | ⚠️ `text`, `tool_start`, `tool_end`, `done` (menos granular) |
| Acceso a `raw` del tool result | ✅ El UI usa `raw` para renderizar imágenes inline | ❌ Solo recibe `result: string` (porque `tools.call` devuelve string) |
| Cancelación externa (botón Stop) | ✅ `signal: AbortSignal` propagado | ❌ Sin signal externo |
| Tipo de error | `Result<T, AppError>` con discriminantes | `throw LLM4AgentsError` |

### Veredicto

**NO migrar.** `Conversation` carece de los 5 cost guards que el playground necesita y no expone los `raw` de tool results. Migrar implicaría reconstruir todo encima de hooks `onToolCall`/`onToolResult` y aún así perderías `raw` (porque `tools.call` ya descartó las imágenes en `McpTransport.callTool`).

Además, `runAgenticChat` depende de `chatCompletion` y `mcp.callTool` — si esos dos no se migran (y vimos arriba que no), el agentic loop tampoco.

---

## 6. Endpoints que el SDK no expone

| Endpoint | Uso en el playground |
|---|---|
| `GET /healthz` | Settings → "Health check" botón |
| `POST /api/v1/agents/register` | Registro de agentes nuevos en `/agents` |
| `POST /api/v1/playground/claim` | Claim de 50¢ con Turnstile + GitHub OAuth |
| `POST /v1/tx/send` (sponsored, sin private key) | Era SendTx — vamos a quitar |

Los 3 primeros **deben quedarse en `RestApiClient` con fetch directo**. El SDK simplemente no los expone.

---

## 7. Diferencias arquitecturales que afectan la migración

### Multi-agente: `apiKey` en construcción del cliente

El SDK toma `apiKey` en el constructor de `LLM4AgentsClient` y lo pasa a `HttpTransport` y `McpTransport`. Es **inmutable** post-construcción.

El playground es multi-agente: `getBalance(key)`, `generateWallet(key, ...)`, etc. reciben la key como argumento, lo que permite cambiar de agente sin rehacer cliente.

**Consecuencias:**
- Si migrás los 3 wallets endpoints, tenés tres opciones:
  - **(a)** Crear `LLM4AgentsClient` por llamada (efímero).
  - **(b)** Cachear `Map<AgentId, LLM4AgentsClient>` y rotar.
  - **(c)** Recrear el cliente cuando cambia el `activeAgentId`.
- La opción **(a)** es la más simple y encaja con el patrón actual. Overhead de construcción es despreciable (no hace I/O en el constructor, solo guarda config).

### Errors: `Result<T, RestError>` vs `throw LLM4AgentsError`

El playground está construido en torno a `Result<T, E>` (discriminated union). Toda la capa `useCases.ts` espera `Result.ok` para narrowing.

El SDK throws. Para integrar, cada llamada al SDK necesita estar envuelta en try/catch + traducir el error.

**Mapping table** (verificado en `index.js:11-47`):

| `LLM4AgentsError.code` | `RestError` equivalente |
|---|---|
| `auth_error` (401/403) | `{ kind: 'unauthorized' }` |
| `insufficient_balance` (402) | `{ kind: 'upstream_error', status: 402, body: e.message }` (el playground no tiene un kind dedicado) |
| `rate_limited` (429) | `{ kind: 'rate_limited' }` |
| `model_not_found` (404) | `{ kind: 'upstream_error', status: 404, body: e.message }` |
| `model_disabled` (422) | `{ kind: 'upstream_error', status: 422, body: e.message }` |
| `timeout` | `{ kind: 'timeout', endpoint: '...' }` |
| `network_error` | `{ kind: 'network' }` |
| `api_error` (default) | `{ kind: 'upstream_error', status: e.statusCode ?? 500, body: e.message }` |

### Differences en paths (slash trailing)

El SDK usa paths con slash trailing (`/api/v1/balance/`, `/api/v1/transactions/`, `/api/v1/models/`). El playground usa sin slash. **Si el backend no redirige consistentemente, podés tener un 404 inesperado.** Verificar en producción antes de mergear.

---

## 8. Resumen final — checklist de migración

### Lo que SÍ se puede migrar al SDK (sin pérdidas funcionales)

- [ ] `RestApiClient.getBalance` → `sdk.wallets.balance()`
- [ ] `RestApiClient.generateWallet` → `sdk.wallets.generate(...)`
- [ ] `RestApiClient.listTransactions` → `sdk.wallets.transactions(...)`

**Trabajo asociado:**
- Construir `LLM4AgentsClient` por llamada (apiKey por agente).
- Wrapper try/catch + `translateSdkError(e: unknown): RestError`.
- Verificar paths con slash trailing contra el backend.
- Mantener Zod schemas como validación defensiva (opcional, recomendado).

**Estimación:** ~80 LOC tocadas en `RestApiClient.ts` (3 métodos reescritos + helper de traducción).

### Lo que NO se debe migrar (rompe features)

- ❌ `chatCompletion` y `chatCompletionStream` — perdés cost headers, AbortSignal, passthrough para reasoning.
- ❌ `mcp.callTool` — perdés items de imagen/resource y todas las normalizaciones.
- ❌ `runAgenticChat` — el SDK `Conversation` carece de los 5 cost guards y de acceso al `raw` de tool results.
- ❌ `listModels` (si querés mantener búsqueda server-side y `feePct`).

### Lo que el SDK no cubre

- ❌ `healthz`
- ❌ `registerAgent`
- ❌ `claimPlaygroundCredit`

### Estado del repo después de hacer (1) + remover SendTx + dejar (2)+(3) como están

```
src/infrastructure/rest/RestApiClient.ts:
  - healthz, registerAgent, claimPlaygroundCredit, listModels: fetch directo (sin cambios)
  - chatCompletion, chatCompletionStream: fetch directo (sin cambios)
  - listTransactions, getBalance, generateWallet: SDK
  + translateSdkError helper
  - sendTx: ELIMINADO

src/infrastructure/mcp/McpClient.ts:
  Sin cambios (sigue como hoy con normalizaciones).

src/application/runAgenticChat.ts:
  Sin cambios.

package.json:
  + @llmforagents/sdk
```

---

## 9. Mi recomendación final

Si la motivación es **soportar `reasoning`** (el thread original): el SDK no ayuda — su tipo `ChatCompletionParams` no lo incluye. La solución es ampliar el schema `ChatCompletionRequestSchema` del playground y el SSE parser para capturar `delta.reasoning`. ~50 LOC sin tocar el SDK.

Si la motivación es **ahorrar código de transporte**: para 3 endpoints triviales (~30 LOC) no vale la pena agregar 189 KB de bundle + capa de traducción de errores. El cliente custom actual es más liviano y precisamente tipado.

Si la motivación es **alineación con el ecosistema** (mostrar que el playground "usa el SDK oficial"): tiene sentido aunque el ROI técnico sea bajo. Es honesto.

**Si avanzás con la migración parcial, el orden recomendado es:**
1. Quitar SendTx (commit independiente, claro beneficio).
2. Agregar `@llmforagents/sdk` al `package.json` y migrar los 3 endpoints de wallets uno a uno (3 commits separados con tests verdes en cada paso).
3. Verificar manualmente en `http://skywalker:4310` que balance, generate wallet y transactions sigan funcionando con tu agente importado.
4. NO tocar chat completions, MCP, runAgenticChat ni healthz/register/claim.

Si lo que querés en serio es reasoning: hagamos eso por separado, sin tocar el SDK.
