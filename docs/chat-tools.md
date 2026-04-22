# Tools del chat — cuáles están, cuáles no, y por qué

El objetivo principal del playground es **poder probar la mayor cantidad posible de capacidades del API desde un solo prompt del chat.** El loop agéntico puede invocar tools MCP en mitad de la conversación para que un mensaje en lenguaje natural ejercite búsqueda, scraping o generación de imágenes sin que el usuario salga de la ruta `/chat`.

Fuente de verdad en el código: [`src/domain/chatTools.ts`](../src/domain/chatTools.ts) — un `ChatToolDef` por cada tool registrada, con su schema de función OpenAI, costo estimado y nombre MCP. **Cualquier cosa que no esté ahí NO se puede llamar desde el chat.**

## Vista rápida

| Tool | Categoría | ¿En el chat? | Costo | Por qué / por qué no |
|---|---|:---:|---|---|
| `google_search` | search | ✅ | $0.0012 | Texto entra, texto sale. Encaja con un turno. |
| `google_news` | search | ✅ | $0.0012 | Igual. |
| `google_maps` | search | ✅ | $0.0012 | Igual. |
| `google_batch_search` | search | ❌ | $0.0012/query | Array de hasta 100 queries — no coincide con la forma de un prompt conversacional. Usá `/search`. |
| `fetch_html` | scraper | ✅ | $0.0007 | Devuelve texto; calza con el loop agéntico. |
| `markdown` | scraper | ✅ | $0.0010 | Devuelve texto. |
| `links` | scraper | ✅ | $0.0007 | Lista JSON, suficientemente chica para el contexto. |
| `extract` | scraper | ✅ | $0.0012 | Output JSON estructurado. |
| `screenshot` | scraper | ❌ | $0.0010 | Devuelve ~100–300 KB en base64 PNG; meterlo al contexto del chat es desperdicio y el modelo de texto no lo puede interpretar visualmente. Usá `/scraper/one-shot`. |
| `pdf` | scraper | ❌ | $0.0012 | Devuelve ~30 KB+ de PDF base64; los LLMs de texto no lo pueden parsear. Usá `/scraper/one-shot`. |
| `session_create` | session | ❌ | incluido | Stateful — requiere un lifecycle multi-paso (create / exec / close) que no mapea a un solo turno. Usá `/scraper/sessions`. |
| `session_exec` | session | ❌ | variable | Depende de un `session_id` vivo que vino de un create previo. |
| `session_status` | session | ❌ | — | Misma restricción de lifecycle. |
| `session_close` | session | ❌ | — | Igual. |
| `generate_image` | image | ✅ | $0.01–$0.02 | Short-circuit: el PNG se renderiza inline en la tool card. |
| `edit_image` | image | ✅ | $0.02 | Short-circuit; mismo camino de render. |
| `analyze_image` | image | ✅ | $0.006 | Respuesta en texto; short-circuit. |

**Registradas en el chat: 10.** No registradas: 7 (sessions × 4, `screenshot`, `pdf`, `google_batch_search`).

## Tools disponibles en el chat

### Search (3)

El modelo las invoca cuando el usuario pregunta por eventos actuales, datos o cualquier cosa sensible al tiempo.

- `google_search` — resultados web orgánicos. Lo mejor para preguntas generales de "qué es / cuándo fue".
- `google_news` — artículos recientes. El modelo suele combinarlo con `tbs=qdr:d` para "de hoy".
- `google_maps` — lugares, direcciones, lat/lng, rating, teléfono, sitio web. Se dispara para preguntas tipo "encontrá X cerca de Y".

Las tres aceptan `q`, `gl` (país), `hl` (idioma), `tbs` (filtro temporal), `page`, `location`.

### Scraper — devuelve texto (4)

El modelo puede leer páginas específicas y devolver data estructurada.

- `fetch_html` — HTML crudo. Usá cuando el usuario pide markup literal (ej. *"qué tag tiene el encabezado principal en X"*).
- `markdown` — texto legible. Default óptimo para *"resumime este artículo"*.
- `links` — todos los links de la página. Útil para *"listame los links de X"*.
- `extract` — scraping por selectores CSS. El modelo arma el objeto `selectors` a partir del pedido del usuario.

Cada una toma una `url` y opcionalmente `proxy_tier` (`none` / `datacenter` / `residential`). El modelo deja `proxy_tier` en `none` por default a menos que el usuario insinúe bloqueo (*"usá proxy residencial"*).

### Image (3)

Las tres usan short-circuit al tener éxito — la imagen o el texto ES la respuesta, no corre un chat.completion de síntesis.

- `generate_image` — texto a PNG. Parámetros: `prompt` (requerido), `width`, `height` (512–2048, default 1024).
- `edit_image` — modificar imagen existente con una instrucción. Parámetros: `prompt`, `image` (URL o data URI), `aspect_ratio` (enum).
- `analyze_image` — visión / OCR / caption. Parámetros: `prompt`, `image`. Devuelve texto plano que aparece como respuesta final del asistente.

