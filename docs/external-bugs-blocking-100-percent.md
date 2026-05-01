# Bugs externos que impiden el 100% del playground

**Fecha:** 2026-05-01
**Versión SDK auditada:** `@llmforagents/sdk@2.3.1`
**Backend auditado:** `https://api.llm4agents.com` y `https://mcp.llm4agents.com`
**Contexto:** tras la auditoría E2E con Playwright (`docs/playwright-test-report-2026-05-01.md`), 3 de 6 bugs detectados eran fixeables localmente — ya están resueltos en esta rama. Los **3 restantes** dependen del SDK o del backend. Este documento describe técnicamente qué cambiar en cada componente para llegar al 100%.

---

## Resumen ejecutivo

| Bug | Componente | Severidad | Fix size |
|---|---|---|---|
| **1. Tool message sin `tool_call_id` o `name`** | SDK `@llmforagents/sdk` | 🔴 BLOQUEANTE — rompe el agentic multi-round | ~10 líneas |
| **2. `analyze_image` Vision API empty response** | Backend `api.llm4agents.com` (proxy → Vision provider) | 🔴 BLOQUEANTE — feature inutilizable | desconocido (sin acceso) |
| **3. `edit_image` upstream 403 con Wikipedia** | Backend image fetcher (proxy → image provider) | 🟡 MENOR — workaround: usar URLs permisivas o base64 | ~5 líneas (cambio user-agent) |

Resolviendo **Bug 1** desbloquea el caso de uso más importante del playground (chat agentico con `google_search`/scraper/etc. multi-round). Es el **fix prioritario**.

---

## Bug 1 — SDK envía `role: "tool"` sin `tool_call_id` válido

### Síntoma observado en el playground

Cualquier prompt que requiera al modelo invocar una tool y luego responder en una segunda ronda **falla** con:

| Provider | Error visible al usuario |
|---|---|
| Google AI Studio (`google/gemini-2.5-flash-lite`) | `provider_error` upstream **400** — `"Tool message must have either name or tool_call_id"` |
| Anthropic (`anthropic/claude-haiku-4.5`) | `provider_error` upstream **500** Internal Server Error |

**Caso reproducible mínimo (con Playwright o curl):**
```
Modelo: google/gemini-2.5-flash-lite
Tools: ON
Prompt: "¿Quién ganó el Mundial de fútbol de 2022? Usá google_search y respondeme corto."
```

Resultado: la tool `google_search` se ejecuta correctamente (✓ "listo" en UI), pero la siguiente request al LLM con el resultado de la tool produce el 400.

**RequestIds capturados durante la auditoría** (para que el equipo del SDK pueda buscar trazas):
- Google: `05fa095f-110a-42ec-85b0-8f64def533d7`
- Anthropic: `177dfe8b-9a5f-4778-a312-a80cbeacc068`

### Causa raíz (verificada inspeccionando el código del SDK)

El SDK en `node_modules/@llmforagents/sdk/dist/index.js` construye el mensaje `role: "tool"` con `tool_call_id: toolCall.id` en **todos** estos puntos: líneas 599, 749, 761, 806, 815, 827, 891-895, 905-909.

**El problema es que `toolCall.id` puede llegar `undefined` o `null` desde el provider.** Cuando el modelo nativo (Google, ciertos modelos de Anthropic vía OpenRouter) responde con `tool_calls` que **no incluyen un `id`** (o que viene vacío), el SDK lo usa verbatim:

```js
// dist/index.js:531-534 (NATIVE mode — sin guard sobre id)
const assistantMessage = {
  ...choice.message,
  content: choice.message.content ?? ""
};
this.history.push(assistantMessage);   // ← tool_calls llevan id posiblemente undefined
```

Después, en `executeToolCall`:
```js
// dist/index.js:905-909
this.history.push({
  role: "tool",
  content: result.text,
  tool_call_id: toolCall.id   // ← undefined → omitido por JSON.stringify
});
```

`JSON.stringify({ tool_call_id: undefined })` produce `{}` (omite el campo). El payload enviado al backend en la siguiente ronda contiene un mensaje `{ role: "tool", content: "..." }` **sin** `tool_call_id` ni `name` → Google rechaza con 400, Anthropic con 500.

Curiosamente, **en prompt-fallback mode el SDK ya hace lo correcto** (`dist/index.js:469-473`):
```js
calls.push({
  id: `${idPrefix}_${idx}`,   // ← genera id sintético "pmpt_0", "pmpt_1", …
  type: "function",
  function: { name, arguments: argsString }
});
```

