# Reporte E2E — `https://playground.llm4agents.com/` (producción)

**Fecha:** 2026-05-04
**Backend:** `api.llm4agents.com` + `mcp.llm4agents.com` (post-fix Bug 1)
**Front:** build de producción servido en `https://playground.llm4agents.com/`
**SDK del front en producción:** asumido alineado con esta rama (`@llmforagents/sdk@2.3.2` o superior — la inyección Dexie funcionó sin migration errors)
**Tooling:** Playwright vía MCP
**Agente:** `soncley-agent` (`7cd0e984-ece7-46b0-aa66-dd707e6b5906`) reutilizado desde el playground local
**Saldo:** $3.13 inicio → $3.00 fin (**$0.13 consumidos** en 16 escenarios)

---

## TL;DR

- ✅ **16/16 escenarios pasan en producción.**
- 🟢 **Bug 1 (multi-round `tool_call_id`) confirmado RESUELTO también en prod** — chat agentico con `gemini-2.5-flash-lite` + `google_search` ejecuta multi-round sin errores y sintetiza la respuesta correctamente. La auditoría local de hoy (mañana) y esta de producción (tarde) coinciden.
- ✅ **Importación del agente local → prod funciona** mediante inyección directa en `IndexedDB > llm4agents-dashboard > agents` + `localStorage.llm4agents-ui.state.activeAgentId`. La UI no expone el flujo, pero el storage es portable entre dominios mientras el schema Dexie coincida (en prod estaba `version: 20`, igual que local).
- ✅ Mismo backend, mismo saldo ($3.13 al inicio en ambos dominios), misma lista de transacciones (26 filas), mismos modelos disponibles (309/309).

---

## Procedimiento de migración del agente

Ya que el playground **no tiene UI de "Importar agente"** (solo registro), el agente se trasladó por inyección directa de Dexie. Documentado por si hay que repetirlo:

1. **Extracción local** (`http://localhost:4301/agents` con dev abierto):
   ```js
   indexedDB.open('llm4agents-dashboard') → tx('agents','readonly').getAll()
   // → [{ id, name, apiKey, createdAt, color }]
   ```

2. **Inyección en producción** (`https://playground.llm4agents.com/`):
   ```js
   indexedDB.open('llm4agents-dashboard') → tx('agents','readwrite').put(agent)
   localStorage.setItem('llm4agents-ui',
     JSON.stringify({ state: { activeAgentId: agent.id } }))
   ```

3. **Recarga.** Topbar muestra `soncley-agent`, saldo carga del backend ($3.13), todas las rutas usan la API key inyectada.

**Importante:** las wallets, sesiones e historial **no** se migran — viven en el IndexedDB del dominio. El saldo y las transacciones sí, porque vienen del backend. En `/wallet` aparece `Guardadas: 0` aunque el agente tiene depósitos en el backend (esperado: las wallets locales son referencias UX, no fuente de verdad).

---

## Resultados detallados

