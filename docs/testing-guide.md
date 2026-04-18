# Guía de pruebas — llm4agents dashboard

Guía práctica para ejercitar la API de llm4agents desde el dashboard. Todas las llamadas cuestan **dinero real de mainnet**: seguí los montos sugeridos.

---

## Requisitos previos

1. El servicio del dashboard corriendo en `http://skywalker:4301` (`./scripts/dashboard-service.sh status`).
2. Al menos un **agente registrado** en `/agents` (botón *Register*).
3. Un **depósito acreditado** en `/wallet` (mínimo ~$1 USDT/USDC sugerido). Usá *Watch for deposit* mientras enviás.
4. Modelo por defecto: `google/gemini-2.5-flash-lite` (el más barato). No lo cambies para esta guía salvo que se indique explícitamente.

> **Costo estimado de toda la guía** con el modelo default:
> — Chat: ~$0.002–0.010 total (10 preguntas, respuestas breves)
> — Scraper: ~$0.01–0.05 total (depende del tier de proxy, `none` es el más barato)

---

## Parte 1 · Chat (`/chat`)

Cómo leer los resultados:
- **Burbuja del asistente** aparece tokens-por-token (streaming SSE funciona).
- **CostBadge** al final muestra `$x.xxxx · in: N · out: N · remaining: $x.xx` — verifica que input/output tokens y costo tengan sentido.
- **Balance** en la topbar debería bajar después de cada respuesta.
- Si pulsás *Stop* mientras stremea, debería cortar inmediatamente sin llegar al `done`.

### 10 preguntas para probar

Copiá y pegá tal cual. Están ordenadas de la más barata y simple a la que más estira el modelo.

1. **Test básico (1 token output esperado)**
   ```
   Say "pong" and nothing else.
   ```
   *Qué verificar:* respuesta corta, `tokens_output ≈ 1–3`, costo muy bajo.

2. **Español / idioma no-inglés**
   ```
   Explicá en dos oraciones qué es una función lambda en Python.
   ```
   *Qué verificar:* responde en español, sin reescribir la pregunta.

3. **Streaming visible**
   ```
   Count from 1 to 25, one number per line.
   ```
   *Qué verificar:* los tokens llegan progresivamente en la burbuja, no aparecen todos juntos. Probá el botón *Stop* a la mitad.

4. **Código con formato**
   ```
   Write a TypeScript function `fizzbuzz(n: number): string[]` that returns the fizzbuzz sequence up to n. Only the function body, no explanations.
   ```
   *Qué verificar:* bloque de código, sintaxis correcta, sin introducción.

5. **JSON estricto**
   ```
   Return ONLY valid JSON with this shape, no markdown fences, no prose:
   {"name": "...", "age": number, "hobbies": ["...", "..."]}
   Invent values for a fictional developer.
   ```
   *Qué verificar:* el output debería ser parseable con `JSON.parse`. Si agrega ```json ... ``` es un síntoma del modelo (intenta presionar diciendo "no markdown fences").

6. **Razonamiento numérico**
   ```
   A bat and a ball cost $1.10 in total. The bat costs $1.00 more than the ball. How much does the ball cost? Show the steps briefly.
   ```
   *Qué verificar:* respuesta correcta (`$0.05`) y razonamiento breve. Flash-lite a veces se equivoca — sirve para calibrar expectativas.

7. **Multi-turno (memoria de contexto)**
   Primero:
   ```
   My name is Ana and my favorite color is blue.
   ```
   Sin limpiar el chat, enviá después:
   ```
   What is my name and favorite color?
   ```
   *Qué verificar:* recuerda los datos del mensaje anterior (no los pierde entre requests, el dashboard envía todo el historial).

8. **Respuesta larga (probar streaming sostenido)**
   ```
   Write a 10-step runbook for debugging a flaky CI test, one step per line, each step <= 20 words.
   ```
   *Qué verificar:* streaming durante varios segundos, costo mayor que las pruebas cortas, `tokens_output` alto.

9. **Rechazo esperado**
   ```
   What is today's weather in Buenos Aires? If you don't have live data, say so explicitly in one sentence.
   ```
   *Qué verificar:* el modelo admite que no tiene acceso a datos en tiempo real. Sirve para ver cómo responde a límites conocidos.

