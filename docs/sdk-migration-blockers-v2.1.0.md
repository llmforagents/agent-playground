# Bloqueadores pendientes para migración total al SDK `@llmforagents/sdk`

**Versión analizada:** `@llmforagents/sdk@2.1.0`
**Fecha:** 2026-04-30
**Estado:** análisis técnico — la migración total sigue **NO recomendada**
**Fuente de verdad:** lectura directa del código en `/tmp/sdk-review/package/dist/index.js` (965 líneas) e `index.d.ts` (571 líneas)

> Documento complementario a `docs/sdk-migration-analysis.md`, que cubrió la versión 1.0.0. Este reporte se enfoca exclusivamente en los gaps que **siguen abiertos** después de los avances de v2.0.1 y v2.1.0.

---

## TL;DR

v2.1.0 cerró 6 de los bloqueadores que existían en versiones previas (acceso a `raw`, dedup, image short-circuit, fail-fast en errores de tool, `AbortSignal` end-to-end hasta MCP, `onRoundMeta` para `Conversation.say`). Sin embargo, **quedan 4 gaps que impiden migrar el 100% del transporte sin perder features o degradar la UX**:

| # | Gap | Impacto en el playground |
|---|---|---|
| 1 | JSON-in-text unwrap ausente en la normalización MCP | Rompe `/images`, `/scraper-oneshot`, `/scraper-sessions` y agentic con imágenes/PDFs |
| 2 | Sin fallback native↔prompt en `Conversation` | Modelos sin function calling nativo ignoran silenciosamente las tools |
| 3 | Sin evento `meta` en `Conversation.stream` | Sin cost por ronda durante streaming agéntico |
| 4 | `feePct` no tipado en `ModelInfo` | Columna fee desaparece en `/modelos` |

Adicionalmente, 3 endpoints siguen sin estar expuestos por el SDK (`healthz`, `registerAgent`, `claimPlaygroundCredit`). Estos son **N/A para migración** — siempre tendrán que vivir en `RestApiClient` con `fetch` directo.

---

## Recap: lo que sí resolvió v2.1.0

Para entender qué falta, conviene reconocer qué se cerró. Estos puntos ya **no son bloqueadores**:

| Bloqueador histórico | Estado v2.1.0 | Evidencia |
|---|---|---|
| `chat.completions` sin `AbortSignal` externo | ✅ RESUELTO | `CompletionOptions.signal` (`index.d.ts:288-291`), propagado en `http.postWithMeta` y `http.postStream` |
| `chat.completions` sin acceso a headers | ✅ RESUELTO | `onMeta` callback en `CompletionOptions`, dispara con `meta.headers: Headers` |
| `reasoning` / `include_reasoning` / `tool_choice` sin tipar | ✅ RESUELTO | Tipados en `ChatCompletionParams` (`index.d.ts:238-240`) |
| `reasoning_tokens` ausente en `usage` | ✅ RESUELTO | `ChatUsage.reasoning_tokens?: number` (`index.d.ts:251`) |
| MCP filtraba items `image`/`resource` | ✅ RESUELTO | `normalizeContent` preserva los tres tipos (`index.js:203-219`) |
| MCP normalizations parciales (snake_case + magic byte sniffing para bloques tipados) | ✅ RESUELTO | `mime_type` alias y `sniffMimeType` (`index.js:207, 221-229`) — pero solo para bloques con `type: 'image'` ya declarado por el upstream |
| Acceso al `raw` del MCP result | ✅ RESUELTO | `McpToolResult.raw` expuesto (`index.d.ts:78`, `index.js:259`) |
| `Conversation` sin dedup `(toolName, args)` | ✅ RESUELTO | `seenThisRound = new Set<string>()` por ronda (`index.js:449-461, 567-583`) |
| `Conversation` sin image short-circuit | ✅ RESUELTO | Detecta `content.some(c => c.type === 'image')` y termina (`index.js:462-475, 605-622`) |
| `Conversation` sin fail-fast en error de tool | ✅ RESUELTO | `tools.call` lanza `LLM4AgentsError` y la `Conversation` no captura (`index.js:247-254, 595-603, 650-682`) |
| `Conversation.signal` no se propagaba a MCP fetch | ✅ RESUELTO | End-to-end: `Conversation` → `Tools.call` → `McpTransport.callTool` → `rpc` → `fetch` con `AbortSignal.any` |
| `models.list({ search })` no existía | ✅ RESUELTO | Server-side filter (`index.js:847-850`) |
| Wallets endpoints | ✅ RESUELTO | URLs coinciden (`/api/v1/balance/`, `/api/v1/wallets/generate`, `/api/v1/transactions/`) |
| Per-round cost en agentic | ⚠ PARCIAL | `onRoundMeta` callback en `Conversation.say` (`index.d.ts:361`), pero ausente en `Conversation.stream` |