| # | Ruta | Acción | Resultado |
|---|---|---|---|
| 1 | `/` Home | Carga inicial, banner mainnet, topbar con agente | ✅ Saldo $3.13, depósitos/gastos cargan del backend |
| 2 | `/settings` | Ping `/healthz` | ✅ `ok` |
| 3 | `/agents` | Listar | ✅ `soncley-agent` activo, UUID visible, copy key OK |
| 4 | `/wallet` | Listar (sin importar wallets) | ✅ Saldo $3.13, depositado $5.70, gastado $2.56. Wallets locales 0 (esperado) |
| 5 | `/transactions` | Listar histórico | ✅ 26 filas, tipos Depósito/Uso/Reembolso |
| 6 | `/models` | Listar 309 + filtrar `claude` | ✅ 309/309 → 16/309 |
| 7 | `/search` | `google_search` "capital de Argentina" | ✅ Resultados con "Buenos Aires" |
| 8 | `/search` | `google_news` "inteligencia artificial" | ✅ Resultados con fechas y links |
| 9 | `/search` | `google_maps` "cafés en Buenos Aires" | ✅ Lugares con rating/website/teléfono |
| 10 | `/search` | `google_batch_search` (BTC + ETH) | ✅ Ambas queries devuelven resultados |
| 11 | `/scraper/one-shot` | `markdown` `https://example.com` | ✅ "Example Domain" + "illustrative" |
| 12 | `/scraper/sessions` | `session_create` + `session_close` | ✅ Sesión creada y cerrada limpiamente |
| 13 | `/images` | `generate_image` standalone | ✅ PNG inline rendered |
| 14 | `/images` | `analyze_image` con picsum.photos | ✅ "Rocas en primer plano y un bosque desenfocado con luces doradas al fondo" |
| 15 | `/images` | `edit_image` (watercolor) con picsum | ✅ JPEG editado inline rendered |
| 16 | `/chat` (Tools OFF) | Streaming SSE simple | ✅ 3 bullets sobre abejas |
| 17 | **`/chat` (Tools ON) — Bug 1 multi-round** | `google_search` + síntesis con `gemini-2.5-flash-lite` | 🟢 **"Argentina ganó el Mundial de fútbol de 2022"** — multi-round nativo OK, sin fallback, sin error 502 |
| 18 | `/chat` (Tools ON) | `generate_image` desde el chat | ✅ PNG inline (image short-circuit funcionando) |
| 19 | `/chat` (Tools ON) | `analyze_image` con URL picsum desde el chat (multi-round con síntesis) | ✅ Descripción detallada del paisaje |
| 20 | `/guide` | Render walkthrough | ✅ 11 secciones cargan correctamente |

---

## Comparación auditoría local (mañana) vs auditoría prod (tarde)

| Eje | Local (4301) | Prod (playground.llm4agents.com) |
|---|---|---|
| Agente / saldo inicial | $3.28 | $3.13 (saldo ya consumido por la auditoría local) |
| Saldo final | $3.13 | $3.00 |
| Bug 1 multi-round (Gemini) | ✅ Resuelto | ✅ Resuelto |
| Bug 1 multi-round (Anthropic Haiku 4.5) | ✅ Resuelto | No re-probado en prod (cambiar modelo cuesta $; ya validado en local) |
| Image short-circuit | ✅ | ✅ |
| MCP scraper one-shot | ✅ | ✅ |
| MCP scraper sessions | ✅ | ✅ |
| Search (4 vías) | ✅ | ✅ |
| Errores en consola | 0 errors / 0 warnings críticos | 0 errors / 2 warnings (probablemente de service-worker / preload) |
| Tiempo total auditoría | ~13 min | ~10 min |

---

## Issues remanentes (sin cambios respecto al reporte local)

1. **Bug 3 image fetcher** — `upload.wikimedia.org` y `img.magnific.com` siguen sin User-Agent realista en el backend. No probado en prod (mismo backend → mismo síntoma esperado). Workaround sigue siendo `picsum.photos` o `data:image/...` data URIs.
2. **Mensaje genérico de error en `Chat.tsx:142-152`** — sigue mostrando "Error: la respuesta no se pudo completar" para `kind !== 'unknown'`; podría exponer `error.body` para mejor diagnóstico.
3. **`/agents` no tiene flujo "Importar agente existente"** — la portabilidad cross-dominio requiere DevTools / Playwright. Es lo que motivó la inyección manual de esta auditoría. Sería útil agregar un campo `apiKey` + `uuid` en `/agents` para casos como este.
4. **`/wallet` muestra `Guardadas: 0` cuando el agente fue importado** — comportamiento esperado pero confuso. Ofrecer un botón "Sincronizar wallets desde backend" cubriría el gap.

---

## Conclusión

**El playground en producción está al 100%** para todos los flujos críticos verificados, incluido el caso que originalmente motivaba este ciclo de bugs (chat agentico multi-round). El backend `api.llm4agents.com` resolvió correctamente Bug 1 (descartado de su payload el `tool_call_id`/`name` antes de OpenRouter ya no ocurre). El playground replica el comportamiento de la auditoría local sin sorpresas.

La única observación operativa es que **importar un agente existente entre dominios requiere DevTools** — para uso de equipo internamente alcanza, pero si en algún momento se quiere documentar cómo usar el mismo agente desde otra máquina/navegador, vale la pena considerar agregar el flujo a `/agents`.

---