10. **Traducción**
    ```
    Translate to Japanese (hiragana only, no kanji): "Where is the nearest train station?"
    ```
    *Qué verificar:* respuesta en hiragana puro, sin ruido. Útil para probar tokens no-ASCII.

### Cosas raras para reportar desde chat

- CostBadge queda en blanco → los headers `X-Cost-Usd-Cents` etc. no están llegando o el backend los cambió.
- Balance no baja tras completar → posible retraso del backend, hacer refresh manual en `/wallet`.
- "Stop" no corta el stream inmediatamente → revisar `AbortController` en la consola.
- El modelo no mantiene contexto en multi-turno → posible regresión en `Chat.tsx` (revisar que `messages` se manda completo).

### Chat agéntico · tool calling (Tools ON)

El header del chat tiene tres controles:

- **Selector de modelo** con filtro (escribí para buscar, click en un match).
- **Tools on/off** (on por default) — cuando está on, el modelo puede invocar tools MCP durante la conversación.
- **View tools 👁** — abre un popover con la lista completa de tools disponibles, agrupadas por categoría (Search / Web scraper), cada una con su costo por llamada.

Cómo se ve una respuesta agéntica:
1. Escribís tu pregunta y *Send*.
2. El bloque del asistente aparece con "Working… (iteration N)".
3. Si el modelo decide usar una tool, aparece un card colapsable con:
   - Icono de llave + nombre de la tool en monospace
   - Estado: *running* (spinner) → *done* (✓) o *failed* (✗)
   - Click para expandir y ver **Arguments** (JSON) y **Result** (texto devuelto por el MCP)
4. Puede llamar varias tools en paralelo dentro de una iteración, o una por iteración hasta que tenga suficiente info.
5. Cuando termina, devuelve la respuesta final como burbuja normal al final del bloque.
6. Hay un **cap de 5 iteraciones** — si no llega a respuesta final antes, aparece error sugiriendo simplificar la pregunta o desactivar tools.

Tools disponibles (mostradas en el popover View tools):

| Tool | Costo | Cuándo se usa |
|---|---|---|
| `google_search` | $0.0012 | Datos actuales, facts, URLs |
| `google_news` | $0.0012 | Noticias recientes con fecha |
| `google_maps` | $0.0012 | Lugares, address, rating |
| `fetch_html` | $0.0007 | HTML crudo de una página |
| `markdown` | $0.0010 | Artículos, docs como markdown |
| `links` | $0.0007 | Extraer links de una página |
| `extract` | $0.0012 | Campos estructurados con CSS |

**No incluidos** en chat agéntico: `screenshot`, `pdf` (el binario no se manda al modelo), `session_*` (stateful, no encaja en un loop corto de Q&A).

### 10 preguntas para probar el chat agéntico

Todas estas **deberían** disparar al menos una tool call. Si el modelo responde sin usar tools, puede ser que tenga respuesta cacheada o que estés usando un modelo que no soporte tool calling — probá con `google/gemini-2.5-flash-lite` (default).

1. **Búsqueda de datos live**
   ```
   What is the current price of Bitcoin in USD? Use a search tool to get the latest.
   ```
   *Esperado:* `google_search` o `google_news` con `q="bitcoin price usd"`, respuesta con precio actual y fuente.

2. **Noticias recientes**
   ```
   Give me the top 3 tech headlines from the last 24 hours.
   ```
   *Esperado:* `google_news` con `tbs=qdr:d`, lista de 3 con source + fecha.

3. **Búsqueda local**
   ```
   Find a good coffee shop near Puerto Madero, Buenos Aires. Give name, address, and rating.
   ```
   *Esperado:* `google_maps` con `q="coffee puerto madero"`, `gl=ar`, retorno con rating y address.

4. **Fetch de página + resumen**
   ```
   Summarize the homepage at https://news.ycombinator.com in 3 bullets.
   ```
   *Esperado:* `markdown` sobre la URL, luego el modelo escribe 3 bullets basados en el contenido.

5. **Extracción estructurada**
   ```
   Get the title and first 3 links from https://example.com
   ```
   *Esperado:* `fetch_html` o `markdown` + `links`, y respuesta estructurada.