## Tools deliberadamente FUERA del chat

### Sesiones stateful (4 tools)

`/scraper/sessions` expone `session_create`, `session_exec`, `session_status`, `session_close`. Necesitan un lifecycle:

```
create  → devuelve session_id
exec    → N llamadas con ese session_id (goto, click, fill, extract...)
close   → libera el browser
```

Un turno de chat es one-and-done. No hay forma de mantener una sesión "abierta" para el próximo mensaje sin romper el cost guard de una-tool-por-turno y sin introducir estado persistido entre turnos. El tradeoff no vale la pena porque la UI de `/scraper/sessions` está diseñada exactamente para este patrón.

Si alguna vez se quiere meter esto al chat, los cambios requeridos son importantes:
- Persistir los `session_id` entre turnos (Zustand + cleanup).
- Relajar el cost guard para permitir varios `session_exec` encadenados en una misma corrida, con otro cap (ej. 5 pasos de sesión por turno).
- Mecanismo para desambiguar cuando el usuario tiene varias sesiones abiertas.

### Contenido binario (`screenshot`, `pdf`)

Ambas devuelven payloads base64 de 30–300 KB. Meter eso al contexto del chat como tool result:

- Cuesta muchos tokens — el siguiente chat.completion lee el blob entero como input.
- El modelo no puede usarlo. Los LLMs de texto no decodifican PNGs (usá `analyze_image` si necesitás visión sobre una captura) y no leen PDFs.

Camino práctico: pedí `markdown` para el texto de la página, o tomá el screenshot desde `/scraper/one-shot` vos mismo.

### `google_batch_search`

El input es un array de hasta 100 objetos `{q, gl, hl, …}`. Caso de uso válido (queries comparativos en paralelo) pero no es patrón conversacional — un prompt único rara vez se traduce a *"corré estas 100 queries en paralelo"*. `/search` tiene una tab batch dedicada para esto.

### Endpoints REST (no son tools MCP)

Los siguientes endpoints REST están **intencionalmente** sin registrar como tools del chat:

- `POST /v1/tx/send` — mueve plata real en Polygon. Requiere intención explícita del usuario (un click en `/tx`), nunca una llamada autónoma del modelo. Para meterlo al chat habría que agregar diálogo de confirmación, cap por valor de tx, y una categoría distinta de cost-guards.
- `POST /api/v1/wallets/generate` — crea direcciones de depósito. Estado local por agente; el usuario inicia desde `/wallet`.
- `GET /api/v1/balance` / `/models` / `/transactions` — endpoints informativos de sólo-lectura. Que el modelo le pregunte a su propio API por el saldo del usuario en mitad de un turno agrega costo sin aportar UX respecto a mirar directamente el topbar o las rutas dedicadas.

## Protecciones de costo alrededor de las chat tools

Tres guards previenen cobros descontrolados cuando el modelo entra en loop:

1. **Una tool por turno.** Después de la primera tool call exitosa en una corrida, cualquier segundo `tool_call` aborta la corrida (ver `runAgenticChat.ts` → cost guard 0).
2. **Dedup por args iguales.** Recalls idénticos (misma tool + mismos args, éxito o falla) devuelven el resultado cacheado sin volver a llamar al MCP.
3. **Short-circuit en image.** Después de una tool de imagen exitosa, la corrida termina inmediatamente; no se dispara chat.completion de síntesis. La imagen o texto ya está visible en la tool card.

Defaults: `maxIterations = 3`, cap duro de 3 llamadas MCP reales por corrida.

## Checklist para agregar una tool nueva al chat

1. Confirmar que la tool devuelve **output de tamaño texto** (< 10 KB serializado).
2. El output debe **valer por sí solo como respuesta** (sin requerir post-procesamiento pesado).
3. Agregar un `ChatToolDef` en `src/domain/chatTools.ts`:
   - `mcpName`
   - `category` — reusar `search` / `scraper` / `image` o agregar una nueva
   - `costPerCall` — label para el ToolsViewer
   - Schema de función OpenAI **matcheando EXACTAMENTE la schema que devuelve `tools/list` del MCP** (nombres de parámetros, tipos, enums)
4. Actualizar el fuzzy matcher en `findChatTool()` si la tool tiene aliases comunes que el modelo podría inventar.
5. Si la tool es terminal (su output ES la respuesta final, como la categoría image), agregar la categoría al path de short-circuit en `runAgenticChat.ts`.
6. Agregar un schema Zod de parámetros en `src/infrastructure/schemas/mcp.ts` → `TOOL_PARAM_SCHEMAS` para que la validación del boundary atrape llamadas mal formadas.
7. Agregar la tool al grupo correspondiente en `src/presentation/components/ToolsViewer.tsx` para que el popover "View tools" se mantenga actualizado.
8. Si la respuesta del MCP tiene una shape rara (JSON anidado, snake_case), extender `normalizeMcpResult` en `src/infrastructure/mcp/McpClient.ts` y agregar un test en `tests/infrastructure/mcp-normalize.test.ts`.