---

## Gaps técnicos pendientes

### Gap 1 — JSON-in-text unwrap ausente en la normalización MCP

#### Estado en el SDK

`normalizeContent` (`/tmp/sdk-review/package/dist/index.js:203-219`) maneja correctamente:

```js
function normalizeContent(c) {
  if (c.type === "image") {
    const data = c["data"]
      ?? c["imageBase64"]
      ?? c["pngBase64"]
      ?? c["pdfBase64"]
      ?? "";
    const mimeType = c["mimeType"]
      ?? c["mime_type"]
      ?? sniffMimeType(data);
    // ...
  }
  // text branch
}
```

Esto cubre tres casos:
- Alias `mime_type` → `mimeType`.
- Magic-byte sniffing para imágenes sin MIME declarado (PNG `iVBO`, JPEG `/9j/`, GIF `R0lG`, WebP `UklG`, PDF `JVBE`).
- Claves alternativas para el base64 (`data`, `imageBase64`, `pngBase64`, `pdfBase64`).

**Pero estas normalizaciones SOLO se aplican cuando el bloque MCP ya viene con `type: "image"` o `type: "resource"`.** El parser `extractText` (`index.js:194-202`) no hace `JSON.parse` del contenido `text`:

```js
function extractText(c) {
  const raw = c["text"];
  if (typeof raw === "string") return raw;
  if (raw !== null && typeof raw === "object") {
    const wrapped = raw;
    return wrapped.text ?? "";
  }
  return "";
}
```

#### Lo que hace el playground hoy

`McpClient.normalizeMcpResult` (`src/infrastructure/mcp/McpClient.ts:107-175`) hace `JSON.parse` defensivo del campo `text` para detectar payloads envueltos:

```ts
// Pseudocódigo del comportamiento real:
if (item.type === 'text') {
  const parsed = tryParseJson(item.text)
  if (parsed?.imageBase64 || parsed?.pngBase64) {
    return { type: 'image', data: parsed.imageBase64 ?? parsed.pngBase64, mimeType: parsed.mimeType ?? 'image/png' }
  }
  if (parsed?.pdfBase64) {
    return { type: 'resource', resource: { mimeType: 'application/pdf', data: parsed.pdfBase64 } }
  }
  if (parsed?.text !== undefined) {
    return { type: 'text', text: parsed.text }  // analyze_image wrapper
  }
}
```

Esto es necesario porque varios servers MCP del backend devuelven el payload envuelto en JSON dentro de un bloque `text`, en lugar de usar `type: 'image'` o `type: 'resource'` directamente.

#### Casos del playground que rompe

| Caso de uso | Comportamiento actual | Comportamiento con SDK |
|---|---|---|
| Generar imagen en `/images` (`generate_image`, `edit_image`) | PNG renderizado inline + botón descarga | Bloque de texto con `{"imageBase64":"iVBORw0K…","mimeType":"image/png"}` crudo |
| Generar imagen vía agentic en `/chat` | Imagen renderizada en `AgenticBlock` + confirmación corta del agente | Imagen NO se muestra. El short-circuit del SDK (`#10`) no detecta `type: 'image'` porque el bloque sigue siendo `text` → loop continúa una ronda más → costo extra |
| Screenshot en `/scraper-oneshot` o `/scraper-sessions` | Preview PNG inline + descarga | `{"pngBase64":"iVBORw…","width":1280,"height":720}` como texto plano |
| PDF en `/scraper-oneshot` | `<iframe>` con el PDF + botón descarga | `{"pdfBase64":"JVBERi0…","pageCount":12}` como texto plano |
| `analyze_image` en `/images` o agentic | Solo se muestra `"Es un perro corriendo"` | Se muestra `{"text":"Es un perro corriendo","costCents":5}` con todo el wrapper visible al usuario |

#### Por qué bloquea la migración

Tres rutas completas (`/images`, `/scraper-oneshot`, `/scraper-sessions`) y el agentic loop con outputs visuales quedan **inservibles** para el usuario final. No es un edge case: son features centrales.

#### Mitigación posible