6. **Comparación con múltiples búsquedas**
   ```
   Compare the latest official docs pages for React useState vs useEffect. Which has a more recent update?
   ```
   *Esperado:* dos `google_search` o un `google_batch_search`, luego respuesta comparativa.

7. **Razonamiento con data externa**
   ```
   What does the front page of the NYT say today about the US economy? One paragraph.
   ```
   *Esperado:* `markdown` o `fetch_html` sobre nytimes.com, luego síntesis.

8. **Chequeo de hecho**
   ```
   Is SpaceX's next launch confirmed for this week? Give me the source.
   ```
   *Esperado:* `google_news` + link a la fuente citada en la respuesta.

9. **Decline gracioso**
   ```
   What is 2 + 2?
   ```
   *Esperado:* **no** llama ninguna tool — responde directo "4". Útil para verificar que el modelo no abusa de las tools para cosas triviales.

10. **Multi-paso encadenado**
    ```
    Find the website for "Anthropic" and then extract the title of their homepage.
    ```
    *Esperado:* iteración 1 → `google_search q="anthropic"`, iteración 2 → `fetch_html` o `markdown` sobre anthropic.com, iteración 3 → respuesta con el título. 2–3 iteraciones visibles.

### Cosas para verificar con tools on

- **View tools popover**: abre y cierra con click / ESC / click fuera. Muestra 7 tools (3 search + 4 scraper). Cada una con costo y descripción.
- **Toggle Tools off**: desactivá y repetí la pregunta 1. Debería responder sin invocar tools (probablemente con info desactualizada o admitiendo que no la tiene).
- **Stop durante loop**: si el modelo se va en muchas iteraciones, click Stop → corta el loop (AbortController) y se ve el estado como error o parcial.
- **Costo por turno**: en `/transactions` filtrá por `usage`. Cada chat agéntico genera N+1 transacciones: una por cada iteración LLM y una por cada tool MCP.
- **Modelos sin tool calling**: cambiá a un modelo que no soporta tools (ej. algunos old-school) y enviá una pregunta. Debería devolver error 400 con mensaje del backend.

---

## Parte 2 · Scraper one-shot (`/scraper/one-shot`)

Cada tool se factura como un request MCP. Usá **Proxy tier: `none`** para todas estas pruebas — es gratis/barato y suficiente para sitios públicos.

| # | Tool | URL recomendada | Parámetros extra | Qué verificar |
|---|------|-----------------|------------------|---------------|
| 1 | `fetch_html` | `https://example.com` | — | Se muestra el `<!doctype html>` completo en la preview (~1 KB) |
| 2 | `fetch_html` | `https://news.ycombinator.com` | — | HTML más grande, se ve scroll en el `<pre>` |
| 3 | `markdown` | `https://en.wikipedia.org/wiki/Markdown` | — | Texto rendereado con headings y listas, sin tags HTML |
| 4 | `markdown` | `https://example.com` | `selector: h1` | Solo el título renderizado, no el párrafo |
| 5 | `links` | `https://news.ycombinator.com` | — | JSON con ~30 items `{href, text}` |
| 6 | `screenshot` | `https://example.com` | — | Imagen PNG inline de la página |
| 7 | `screenshot` | `https://github.com` | `selector: header` | Solo el header de GitHub |
| 8 | `pdf` | `https://example.com` | — | iframe con el PDF renderizado |
| 9 | `extract` | `https://news.ycombinator.com` | Selectors JSON: ver abajo | JSON con los valores extraídos |

### Selectors para la prueba 9 (`extract` en HN)

```json
{
  "top_title": ".titleline > a",
  "top_score": ".score",
  "subtext_user": ".hnuser"
}
```

*Qué verificar:* devuelve tres campos con texto del primer post. Si algún selector no matchea, ese campo vuelve vacío o con `null`.

### Pruebas de borde para one-shot

- **URL inválida**: poné `https://no-existe-este-dominio-12345.com` → debería volver error (timeout o DNS).
- **Proxy residential vs none**: el mismo `fetch_html` con `residential` debería costar más (mirá la respuesta MCP o las transacciones). Usá sitios que bloquean IPs de DC para ver la diferencia real.
- **Selectors vacíos en `extract`**: `{}` debería devolver objeto vacío sin error.
- **Copy result**: el botón copia el texto renderizado (markdown, HTML) en modo texto, y JSON en el resto de casos.