La asimetría entre los dos paths es exactamente el bug.

### Fix propuesto al SDK (mínimamente invasivo)

**Opción A — normalizar `tool_calls` apenas llegan del provider** (preferida, una sola intervención):

```js
// dist/index.js — alrededor de la línea 531
const assistantMessage = {
  ...choice.message,
  content: choice.message.content ?? "",
  ...(choice.message.tool_calls ? {
    tool_calls: choice.message.tool_calls.map((tc, i) => ({
      ...tc,
      id: tc.id || `auto_${roundCount}_${i}_${Date.now()}`
    }))
  } : {})
};
this.history.push(assistantMessage);
```

Aplicar el mismo patrón en `dist/index.js:703` (segundo bloque equivalente para el flujo de streaming agentico).

**Opción B — defense in depth: agregar `name` como fallback en el mensaje `role: "tool"`** (compatible con OpenAI spec; Google y algunos providers lo aceptan cuando `tool_call_id` falla):

```js
// Cada construcción del role:"tool" mensaje:
this.history.push({
  role: "tool",
  content: result.text,
  tool_call_id: toolCall.id,
  name: toolCall.function.name   // ← campo adicional, deprecated en OpenAI v2 pero ampliamente aceptado
});
```

**Recomendación:** aplicar **A + B** juntas. A es la corrección estructural; B es seguro de red contra otras inconsistencias del provider.

### Tests sugeridos para acompañar el fix

Crear en `@llmforagents/sdk` los siguientes casos (vitest o jest):

```ts
describe('Conversation', () => {
  it('synthesizes id when provider returns tool_call without id', async () => {
    const fakeProvider = {
      respond: () => ({
        choices: [{ message: {
          role: 'assistant',
          content: '',
          tool_calls: [{ /* note: no id */ type: 'function', function: { name: 'search', arguments: '{}' } }]
        }}],
        usage: { prompt_tokens: 1, completion_tokens: 1 }
      })
    }
    const conv = new Conversation(fakeProvider, { /* ... */ })
    await conv.send('hello')
    const lastToolMsg = conv.history.find(m => m.role === 'tool')
    expect(lastToolMsg?.tool_call_id).toBeDefined()
    expect(lastToolMsg?.tool_call_id).toMatch(/^auto_/)
  })

  it('matches synthesized id between assistant.tool_calls[i].id and tool.tool_call_id', async () => {
    // ... build conversation, run round, assert IDs match
  })
})
```

### Verificación end-to-end después del fix

Una vez publicado un SDK ≥ 2.3.2 con esta corrección:

```bash
cd playground-llm4agents
npm i @llmforagents/sdk@latest
npm run build
systemctl --user restart llm4agents-dashboard
# Repetir el caso reproducible:
#   Modelo: google/gemini-2.5-flash-lite, Tools ON
#   Prompt: "¿Quién ganó el Mundial de fútbol de 2022? Usá google_search."
# Resultado esperado: una respuesta de texto citando "Argentina", sin errores 400/500.
```

### Workaround temporal en el playground (NO aplicado, requeriría parche al SDK en patch-package)

Mientras el fix del SDK no exista, el playground no puede compensar este bug porque la conversación del SDK es opaca — `client.chat.conversation()` administra `history` internamente y no expone hooks para reescribir los mensajes antes del POST.

Posible mitigación en el playground si urge: usar `patch-package` para parchear `node_modules/@llmforagents/sdk/dist/index.js` con la opción A. No recomendado a largo plazo (pierde la actualización al primer `npm i`).

---

## Bug 2 — `analyze_image` devuelve "Vision API returned empty response"

### Síntoma observado

| Vía | URL | Resultado |
|---|---|---|
| Standalone (`/images` → Analizar) | `https://upload.wikimedia.org/wikipedia/commons/.../280px-PNG_transparency_demonstration_1.png` | `Upstream error 502 — "Vision API returned empty response"` |
| Standalone con otra URL pública (ej. `picsum.photos`) | URL JPEG 512×512 | mismo error |
| Agentic (chat con Tools ON, prompt "analizá esta imagen \<URL\>") | cualquier URL | mismo error |

El backend devuelve **502 Bad Gateway** y el detalle es estructurado:
```json
{
  "error": "upstream_error",
  "message": "Vision API returned empty response",
  "details": { "upstream_status": 502 }
}
```

### Hipótesis (sin acceso al backend)

El error textual sugiere que el servicio del playground hace una request al provider de Vision (probablemente OpenRouter, OpenAI Vision, Google Cloud Vision, o similar) y el provider responde con cuerpo vacío o estructura no esperada. Posibles causas:

1. **El provider rechaza el formato del payload** (modelo deprecated, parámetro `image` malformado, MIME no soportado) y devuelve 200 con body `""` o `{}`.
2. **Timeout silencioso** en el cliente HTTP del backend al provider, retornando "" en lugar de error.
3. **API key del provider expirada o sin cuota**, con respuesta vacía en lugar del 401/429 esperado.

### Investigación recomendada al equipo del backend

1. Logs del servicio MCP (`mcp.llm4agents.com`) para el endpoint que implementa la tool `analyze_image` — capturar el cuerpo crudo de la response del provider para una request de prueba.
2. Verificar API key del provider de Vision y que el modelo configurado siga vigente.
3. Validar el `Content-Type` y el shape del payload enviado al provider — algunos requieren `image_url` como objeto `{ url: "...", detail: "auto" }`, no string plano.
4. Reproducir manualmente con `curl` directo al provider (no al proxy) para aislar el bug entre proxy ↔ provider.

### Verificación E2E después del fix

```
Vía: /images → Analizar
Pregunta: "¿Qué animal aparece en la imagen?"
Imagen: https://picsum.photos/seed/test/512/512
Resultado esperado: respuesta de texto del modelo describiendo la imagen.
```

---

## Bug 3 — `edit_image` retorna 403 al fetchear ciertas URLs externas

### Síntoma observado

| URL fuente | Resultado |
|---|---|
| `https://upload.wikimedia.org/wikipedia/commons/...` | `Upstream error 502 — "Image edit failed: prediction_failed — 403 Client Error: Forbidden for url: ..."` |
| `https://picsum.photos/seed/picsum/512/512` | ✓ funciona, devuelve PNG editado |
| `data:image/png;base64,iVBOR...` (data URI) | ✓ funciona |

### Causa raíz probable

El backend del provider de imagen (probablemente Replicate o un servicio similar) hace `requests.get(url)` para obtener la imagen fuente antes de procesarla. El **403 viene de Wikimedia/Wikipedia**, no del provider — Wikimedia bloquea agentes que no envían un `User-Agent` realista (es política documentada para evitar abuse de su CDN).

### Fix propuesto al backend image fetcher

En el código del proxy o del provider que descarga la URL antes de pasarla al modelo de edición, agregar un user-agent realista:

```python
# Ejemplo (Python/requests)
HEADERS = {
    "User-Agent": "LLM4AgentsProxy/1.0 (https://llm4agents.com; bot@llm4agents.com)",
    "Accept": "image/*"
}
response = requests.get(image_url, headers=HEADERS, timeout=10, allow_redirects=True)
response.raise_for_status()
```

Wikimedia documenta su [política de user-agent](https://meta.wikimedia.org/wiki/User-Agent_policy): rechazan requests sin user-agent o con user-agents genéricos como `python-requests/2.x`.

Alternativa más robusta: descargar la imagen **dentro del proxy** del backend (con UA correcto) y pasarla al provider como base64 en vez de URL. Eso elimina la dependencia del provider para hacer el fetch externo.

### Verificación E2E después del fix

```
Vía: /images → Editar
URL: https://upload.wikimedia.org/wikipedia/commons/4/47/PNG_transparency_demonstration_1.png
Instrucción: "remove the background"
Resultado esperado: PNG editado, sin error 403.
```

---

## Una vez resueltos los 3 bugs

El playground llegará al **31/31 escenarios pasando** según la auditoría documentada en `docs/playwright-test-report-2026-05-01.md`. Los 3 fixes ya aplicados localmente (Bug 3, 4, 6 según la numeración del reporte) más estos 3 externos cubren el 100% del comportamiento esperado.

Re-ejecutar la auditoría con Playwright es directo: levantar el servicio, registrar el agente, correr los 31 casos. Tiempo estimado: ~15 min.

---

## Apéndice — referencias cruzadas

- Reporte E2E completo con screenshots y network captures: `docs/playwright-test-report-2026-05-01.md`
- Reporte previo (auditoría 2026-04-30 contra SDK 2.3.0): `docs/sdk-migration-test-report.md`
- Fixes ya aplicados (esta rama `fix/playground-bugs-3-4-6`):
  - `204cada` — fix(stream): derive token meta from SSE usage chunk as fallback
  - `264fff6` — fix(mcp): normalise mcpUrl to always end in /mcp
  - `5f225a1` — fix(agentic): forbid fabricating image URLs across turns