Reescribir `normalizeMcpResult` para correr **sobre `result.raw`** (que sí está expuesto desde v2.1.0). Costo: ~30 LOC. Pero esto significa que la normalización **no se elimina del playground** — solo se mueve. El argumento de "menos código a mantener" se debilita.

---

### Gap 2 — Sin fallback native↔prompt en `Conversation`

#### Estado en el SDK

`Conversation.say` (`index.js:411-415`) y `Conversation.stream` (`index.js:489-494`) pasan tools en formato OpenAI nativo y leen `tool_calls` del response:

```js
// say(...)
const response = await this.completions.create({
  model: this.model,
  messages,
  tools: toolDefs,
  tool_choice: "auto",
  // ...
}, this.signal);
// Si el modelo no soporta tools, response.choices[0].message.tool_calls
// queda undefined, el loop termina sin haber ejecutado ninguna tool.
```

No existe ninguna detección de "el provider rechazó tool calling" ni un path de fallback a JSON parsing desde texto.

#### Lo que hace el playground hoy

`runAgenticChat.ts:33-48` declara el whitelist de prefijos que sabe que soportan native:

```ts
const NATIVE_TOOL_PREFIXES: readonly string[] = [
  'openai/', 'anthropic/', 'google/gemini-', 'google/gemma',
  'meta-llama/llama-3', 'meta-llama/llama-4', 'mistralai/',
  'qwen/qwen', 'deepseek/', 'x-ai/grok', 'cohere/', 'nvidia/',
  'perplexity/', 'microsoft/',
]
```

Cualquier modelo fuera de esos prefijos arranca **directamente en prompt-mode** (parsea `{"tool_call":...}` desde el texto del modelo). Y para modelos DENTRO del whitelist, si el provider responde 400 con `tool_calls not supported`, hay auto-fallback (`runAgenticChat.ts:269-281`):

```ts
if (mode === 'native' && !hasFallenBack && step.providerMightNotSupportTools) {
  yield { kind: 'mode_fallback', from: 'native', to: 'prompt', reason: '...' }
  mode = 'prompt'
  hasFallenBack = true
  i -= 1
  continue
}
```

#### Casos del playground que rompe

| Modelo | Comportamiento actual | Comportamiento con SDK |
|---|---|---|
| `meta-llama/llama-2-7b-chat` (sin function calling) con Tools activado | Cae en prompt-mode automáticamente, parsea `{"tool_call":...}` del texto, ejecuta tools, responde con datos reales | El modelo responde texto plano sin `tool_calls`. `Conversation` termina la ronda 1. El user ve la respuesta del modelo desde su training data, no info actual |
| Modelo "soportado" pero el provider responde 400 "tools not supported" | Auto-fallback a prompt-mode, retry exitoso | Error 400 al usuario, ningún tool ejecutado |
| Cualquiera de los ~70 modelos open-source viejos del catálogo de 308 que no listan `function_calling` | Todos pasan por prompt-mode, funcionan con tools | Silenciosamente ignoran las tools, sin error claro al usuario |

#### Por qué bloquea la migración

El playground se vende como "podés probar la API con cualquier modelo del catálogo". Una migración que silenciosamente desactiva tools en un subconjunto significativo de modelos rompe esa promesa, y peor: **lo hace sin error visible**, así que el usuario no sabe por qué su pregunta agentic respondió con info desactualizada.

#### Mitigación posible

No hay forma limpia con el SDK actual. Las opciones son:
- **(a)** Envolver `Conversation` en un wrapper que detecte respuesta sin `tool_calls` cuando se esperaban, y caer en un loop manual con prompt-mode. Esto **reescribe efectivamente la mitad de `runAgenticChat`**.
- **(b)** Mostrar un warning al usuario cuando selecciona un modelo "no en el whitelist", indicando que las tools no funcionarán. Aceptar la limitación.

Ninguna mitigación es buena. Esta es la razón principal por la que `runAgenticChat` debería quedarse propio.

---

### Gap 3 — Sin evento `meta` en `Conversation.stream`

#### Estado en el SDK

El tipo `StreamEvent` (`index.d.ts:315-336`) declara una variante `{ type: 'meta', meta: ResponseMeta }`, pero `Conversation.stream` (`index.js:489-624`) **nunca la emite**:

```js
async *stream(message) {
  // ...
  for await (const chunk of this.completions.create({
    model: this.model,
    messages,
    tools: toolDefs,
    stream: true,
    // ❌ NO se pasa onMeta callback
    signal: this.signal,
  })) {
    // yields: 'reasoning', 'text', 'tool_start', 'tool_end', 'done'
    // pero NUNCA yields 'meta'
  }
}
```

`onRoundMeta` SÍ se invoca por ronda, pero solo en `Conversation.say` (`index.js:416-418, 684-700`). La rama de streaming no llama ese callback.

`ChatCompletions.create` (`index.js:347-349`) sí dispara `options.onMeta` una vez al iniciar el stream — pero `Conversation.stream` no le pasa esa opción.

#### Lo que hace el playground hoy

`runAgenticChat.ts` extrae `meta` de cada ronda intermedia y lo emite como parte del evento `final`. La capa `useAgenticChat` lo guarda y `CostBadge` lo muestra después de cada turno.

#### Casos del playground que rompe

| Caso | Comportamiento actual | Comportamiento con SDK + streaming |
|---|---|---|
| Pregunta agentic compleja (4-5 rondas) en streaming | CostBadge se actualiza al final con el total acumulado | Cero información de cost durante la ejecución. Si el usuario aborta a mitad, no sabe cuánto perdió |
| Modelos con thinking en agentic streaming | `reasoning_tokens` visibles en CostBadge al cerrar | Llegan solo en el evento `done`, no por ronda |
| Tracking de gasto en tiempo real (sandbox con dinero real) | Visible | No visible durante streaming |

#### Por qué bloquea la migración

El playground es un **sandbox con dinero real** (mainnet). Mostrar el costo en vivo es uno de los features distintivos. Migrar a `Conversation.stream` significa o bien:
- Renunciar al streaming agéntico (usar `say()` no-stream con `onRoundMeta`) — pierdes la sensación de "escribiendo en vivo".
- O renunciar al cost tracking durante streaming — pierdes transparencia.

Ambas opciones son visibles al usuario y degradan la UX que el producto vende.

#### Mitigación posible

Solo `say()` no-streaming con `onRoundMeta`. Es un trade-off de UX, no un fix.

---

### Gap 4 — `feePct` no tipado en `ModelInfo`

#### Estado en el SDK

`ModelInfo` (`index.d.ts:7-15`) tiene exactamente estos campos:

```ts
interface ModelInfo {
  readonly slug: string
  readonly displayName: string
  readonly provider: string | null
  readonly inputPricePer1M: number
  readonly outputPricePer1M: number
  readonly contextWindow: number
  readonly lastSyncedAt: string | null
}
```

No incluye `feePct`. El backend lo sigue mandando en runtime (es parte del JSON crudo), pero el SDK no lo tipa, así que TypeScript lo trata como inexistente.

#### Lo que hace el playground hoy

`Models.tsx:57` muestra el fee por modelo:

```tsx
{m.feePct !== undefined ? <> • fee {m.feePct}%</> : null}
```

Y `ModelInfoSchema` (`src/infrastructure/schemas/rest.ts:59`) lo valida con Zod como `z.number().optional()`.

Adicionalmente, el response de `/api/v1/models` incluye un `feePct` global (`rest.ts:82`) que es el default si el modelo no especifica uno.

#### Casos del playground que rompe

| Caso | Comportamiento actual | Comportamiento con SDK |
|---|---|---|
| Abrir `/modelos`, ver lista de 308 modelos | Cada modelo muestra `slug • in $0.30/1M • out $1.20/1M • fee 5%` | El `fee X%` desaparece (typed como undefined) |
| Cualquier cálculo futuro de "costo total con fee incluido" | Datos disponibles | Necesita `as any` o fetch directo |

#### Por qué bloquea la migración

Es **cosmético, no bloqueante absoluto**, pero es información que el usuario espera ver para decidir entre modelos similares. Esconderla por una limitación de tipado del SDK es regresión de feature.

#### Mitigación posible

- **(a)** `as any` puntual en `Models.tsx`. Funcional pero rompe type safety.
- **(b)** Mantener `listModels` con fetch directo solo para esta ruta. La página completa termina siendo una excepción al patrón "todo va por SDK".
- **(c)** Esperar a que el SDK tipe el campo.

---

## Endpoints que el SDK no expone (no son bloqueadores de migración)

Estos siempre tendrán que vivir en `RestApiClient` con `fetch` directo. No es un gap del SDK que vaya a cerrarse — son endpoints específicos del playground:

| Endpoint | Uso |
|---|---|
| `GET /healthz` | Botón "Health check" en `/ajustes` |
| `POST /api/v1/agents/register` | Registro de agentes nuevos en `/agentes` |
| `POST /api/v1/playground/claim` | Claim de 50¢ con Turnstile + GitHub OAuth |

---

## Análisis costo-beneficio de la migración total HOY

| Lo que se gana | Lo que se paga |
|---|---|
| ~80-100 LOC menos de transporte (wallets + chat completions no-stream) | +189 KB de bundle (significativo en web) |
| Auto-update cuando el SDK agrega endpoints o features | Adapter sobre `result.raw` para JSON-in-text (~30 LOC) — la normalización **no se elimina, se mueve** |
| Tipos del SDK como source of truth (sin Zod schemas duplicados) | Wrapper sobre `Conversation` para prompt-mode fallback (~80 LOC) — reescribe la mitad de `runAgenticChat` |
| Alineación con el ecosistema (mensaje "playground oficial usa el SDK oficial") | Capa nueva de traducción `LLM4AgentsError` → `RestError` |
| `tool_loop_limit` y otros códigos de error tipados | Riesgo de regresiones en features que hoy funcionan |
| | UX degradada en streaming agéntico (sin cost por ronda) |
| | Pérdida de `feePct` en `/modelos` (o `as any` que rompe type safety) |
| | Modelos sin native function calling silenciosamente sin Tools |

**Net técnico:** elimina ~150 LOC, añade ~110 LOC, bundle +189 KB, riesgo medio, beneficio funcional cero (todo lo que se migra ya funciona hoy).

---

## Recomendación

### No migrar al 100% todavía

Razones concretas:

1. **El playground HOY funciona.** La motivación técnica para tocar lo que funciona es débil cuando los gaps no son cerrables sin reescribir partes que ya están bien.

2. **La velocidad del SDK es buena.** v2.0.1 → v2.1.0 cerró 6 bloqueadores. Si v2.2 cierra Gap 1 (JSON-in-text unwrap o un hook de normalización custom) y Gap 4 (`feePct` tipado), la migración baja de "no recomendada" a "recomendada con caveats menores".

3. **Las mitigaciones no eliminan código.** Migrar y agregar adapters significa que el playground termina con **dos capas** (SDK + adapter) en vez de **una** (cliente custom). El argumento de "menos código a mantener" no se sostiene.

4. **Bundle cost es real.** +189 KB en una app web es un trade-off concreto.

### Migración parcial selectiva (si hay motivación de producto)

Si la decisión de migrar viene de producto/marketing (no técnica), avanzar con:

**Capa 1 — wins limpios (~40 LOC, sin pérdidas):**
- `wallets.balance/generate/transactions`
- `chat.completions.create` no-streaming

**Capa 2 — wins parciales (~40 LOC, con caveats):**
- `chat.completions.create` streaming single-shot (NO el agentic) — `onMeta` se dispara una vez al inicio, suficiente para el `CostBadge` en `/chat` sin Tools

**Lo que NO migrar (mantener custom):**
- `McpClient` completo
- `runAgenticChat`
- `listModels` (por `feePct`)
- `healthz`, `registerAgent`, `claimPlaygroundCredit` (no expuestos)

### Cuándo SÍ sería viable migrar 100%

Cuando el SDK cierre, en orden de importancia:

1. **Gap 1:** `JSON.parse` automático del campo `text` para detectar wrappers `{imageBase64,…}`, `{pngBase64,…}`, `{pdfBase64,…}`, `{text,costCents}`. O bien un hook `onContentNormalize?(c) => McpContent | undefined` que permita inyectar lógica custom de normalización antes de la promoción a `image`/`resource`.

2. **Gap 2:** Detección runtime de modelos sin native function calling, ya sea con un flag tipado en `ModelInfo.capabilities.functionCalling`, o con un fallback automático a JSON-in-text-prompt en `Conversation` cuando el response no trae `tool_calls`.

3. **Gap 3:** Emisión del evento `{ type: 'meta', meta: ResponseMeta }` en `Conversation.stream` por cada ronda intermedia. La infra ya está (el tipo existe), solo falta cablearlo.

4. **Gap 4:** Agregar `feePct?: number` a `ModelInfo`.

Si en una versión futura los 4 puntos se cierran, la migración total se vuelve trivial: ~150 LOC removidos, sin adapters, sin pérdida de features. Mientras tanto, **el costo de migrar supera al beneficio**.