---

## Parte 3 · Scraper sessions (`/scraper/sessions`)

Las sesiones son navegadores persistentes. Cada acción (`goto`, `click`, `type`, etc.) se factura. Cerrar la sesión libera el worker.

### Flujo recomendado de prueba

1. **Crear sesión**
   - Proxy tier: `none`
   - Initial URL: `https://example.com`
   - Click *Create session* → aparece en *Active sessions* con ID y pill de tier.

2. **`session_status`**
   - Click *Status* en el card de la sesión.
   - *Qué verificar:* el JSON de resultado muestra `status: "active"`, `actions_count` ≥ 0, `expires_at` en el futuro.

3. **Acción `goto`**
   - Pegá en el editor JSON:
     ```json
     { "type": "goto", "url": "https://news.ycombinator.com" }
     ```
   - Click *Execute*.
   - *Qué verificar:* respuesta con `status: 200`, `url` final coincide con HN.

4. **Acción `wait_for`** (esperar un selector)
   ```json
   { "type": "wait_for", "selector": ".titleline > a", "timeout_ms": 5000 }
   ```
   *Qué verificar:* `{ "found": true }`.

5. **Acción `click`**
   ```json
   { "type": "click", "selector": "a.morelink" }
   ```
   *Qué verificar:* el worker clickea el link "More" y devuelve OK.

6. **Acción `type`** (cuando haya un input — ejemplo cargando una página con un search box)
   ```json
   { "type": "goto", "url": "https://duckduckgo.com" }
   ```
   después:
   ```json
   { "type": "type", "selector": "input[name=q]", "text": "llm4agents" }
   ```

7. **Acción `screenshot` dentro de la sesión** (si el backend lo soporta)
   ```json
   { "type": "screenshot" }
   ```

8. **Cerrar sesión**
   - Click *Close* en el card.
   - *Qué verificar:* la sesión desaparece de *Active sessions*, toast "Session closed".

### Pruebas de borde para sesiones

- **JSON mal formado en el editor** → toast/error "action must be JSON".
- **Acción inválida** como `{ "type": "dance" }` → error del backend con código JSON-RPC.
- **Dos sesiones simultáneas**: creá dos y ejecutá `goto` distinto en cada una — ambas deberían mantener estado independiente. El card muestra el resultado solo para la sesión correspondiente.
- **Refresh de la página**: las sesiones activas persisten porque el backend las mantiene; el dashboard las vuelve a listar. Los resultados de ejecución previos sí se pierden (eran estado local).

---

## Parte 4 · Search (`/search`)

Cuatro herramientas de búsqueda Google via Serper. **Costo fijo de $0.0012 por llamada**, excepto `Batch` que es `$0.0012 × N` (1–100 queries en una sola call).

### Parámetros comunes (todas las variantes)

| Campo | Tipo | Ejemplo | Descripción |
|---|---|---|---|
| `q` | string | `"best coffee NYC"` | Query (requerido, max 2048) |
| `gl` | 2 chars | `"us"`, `"ar"`, `"es"` | País |
| `hl` | 2–5 chars | `"en"`, `"es"`, `"pt-BR"` | Idioma |
| `tbs` | string | `"qdr:h"` / `"qdr:d"` / `"qdr:w"` | Rango de fecha |
| `page` | int | `1`, `2`, … | Paginación |
| `location` | string | `"Buenos Aires"` | Localización geográfica |

### Modo Web (`google_search`)

**Test 1 — consulta básica:**
- Query: `best restaurants in Buenos Aires`
- Advanced: `gl=ar`, `hl=es`
- *Esperado:* 10 cards con título (link azul clickeable), URL verde corta, snippet gris. Click en "Copy link" copia el href.

**Test 2 — paginación:**
- Query: `openai`
- Advanced: `page=2`
- *Esperado:* resultados distintos a la página 1.

**Test 3 — filtro de fecha:**
- Query: `kubernetes release`
- Advanced: `tbs=qdr:w` (última semana)
- *Esperado:* solo resultados recientes.

### Modo News (`google_news`)

**Test 4 — noticias del día:**
- Query: `bitcoin price`
- Advanced: `tbs=qdr:d`, `hl=en`
- *Esperado:* cards muestran fuente y "hace X horas". Si `tbs=qdr:h` solo trae noticias de la última hora.

**Test 5 — idioma localizado:**
- Query: `elecciones argentina`
- Advanced: `gl=ar`, `hl=es`
- *Esperado:* cards con medios argentinos (Clarín, La Nación, Infobae…).

### Modo Maps (`google_maps`)

**Test 6 — búsqueda local:**
- Query: `pizza palermo buenos aires`
- *Esperado:* grid de 2 columnas con cards: título, categoría en minúsculas arriba, address, rating con ★, teléfono clickeable (`tel:`), website y botón "Open in Maps" si hay lat/lng.

**Test 7 — filtro por location:**
- Query: `coworking`
- Advanced: `location=Mendoza, Argentina`
- *Esperado:* resultados de Mendoza incluso si no está en el `q`.

### Modo Batch (`google_batch_search`)

**Test 8 — 3 queries variadas:**
Agregá 3 filas:
1. `q=best restaurants in NYC`, `gl=us`
2. `q=weather forecast NYC`, `tbs=qdr:d`
3. `q=NYC subway map`

Click *Run google_batch_search*.
*Esperado:* 3 cards expandibles, cada una con su propio sub-listado y contador de "N results". Costo total: `$0.0036` (3 × $0.0012).

**Test 9 — batch grande (cuidar el gasto):**
- Generá 10 queries distintas (clonalas, poné temas variados)
- *Esperado:* ejecución en una sola request HTTP, costo `$0.012`. Verificá en `/transactions` que aparezca como UN solo cargo `usage` (no 10).

### Pruebas de borde para Search

- **Query vacío** → botón Run queda deshabilitado (no se dispara el request).
- **Batch con 100+ queries** → validación local te limita a `maxItems: 100`.
- **Código de país inválido** (ej. `gl=xyz`) → validación Zod local (max 2 chars) o error del backend si llega.
- **Sin resultados**: algunos `q` muy específicos retornan `results: []` → la UI muestra "No results." / "No places found."
- **Copy JSON** en el header de resultados descarga todo el payload (útil para debugging).

---

## Parte 5 · Verificaciones cruzadas

Después de ejercitar chat + scraper, abrí estas vistas:

- **`/` Home** — recent transactions debería listar los últimos cobros con tipo `usage`.
- **`/transactions`** — paginá por `usage` y revisá que los montos cuadren con lo gastado.
- **`/wallet`** — el balance bajó, `totalSpentUsd` subió.
- **`/settings` → Danger zone** — **NO la toques** a menos que quieras resetear el estado local. No borra datos del backend; solo el IndexedDB del navegador.

### Checklist rápido (marcá lo que haga falta)

- [ ] Chat: las 10 preguntas responden y el costo total es < $0.05
- [ ] Chat: `Stop` corta el stream
- [ ] Chat: contexto multi-turno se mantiene
- [ ] Scraper one-shot: los 9 casos devuelven preview correcta
- [ ] Scraper one-shot: botón *Copy result* copia contenido
- [ ] Scraper sessions: create → goto → status → close funciona sin errores
- [ ] `/transactions` lista todos los `usage` cobrados
- [ ] Badge de balance en topbar se actualiza

---

## Troubleshooting

| Síntoma | Causa probable | Acción |
|---|---|---|
| Balance no baja tras chat | Backend demora en liquidar | Refresh manual en `/wallet` |
| Chat muestra $0 lock | Balance quedó en 0 | Depositar más o esperar acreditación |
| Scraper devuelve validation error | Selector CSS mal / URL mal | Corregir JSON en el editor |
| "Copy" falla | Contexto no-HTTPS + browser bloquea Clipboard API | El fallback `execCommand('copy')` ya está — si igual falla, seleccioná manual desde el `<input>` del address/address |
| Modelo elegido no responde | Slug equivocado o modelo desactivado | Volver a `google/gemini-2.5-flash-lite` |
| Todo falla con 401 | API key revocada/expirada | Registrar nuevo agente en `/agents` |

## Rotación del servicio

Al hacer cambios de código, rebuildeá y reiniciá el servicio:

```bash
./scripts/dashboard-service.sh rebuild
```

Logs en vivo:

```bash
./scripts/dashboard-service.sh logs
```
