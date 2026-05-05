# Feature Spec — Modo "Council" en `playground-llm4agents`

> **Para:** Claude Code (o quien implemente)
> **Branch base:** `main`
> **Tipo:** feature nueva, additive (no toca ningún flow existente)
> **Estimado:** ~250–400 líneas TS distribuidas en 6–8 archivos nuevos + ediciones quirúrgicas a 4 archivos existentes
> **Sin dependencias npm nuevas, sin cambios al SDK, sin cambios al backend.**

---

## 0. Contexto rápido (para vos, implementador)

El playground es un dashboard React/TS que ejerce la API de `llm4agents.com`. El proyecto tiene Clean Architecture (`domain` / `application` / `infrastructure` / `presentation` / `composition`), TypeScript estricto, branded types, discriminated unions, `Result<T, E>`, Zod solo en boundaries, ESLint con `no-floating-promises` y `no-explicit-any` como **error**, y guardrails de costo estrictos porque mueve dinero on-chain.

Este feature **no usa ningún repo externo**. Implementa el patrón "LLM Council" (drafts paralelos con N modelos → critique cruzado anonimizado → synthesis por un chairman) **encima del SDK existente** (`@llmforagents/sdk@2.3.2`), pasando por `api.llm4agents.com` como cualquier otra request, y por lo tanto respetando billing on-chain del agente.

Antes de implementar, leé:
- `src/application/runAgenticChat.ts` — patrón generador `async function*` + eventos discriminados que vamos a reutilizar.
- `src/application/withHistory.ts` — decorador para tracking automático de costo/duración.
- `src/domain/result.ts`, `src/domain/i18n.ts`, `src/domain/defaults.ts`, `src/domain/chatTools.ts` — convenciones del domain.
- `src/presentation/hooks/useAgenticChat.ts` — patrón de hook React que vamos a clonar.
- `src/presentation/routes/Chat.tsx` — para entender cómo conecta hook + UI.

---

## 1. Resumen del feature

### Qué hace

Una nueva ruta `/council` (con item en sidebar) donde el usuario:

1. Escribe un prompt.
2. Tres modelos drafters generan respuestas en paralelo (default: `gemini-2.5-flash-lite`, `claude-haiku-4.5`, `gpt-5-mini`).
3. Cada drafter critica las respuestas de los otros dos (anonimizadas como "Modelo A/B/C").
4. Un modelo chairman recibe los 3 drafts + las 3 critiques y produce el veredicto final.
5. La UI muestra cada etapa en tiempo real (drafts en tabs, critiques colapsables, veredicto destacado).
6. El history de Dexie loggea **una entrada agregada** del council con el costo total.

### Qué NO hace (deliberado)

- **No usa tools.** El council es para razonamiento puro. Si querés tools, usá `/chat` (modo agentic).
- **No streaming token-por-token** en v1. Cada paso emite eventos `*_started` / `*_done` con la respuesta completa al final del paso. (Streaming se puede agregar en v2.)
- **No hace multi-round debate.** Una sola ronda de critique. Hard cap: `MAX_CRITIQUE_ROUNDS = 1`.
- **No deja al usuario meter más de 3 drafters.** Hard cap: `MAX_DRAFTERS = 3`. Razón: cada draft adicional multiplica el costo.

### Costo estimado por corrida

Con defaults all-lite (drafters: flash-lite + haiku + gpt-5-mini, chairman: flash-lite):
- 3 drafts (~$0.0005 c/u) + 3 critiques (~$0.001 c/u) + 1 synthesis (~$0.002) ≈ **$0.005–0.010 por corrida**.

Con chairman premium (`claude-sonnet-4.5`):
- ≈ **$0.05–0.15 por corrida**.

Con todo premium (3 drafters Sonnet/Opus + chairman Opus):
- ≈ **$0.50–1.50 por corrida** → este caso requiere confirmación explícita extra (ver guardrails).

---

## 2. Decisiones de diseño que ya están tomadas (no cuestionar)

1. **Cero dependencias nuevas.** Todo TS sobre el SDK ya integrado.
2. **Cero cambios al SDK.** El council usa la misma API del SDK que ya usa `runAgenticChat.ts`.
3. **Pasa por `api.llm4agents.com`.** No bypassa el gateway de billing — cada llamada se descuenta del saldo on-chain del agente activo.
4. **Multi-agent isolation se mantiene.** El council usa la API key del agente activo. Cambiar de agente cambia de saldo y de history.
5. **Domain puro.** Tipos branded, discriminated unions, `Result<T,E>`. Cero Zod en `domain/` y `application/`.
6. **Generator `async function*` para emitir eventos.** Mismo patrón que `runAgenticChat.ts`.
7. **`withHistory()` envuelve el use case** para que el council aparezca en `/transactions` como cualquier otra llamada, con `costCents` agregado.
8. **i18n full.** Ningún string hardcodeado en JSX. EN + ES siempre.
9. **Confirmación obligatoria al activar el modo** (similar al confirm de modelos caros). Banner persistente en `/council` mientras se está corriendo.
10. **Graceful degradation.** Si 1 de 3 drafts falla, el council sigue con 2. Si fallan 2 de 3, aborta con error claro.

---

## 3. Arquitectura — archivos a crear y modificar

### Crear (8 archivos nuevos)

```
src/domain/councilEvents.ts          — eventos discriminados emitidos por el orquestador
src/domain/council.ts                — tipos branded + DEFAULT_COUNCIL_CONFIG
src/application/runCouncilChat.ts    — orquestador: drafts → critiques → synthesis
src/application/buildCouncilPrompts.ts — helpers puros para construir los 3 tipos de prompt
src/presentation/hooks/useCouncilStream.ts — hook React que consume el generator
src/presentation/routes/Council.tsx  — ruta /council
src/presentation/components/council/CouncilSetup.tsx — picker de drafters + chairman
src/presentation/components/council/CouncilStream.tsx — visualización de drafts/critiques/verdict
```

### Modificar (4 archivos existentes)

```
src/app.tsx                              — agregar <Route path="/council" ...>
src/presentation/layout/Sidebar.tsx      — agregar item "Council"
src/application/useCases.ts              — agregar runCouncilChat al makeUseCases()
src/domain/i18n.ts                       — agregar ~25 keys nuevas (EN + ES)
```

### Tests a crear (3 archivos)

```
tests/application/runCouncilChat.test.ts        — orquestación: drafts paralelos, critique cruzado, synthesis, graceful degradation
tests/application/buildCouncilPrompts.test.ts   — helpers puros, anonimización, formato de critique
tests/presentation/Council.test.tsx             — render básico de la ruta + estados de loading/error
```

Target: mantener `npm run test:ci` en verde con estos tests sumados (~110/110 esperados).

---

## 4. Implementación archivo por archivo

### 4.1 `src/domain/council.ts`

```ts
import type { Model } from './model'
import { Model as ModelBrand } from './model'

/**
 * Identificador de slot de drafter dentro de una corrida del council.
 * Se usa para anonimizar drafts cuando se cruzan al critique
 * ('Modelo A' es siempre el slot 0 sin importar qué modelo concreto sea).
 */
export type DrafterSlot = 'A' | 'B' | 'C'

export const DRAFTER_SLOTS: ReadonlyArray<DrafterSlot> = ['A', 'B', 'C'] as const

/**
 * Configuración inmutable de una corrida del council.
 *
 * Restricciones:
 * - drafters.length entre 2 y MAX_DRAFTERS (3)
 * - chairman puede ser uno de los drafters o un modelo distinto
 * - maxCritiqueRounds: hard-capped a 1 en v1 (el orquestador ignora valores >1)
 */
export type CouncilConfig = Readonly<{
  drafters: ReadonlyArray<Model>
  chairman: Model
  maxCritiqueRounds: 1
  /**
   * Si true, los drafters reciben la critique de los otros y producen un draft revisado
   * antes de que el chairman sintetice. (No implementado en v1, reservado para v2.)
   */
  enableDrafterRevision: false
}>

export const MAX_DRAFTERS = 3 as const
export const MIN_DRAFTERS = 2 as const

/**
 * Defaults all-lite: corrida típica ~$0.005–0.010.
 * Cambiar el chairman a sonnet/opus eleva costo a ~$0.05–0.15.
 */
export const DEFAULT_COUNCIL_CONFIG: CouncilConfig = {
  drafters: [
    ModelBrand('google/gemini-2.5-flash-lite'),
    ModelBrand('anthropic/claude-haiku-4.5'),
    ModelBrand('openai/gpt-5-mini'),
  ],
  chairman: ModelBrand('google/gemini-2.5-flash-lite'),
  maxCritiqueRounds: 1,
  enableDrafterRevision: false,
}

/**
 * Threshold de costo (en centavos USD) por corrida estimada por encima del cual
 * la UI debe pedir confirmación adicional antes de arrancar.
 *
 * 50 centavos = $0.50 USD.
 */
export const COUNCIL_EXPENSIVE_THRESHOLD_CENTS = 50 as const

/**
 * Estimación grosera de costo en centavos USD por corrida dada la config.
 * Conservador: asume que cada llamada es ~$0.002 con lite y ~$0.05 con premium.
 *
 * El usuario verá esto antes de confirmar. La cifra real se mide post-hoc
 * sumando los costCents de cada response.
 */
export function estimateCouncilCostCents(config: CouncilConfig): number {
  const isPremium = (m: Model): boolean => {
    const s = String(m).toLowerCase()
    return (
      s.includes('opus') ||
      s.includes('sonnet') ||
      s.includes('gpt-5.1') ||
      s.includes('gemini-3-pro')
    )
  }

  const draftCost = config.drafters.reduce(
    (sum, m) => sum + (isPremium(m) ? 8 : 1),
    0,
  )
  const critiqueCost = config.drafters.reduce(
    (sum, m) => sum + (isPremium(m) ? 8 : 1),
    0,
  )
  const synthesisCost = isPremium(config.chairman) ? 15 : 2

  return draftCost + critiqueCost + synthesisCost
}
```

> **Nota sobre `Model` brand:** asumo que existe `src/domain/model.ts` con `Model = Brand<string, 'Model'>` y un constructor `Model(s: string): Model` que valida el formato `provider/model-id`. Si no existe, agregalo siguiendo el patrón de los otros branded types (`AgentId`, `ApiKey`, etc.). Si ya existe con otro nombre, ajustá los imports.

---

### 4.2 `src/domain/councilEvents.ts`

```ts
import type { AppError } from './errors'
import type { Model } from './model'
import type { DrafterSlot } from './council'

/**
 * Eventos emitidos por el generator runCouncilChat.
 * Discriminated union — siempre matchear con switch + assertNever.
 *
 * El orden esperado en una corrida exitosa:
 *   council_started
 *   → draft_started × N (paralelo)
 *   → draft_done × N (en cualquier orden)
 *   → critique_started × N
 *   → critique_done × N
 *   → synthesis_started
 *   → synthesis_done
 *   → council_done
 *
 * En caso de fallo de un drafter individual: draft_failed (no aborta el council).
 * En caso de fallo del chairman o de demasiados drafters: council_failed (aborta).
 */
export type CouncilEvent =
  | Readonly<{ kind: 'council_started'; totalDrafters: number; chairman: Model }>
  | Readonly<{ kind: 'draft_started'; slot: DrafterSlot; model: Model }>
  | Readonly<{
      kind: 'draft_done'
      slot: DrafterSlot
      model: Model
      content: string
      costCents: number
      durationMs: number
    }>
  | Readonly<{
      kind: 'draft_failed'
      slot: DrafterSlot
      model: Model
      error: AppError
    }>
  | Readonly<{ kind: 'critique_started'; slot: DrafterSlot; model: Model }>
  | Readonly<{
      kind: 'critique_done'
      slot: DrafterSlot
      model: Model
      content: string
      costCents: number
      durationMs: number
    }>
  | Readonly<{ kind: 'critique_failed'; slot: DrafterSlot; model: Model; error: AppError }>
  | Readonly<{ kind: 'synthesis_started'; model: Model }>
  | Readonly<{
      kind: 'synthesis_done'
      model: Model
      content: string
      costCents: number
      durationMs: number
    }>
  | Readonly<{
      kind: 'council_done'
      finalAnswer: string
      totalCostCents: number
      totalDurationMs: number
    }>
  | Readonly<{ kind: 'council_failed'; error: AppError; partialCostCents: number }>
```

---

### 4.3 `src/application/buildCouncilPrompts.ts`

Helpers puros (sin I/O, sin SDK). Fáciles de testear unitariamente.

```ts
import type { Model } from '../domain/model'
import type { DrafterSlot } from '../domain/council'

export type ChatMessage = Readonly<{
  role: 'system' | 'user' | 'assistant'
  content: string
}>

const DRAFTER_SYSTEM = `You are one of three independent expert drafters in a council.
Produce your best, complete answer to the user's task. Be thorough but concise.
Do not refer to "other models" or imagine what others would say. Just answer.
If the task requires code, provide working code with brief context.
If the task is open-ended, structure your answer in clear sections.`

/**
 * Prompt para un drafter individual. Sin contexto cruzado todavía.
 */
export function buildDrafterMessages(userTask: string): ReadonlyArray<ChatMessage> {
  return [
    { role: 'system', content: DRAFTER_SYSTEM },
    { role: 'user', content: userTask },
  ]
}

/**
 * Construye el prompt de critique. Recibe el draft propio y los drafts ajenos
 * anonimizados ('Modelo A/B/C' donde el slot del crítico ya está excluido).
 *
 * Anonimización: el crítico NO sabe qué modelo produjo cada draft ajeno.
 * Esto reduce sesgo "branded": un crítico no premia a su propia familia.
 */
export function buildCritiqueMessages(args: {
  userTask: string
  myDraft: string
  othersDrafts: ReadonlyArray<{ label: string; content: string }>
}): ReadonlyArray<ChatMessage> {
  const { userTask, myDraft, othersDrafts } = args

  const othersBlock = othersDrafts
    .map((d) => `--- Drafter ${d.label} ---\n${d.content}`)
    .join('\n\n')

  const system = `You are reviewing answers from a council of three drafters to the same task.
You are one of those drafters. Your own draft is provided. The other drafters' answers are
anonymized as Drafter A, B, etc. — you do not know which model produced each.

Your job:
1. Identify the strongest points in each other drafter's answer (max 2 per drafter).
2. Identify weaknesses, errors, hallucinations, or blind spots in each (max 2 per drafter).
3. Briefly note where your own draft was weaker than others, if anywhere.
4. Do NOT rewrite the answer. Critique only.

Output format: plain prose, ~150–250 words. No JSON.`

  const user = `Original task:
${userTask}

Your own draft:
${myDraft}

Other drafters' answers (anonymized):
${othersBlock}

Provide your critique now.`

  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ]
}

/**
 * Construye el prompt de synthesis para el chairman.
 * El chairman recibe: la tarea original, los 3 drafts (etiquetados A/B/C, anonimizados),
 * y las 3 critiques cruzadas.
 *
 * El chairman SÍ tiene la responsabilidad de producir la respuesta final que el usuario verá.
 */
export function buildSynthesisMessages(args: {
  userTask: string
  drafts: ReadonlyArray<{ slot: DrafterSlot; content: string }>
  critiques: ReadonlyArray<{ slot: DrafterSlot; content: string }>
}): ReadonlyArray<ChatMessage> {
  const { userTask, drafts, critiques } = args

  const draftsBlock = drafts
    .map((d) => `--- Drafter ${d.slot} ---\n${d.content}`)
    .join('\n\n')

  const critiquesBlock = critiques
    .map((c) => `--- Critique by Drafter ${c.slot} ---\n${c.content}`)
    .join('\n\n')

  const system = `You are the chairman of a council of three drafters who answered the same task.
You have all three drafts (anonymized as A/B/C) and the cross-critiques each drafter wrote
about the others.

Your job: produce ONE final answer for the user that:
- Incorporates the strongest points from each draft.
- Addresses the valid weaknesses identified in the critiques.
- Resolves contradictions between drafters by judging which is correct (state your reasoning briefly when you do).
- Is the answer the user will see — write it directly to them, not as meta-commentary about the council.

Format the final answer naturally. If the task asked for code, give code. If it asked for an explanation, explain.
Do NOT preface with "After reviewing the drafts..." — just answer.`

  const user = `Original task:
${userTask}

Drafts:
${draftsBlock}

Critiques:
${critiquesBlock}

Now produce the final answer.`

  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ]
}

/**
 * Helper de anonimización: dada la lista completa de drafts y un slot que es el "yo",
 * devuelve los drafts ajenos relabelados como Drafter X/Y/Z según orden, OMITIENDO el propio.
 *
 * Garantiza que el crítico nunca ve su propio slot etiquetado.
 */
export function anonymizeOthers(
  allDrafts: ReadonlyArray<{ slot: DrafterSlot; content: string }>,
  myslot: DrafterSlot,
): ReadonlyArray<{ label: string; content: string }> {
  const labels = ['X', 'Y', 'Z']
  const others = allDrafts.filter((d) => d.slot !== myslot)
  return others.map((d, i) => ({
    label: labels[i] ?? '?',
    content: d.content,
  }))
}
```

---

### 4.4 `src/application/runCouncilChat.ts`

El orquestador. Generator async que emite `CouncilEvent`. Sigue el patrón de `runAgenticChat.ts`.

```ts
import { Err, Ok, type Result } from '../domain/result'
import type { AppError } from '../domain/errors'
import type { Model } from '../domain/model'
import {
  type CouncilConfig,
  type DrafterSlot,
  DRAFTER_SLOTS,
  MAX_DRAFTERS,
  MIN_DRAFTERS,
} from '../domain/council'
import type { CouncilEvent } from '../domain/councilEvents'
import {
  buildDrafterMessages,
  buildCritiqueMessages,
  buildSynthesisMessages,
  anonymizeOthers,
  type ChatMessage,
} from './buildCouncilPrompts'
import type { ChatPort } from './ports'

/**
 * Cómo abortamos cuando demasiados drafters fallan.
 * Si quedan menos de MIN_DRAFTERS - 1 drafts vivos, abortamos antes del critique.
 */
const MIN_LIVE_DRAFTS_TO_PROCEED = 2

type DraftResult = Readonly<{
  slot: DrafterSlot
  model: Model
  content: string
  costCents: number
}>

type CritiqueResult = Readonly<{
  slot: DrafterSlot
  model: Model
  content: string
  costCents: number
}>

/**
 * runCouncilChat — orquestador del council.
 *
 * Uso:
 *   for await (const event of runCouncilChat(deps, { config, userTask })) {
 *     // dispatch event a la UI
 *   }
 *
 * Garantías:
 * - Drafts en paralelo (Promise.allSettled).
 * - Critiques en paralelo (cada drafter critica a los otros).
 * - Anonimización: cada crítico ve los otros drafts como Drafter X/Y, no el modelo concreto.
 * - Graceful degradation: 1 fallo de draft no aborta el council.
 * - Cap duro: maxCritiqueRounds = 1.
 *
 * No hace streaming token-por-token en v1 (mejora futura).
 */
export async function* runCouncilChat(
  deps: Readonly<{ chat: ChatPort }>,
  args: Readonly<{ config: CouncilConfig; userTask: string }>,
): AsyncGenerator<CouncilEvent, Result<{ finalAnswer: string }, AppError>, void> {
  const { chat } = deps
  const { config, userTask } = args

  // Validación de config
  if (config.drafters.length < MIN_DRAFTERS || config.drafters.length > MAX_DRAFTERS) {
    const err: AppError = {
      kind: 'validation',
      message: `Council requires ${MIN_DRAFTERS}–${MAX_DRAFTERS} drafters, got ${config.drafters.length}`,
    }
    yield { kind: 'council_failed', error: err, partialCostCents: 0 }
    return Err(err)
  }

  const startTime = Date.now()
  let totalCostCents = 0

  yield {
    kind: 'council_started',
    totalDrafters: config.drafters.length,
    chairman: config.chairman,
  }

  // ============== STAGE 1: Drafts en paralelo ==============
  const draftSlots: ReadonlyArray<{ slot: DrafterSlot; model: Model }> = config.drafters.map(
    (model, i) => ({ slot: DRAFTER_SLOTS[i] as DrafterSlot, model }),
  )

  // Emitir draft_started para los N drafters antes de awaitar
  for (const { slot, model } of draftSlots) {
    yield { kind: 'draft_started', slot, model }
  }

  const draftPromises = draftSlots.map(async ({ slot, model }) => {
    const t0 = Date.now()
    try {
      const messages = buildDrafterMessages(userTask)
      const result = await chat.completion({ model, messages })
      if (result.kind === 'err') {
        return { kind: 'failed' as const, slot, model, error: result.error }
      }
      const durationMs = Date.now() - t0
      return {
        kind: 'ok' as const,
        slot,
        model,
        content: result.value.content,
        costCents: result.value.costCents,
        durationMs,
      }
    } catch (e) {
      return {
        kind: 'failed' as const,
        slot,
        model,
        error: { kind: 'unknown', message: e instanceof Error ? e.message : String(e) } as AppError,
      }
    }
  })

  const draftSettlements = await Promise.all(draftPromises)
  const liveDrafts: DraftResult[] = []

  for (const settlement of draftSettlements) {
    if (settlement.kind === 'ok') {
      totalCostCents += settlement.costCents
      liveDrafts.push({
        slot: settlement.slot,
        model: settlement.model,
        content: settlement.content,
        costCents: settlement.costCents,
      })
      yield {
        kind: 'draft_done',
        slot: settlement.slot,
        model: settlement.model,
        content: settlement.content,
        costCents: settlement.costCents,
        durationMs: settlement.durationMs,
      }
    } else {
      yield {
        kind: 'draft_failed',
        slot: settlement.slot,
        model: settlement.model,
        error: settlement.error,
      }
    }
  }

  if (liveDrafts.length < MIN_LIVE_DRAFTS_TO_PROCEED) {
    const err: AppError = {
      kind: 'validation',
      message: `Only ${liveDrafts.length} drafter(s) succeeded, need ≥${MIN_LIVE_DRAFTS_TO_PROCEED}`,
    }
    yield { kind: 'council_failed', error: err, partialCostCents: totalCostCents }
    return Err(err)
  }

  // ============== STAGE 2: Critiques cruzadas en paralelo ==============
  for (const { slot, model } of liveDrafts) {
    yield { kind: 'critique_started', slot, model }
  }

  const critiquePromises = liveDrafts.map(async (draft) => {
    const t0 = Date.now()
    try {
      const others = anonymizeOthers(liveDrafts, draft.slot)
      const messages = buildCritiqueMessages({
        userTask,
        myDraft: draft.content,
        othersDrafts: others,
      })
      const result = await chat.completion({ model: draft.model, messages })
      if (result.kind === 'err') {
        return { kind: 'failed' as const, slot: draft.slot, model: draft.model, error: result.error }
      }
      const durationMs = Date.now() - t0
      return {
        kind: 'ok' as const,
        slot: draft.slot,
        model: draft.model,
        content: result.value.content,
        costCents: result.value.costCents,
        durationMs,
      }
    } catch (e) {
      return {
        kind: 'failed' as const,
        slot: draft.slot,
        model: draft.model,
        error: { kind: 'unknown', message: e instanceof Error ? e.message : String(e) } as AppError,
      }
    }
  })

  const critiqueSettlements = await Promise.all(critiquePromises)
  const liveCritiques: CritiqueResult[] = []

  for (const settlement of critiqueSettlements) {
    if (settlement.kind === 'ok') {
      totalCostCents += settlement.costCents
      liveCritiques.push({
        slot: settlement.slot,
        model: settlement.model,
        content: settlement.content,
        costCents: settlement.costCents,
      })
      yield {
        kind: 'critique_done',
        slot: settlement.slot,
        model: settlement.model,
        content: settlement.content,
        costCents: settlement.costCents,
        durationMs: settlement.durationMs,
      }
    } else {
      yield {
        kind: 'critique_failed',
        slot: settlement.slot,
        model: settlement.model,
        error: settlement.error,
      }
    }
  }

  // Tolerancia: si todas las critiques fallan, igual seguimos al chairman con drafts solos.
  // El chairman es el que produce la respuesta final, las critiques son guía adicional.

  // ============== STAGE 3: Synthesis (chairman) ==============
  yield { kind: 'synthesis_started', model: config.chairman }

  const synthesisT0 = Date.now()
  const synthesisMessages: ReadonlyArray<ChatMessage> = buildSynthesisMessages({
    userTask,
    drafts: liveDrafts.map(({ slot, content }) => ({ slot, content })),
    critiques: liveCritiques.map(({ slot, content }) => ({ slot, content })),
  })

  const synthesisResult = await chat.completion({
    model: config.chairman,
    messages: synthesisMessages,
  })

  if (synthesisResult.kind === 'err') {
    yield {
      kind: 'council_failed',
      error: synthesisResult.error,
      partialCostCents: totalCostCents,
    }
    return Err(synthesisResult.error)
  }

  const synthesisDuration = Date.now() - synthesisT0
  totalCostCents += synthesisResult.value.costCents

  yield {
    kind: 'synthesis_done',
    model: config.chairman,
    content: synthesisResult.value.content,
    costCents: synthesisResult.value.costCents,
    durationMs: synthesisDuration,
  }

  // ============== DONE ==============
  const totalDurationMs = Date.now() - startTime

  yield {
    kind: 'council_done',
    finalAnswer: synthesisResult.value.content,
    totalCostCents,
    totalDurationMs,
  }

  return Ok({ finalAnswer: synthesisResult.value.content })
}
```

> **Nota sobre `ChatPort`:** asumo que existe (o que vas a agregar) en `src/application/ports.ts` un puerto con la forma:
>
> ```ts
> export interface ChatPort {
>   completion(args: {
>     readonly model: Model
>     readonly messages: ReadonlyArray<ChatMessage>
>   }): Promise<Result<{ readonly content: string; readonly costCents: number }, AppError>>
> }
> ```
>
> El adapter de infrastructure (`infrastructure/sdk/sdkClient.ts` o similar) implementa este puerto haciendo una single chat completion vía el SDK existente, devolviendo `content` + `costCents`. Si ya existe un método con otra firma que hace lo equivalente, ajustá los nombres. **El council no necesita streaming** — solo respuesta completa.

---

### 4.5 `src/application/useCases.ts` (edición)

Agregar el use case al composition. Ejemplo del cambio:

```ts
import { runCouncilChat } from './runCouncilChat'
// ... otros imports existentes

export function makeUseCases(deps: UseCasesDeps) {
  // ... use cases existentes

  const council = withHistory(
    'council',
    (args: { config: CouncilConfig; userTask: string }) => runCouncilChat(deps, args),
    deps.history,
  )

  return {
    // ... use cases existentes
    runCouncilChat: council,
  }
}
```

> **Nota sobre `withHistory`:** revisá su firma actual. Si solo soporta funciones síncronas o `Promise<T>`, posiblemente necesite una variante para generators (`async function*`). Si ya soporta generators, perfecto. Si no, agregá una sobrecarga que consuma el generator, recolecte el último evento `council_done` o `council_failed`, y persista una entrada de history con `costCents = totalCostCents`. El generator se devuelve igual al caller para que la UI pueda iterar sobre él.

---

### 4.6 `src/presentation/hooks/useCouncilStream.ts`

```ts
import { useCallback, useRef, useState } from 'react'
import type { CouncilConfig } from '../../domain/council'
import type { CouncilEvent } from '../../domain/councilEvents'
import { useAppContainer } from './useAppContainer'

export type CouncilUiState = Readonly<{
  isRunning: boolean
  events: ReadonlyArray<CouncilEvent>
  finalAnswer: string | null
  totalCostCents: number
  error: string | null
}>

const INITIAL: CouncilUiState = {
  isRunning: false,
  events: [],
  finalAnswer: null,
  totalCostCents: 0,
  error: null,
}

export function useCouncilStream(): {
  state: CouncilUiState
  start: (args: { config: CouncilConfig; userTask: string }) => void
  reset: () => void
} {
  const { useCases } = useAppContainer()
  const [state, setState] = useState<CouncilUiState>(INITIAL)
  const abortRef = useRef<AbortController | null>(null)

  const start = useCallback(
    (args: { config: CouncilConfig; userTask: string }) => {
      // Cancelar cualquier corrida en curso
      if (abortRef.current) abortRef.current.abort()
      const ac = new AbortController()
      abortRef.current = ac

      setState({ ...INITIAL, isRunning: true })

      // Wrapper async — usamos void para no levantar floating-promise
      void (async () => {
        try {
          const generator = useCases.runCouncilChat(args)
          for await (const event of generator) {
            if (ac.signal.aborted) return
            setState((prev) => {
              const next: CouncilUiState = { ...prev, events: [...prev.events, event] }
              if (event.kind === 'council_done') {
                return {
                  ...next,
                  isRunning: false,
                  finalAnswer: event.finalAnswer,
                  totalCostCents: event.totalCostCents,
                }
              }
              if (event.kind === 'council_failed') {
                return {
                  ...next,
                  isRunning: false,
                  error: event.error.message,
                  totalCostCents: event.partialCostCents,
                }
              }
              return next
            })
          }
        } catch (e) {
          if (ac.signal.aborted) return
          setState((prev) => ({
            ...prev,
            isRunning: false,
            error: e instanceof Error ? e.message : String(e),
          }))
        }
      })()
    },
    [useCases],
  )

  const reset = useCallback(() => {
    if (abortRef.current) abortRef.current.abort()
    setState(INITIAL)
  }, [])

  return { state, start, reset }
}
```

---

### 4.7 `src/presentation/components/council/CouncilSetup.tsx`

```tsx
import { useState } from 'react'
import {
  type CouncilConfig,
  COUNCIL_EXPENSIVE_THRESHOLD_CENTS,
  DEFAULT_COUNCIL_CONFIG,
  estimateCouncilCostCents,
} from '../../../domain/council'
import { Model } from '../../../domain/model'
import { useT } from '../../hooks/useT'
import { Button } from '../ui/button'
import { Textarea } from '../ui/textarea'
import { Input } from '../ui/input'

type Props = Readonly<{
  disabled: boolean
  onStart: (args: { config: CouncilConfig; userTask: string }) => void
}>

export function CouncilSetup({ disabled, onStart }: Props) {
  const t = useT()
  const [task, setTask] = useState('')
  const [config, setConfig] = useState<CouncilConfig>(DEFAULT_COUNCIL_CONFIG)

  const estimatedCents = estimateCouncilCostCents(config)
  const isExpensive = estimatedCents >= COUNCIL_EXPENSIVE_THRESHOLD_CENTS

  const handleStart = () => {
    if (!task.trim()) return
    if (isExpensive) {
      const ok = window.confirm(
        t('council.expensiveConfirm', {
          cost: (estimatedCents / 100).toFixed(2),
        }),
      )
      if (!ok) return
    }
    onStart({ config, userTask: task })
  }

  const updateDrafter = (idx: number, value: string) => {
    const next = [...config.drafters]
    next[idx] = Model(value)
    setConfig({ ...config, drafters: next })
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="text-sm font-medium">{t('council.taskLabel')}</label>
        <Textarea
          value={task}
          onChange={(e) => setTask(e.target.value)}
          placeholder={t('council.taskPlaceholder')}
          rows={4}
          disabled={disabled}
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">{t('council.draftersLabel')}</label>
        {config.drafters.map((m, i) => (
          <Input
            key={i}
            value={String(m)}
            onChange={(e) => updateDrafter(i, e.target.value)}
            disabled={disabled}
          />
        ))}
      </div>

      <div>
        <label className="text-sm font-medium">{t('council.chairmanLabel')}</label>
        <Input
          value={String(config.chairman)}
          onChange={(e) => setConfig({ ...config, chairman: Model(e.target.value) })}
          disabled={disabled}
        />
      </div>

      <div className="text-sm text-muted-foreground">
        {t('council.estimatedCost', { cost: (estimatedCents / 100).toFixed(3) })}
        {isExpensive && (
          <span className="ml-2 text-destructive">{t('council.expensiveWarning')}</span>
        )}
      </div>

      <Button onClick={handleStart} disabled={disabled || !task.trim()}>
        {t('council.startButton')}
      </Button>
    </div>
  )
}
```

---

### 4.8 `src/presentation/components/council/CouncilStream.tsx`

Visualización en tiempo real. Tabs para drafts, secciones colapsables para critiques, veredicto final destacado.

```tsx
import { useT } from '../../hooks/useT'
import type { CouncilEvent } from '../../../domain/councilEvents'
import type { DrafterSlot } from '../../../domain/council'

type Props = Readonly<{ events: ReadonlyArray<CouncilEvent> }>

export function CouncilStream({ events }: Props) {
  const t = useT()

  const drafts = events.filter(
    (e): e is Extract<CouncilEvent, { kind: 'draft_done' }> => e.kind === 'draft_done',
  )
  const critiques = events.filter(
    (e): e is Extract<CouncilEvent, { kind: 'critique_done' }> => e.kind === 'critique_done',
  )
  const synthesis = events.find(
    (e): e is Extract<CouncilEvent, { kind: 'synthesis_done' }> => e.kind === 'synthesis_done',
  )
  const failed = events.filter(
    (e): e is Extract<CouncilEvent, { kind: 'draft_failed' | 'critique_failed' | 'council_failed' }> =>
      e.kind === 'draft_failed' || e.kind === 'critique_failed' || e.kind === 'council_failed',
  )

  return (
    <div className="space-y-6">
      {synthesis && (
        <section className="rounded-lg border-2 border-primary p-4">
          <h2 className="text-lg font-bold mb-2">{t('council.finalAnswer')}</h2>
          <pre className="whitespace-pre-wrap text-sm">{synthesis.content}</pre>
          <div className="text-xs text-muted-foreground mt-2">
            {t('council.synthesizedBy')} {String(synthesis.model)} ·{' '}
            {(synthesis.costCents / 100).toFixed(4)} USD · {synthesis.durationMs}ms
          </div>
        </section>
      )}

      <section>
        <h3 className="font-semibold mb-2">{t('council.drafts')}</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {(['A', 'B', 'C'] as DrafterSlot[]).map((slot) => {
            const draft = drafts.find((d) => d.slot === slot)
            const fail = failed.find((f) => 'slot' in f && f.slot === slot && f.kind === 'draft_failed')
            return (
              <div key={slot} className="rounded border p-3 text-sm">
                <div className="font-mono text-xs text-muted-foreground mb-1">
                  {t('council.drafter')} {slot} {draft && `· ${String(draft.model)}`}
                </div>
                {draft ? (
                  <pre className="whitespace-pre-wrap">{draft.content}</pre>
                ) : fail ? (
                  <div className="text-destructive">
                    {t('council.draftFailed')}: {fail.error.message}
                  </div>
                ) : (
                  <div className="animate-pulse text-muted-foreground">
                    {t('council.drafting')}...
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </section>

      {critiques.length > 0 && (
        <section>
          <h3 className="font-semibold mb-2">{t('council.critiques')}</h3>
          <div className="space-y-2">
            {critiques.map((c) => (
              <details key={c.slot} className="rounded border p-3 text-sm">
                <summary className="cursor-pointer font-medium">
                  {t('council.critiqueBy')} {c.slot} ({String(c.model)})
                </summary>
                <pre className="whitespace-pre-wrap mt-2">{c.content}</pre>
              </details>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
```

---

### 4.9 `src/presentation/routes/Council.tsx`

```tsx
import { useT } from '../hooks/useT'
import { useCouncilStream } from '../hooks/useCouncilStream'
import { CouncilSetup } from '../components/council/CouncilSetup'
import { CouncilStream } from '../components/council/CouncilStream'

export function Council() {
  const t = useT()
  const { state, start, reset } = useCouncilStream()

  return (
    <div className="container mx-auto p-6 max-w-5xl">
      <header className="mb-6">
        <h1 className="text-2xl font-bold">{t('council.title')}</h1>
        <p className="text-muted-foreground">{t('council.subtitle')}</p>
      </header>

      {!state.isRunning && state.events.length === 0 && (
        <CouncilSetup disabled={false} onStart={start} />
      )}

      {(state.isRunning || state.events.length > 0) && (
        <>
          <CouncilStream events={state.events} />
          <div className="mt-6 flex gap-3">
            <button
              onClick={reset}
              className="text-sm underline text-muted-foreground"
            >
              {t('council.newRun')}
            </button>
            {state.totalCostCents > 0 && (
              <span className="text-sm text-muted-foreground">
                {t('council.totalCost', { cost: (state.totalCostCents / 100).toFixed(4) })}
              </span>
            )}
          </div>
        </>
      )}

      {state.error && (
        <div className="mt-4 rounded border border-destructive p-3 text-sm text-destructive">
          {state.error}
        </div>
      )}
    </div>
  )
}
```

---

### 4.10 `src/app.tsx` (edición)

```tsx
import { Council } from './presentation/routes/Council'
// ...

<Routes>
  {/* rutas existentes */}
  <Route path="/council" element={<Council />} />
</Routes>
```

---

### 4.11 `src/presentation/layout/Sidebar.tsx` (edición)

Agregar item después de `/chat`:

```tsx
{ to: '/council', label: t('nav.council'), icon: <UsersIcon /> }
```

---

### 4.12 `src/domain/i18n.ts` (edición)

Agregar al diccionario EN:

```ts
'nav.council': 'Council',
'council.title': 'Council',
'council.subtitle': 'Three drafters, cross-critique, one chairman synthesizes the final answer.',
'council.taskLabel': 'Task',
'council.taskPlaceholder': 'What should the council answer?',
'council.draftersLabel': 'Drafter models (2–3)',
'council.chairmanLabel': 'Chairman model (synthesizer)',
'council.estimatedCost': 'Estimated cost: ~${cost} USD',
'council.expensiveWarning': '— this is a premium configuration.',
'council.expensiveConfirm':
  'This council run is estimated at ~${cost} USD. Proceed?',
'council.startButton': 'Convene the Council',
'council.drafts': 'Drafts',
'council.drafter': 'Drafter',
'council.drafting': 'Drafting',
'council.draftFailed': 'Draft failed',
'council.critiques': 'Cross-critiques',
'council.critiqueBy': 'Critique by Drafter',
'council.finalAnswer': 'Final answer',
'council.synthesizedBy': 'Synthesized by',
'council.totalCost': 'Total cost: ${cost} USD',
'council.newRun': 'Start a new run',
```

Y al diccionario ES (todas las claves equivalentes traducidas):

```ts
'nav.council': 'Concejo',
'council.title': 'Concejo',
'council.subtitle': 'Tres redactores, crítica cruzada, y un chairman sintetiza la respuesta final.',
'council.taskLabel': 'Tarea',
'council.taskPlaceholder': '¿Qué debería responder el concejo?',
'council.draftersLabel': 'Modelos redactores (2–3)',
'council.chairmanLabel': 'Modelo chairman (sintetizador)',
'council.estimatedCost': 'Costo estimado: ~${cost} USD',
'council.expensiveWarning': '— esta es una configuración premium.',
'council.expensiveConfirm':
  'Esta corrida del concejo se estima en ~${cost} USD. ¿Continuar?',
'council.startButton': 'Convocar al Concejo',
'council.drafts': 'Borradores',
'council.drafter': 'Redactor',
'council.drafting': 'Redactando',
'council.draftFailed': 'Falló el borrador',
'council.critiques': 'Críticas cruzadas',
'council.critiqueBy': 'Crítica por Redactor',
'council.finalAnswer': 'Respuesta final',
'council.synthesizedBy': 'Sintetizado por',
'council.totalCost': 'Costo total: ${cost} USD',
'council.newRun': 'Nueva corrida',
```

---

## 5. Tests

### 5.1 `tests/application/buildCouncilPrompts.test.ts`

```ts
import { describe, it, expect } from 'vitest'
import {
  buildDrafterMessages,
  buildCritiqueMessages,
  buildSynthesisMessages,
  anonymizeOthers,
} from '../../src/application/buildCouncilPrompts'

describe('buildCouncilPrompts', () => {
  it('drafter messages: system + user', () => {
    const msgs = buildDrafterMessages('explain quicksort')
    expect(msgs).toHaveLength(2)
    expect(msgs[0]?.role).toBe('system')
    expect(msgs[1]?.content).toBe('explain quicksort')
  })

  it('anonymizeOthers excludes self and relabels as X/Y', () => {
    const drafts = [
      { slot: 'A' as const, content: 'a' },
      { slot: 'B' as const, content: 'b' },
      { slot: 'C' as const, content: 'c' },
    ]
    const result = anonymizeOthers(drafts, 'B')
    expect(result).toEqual([
      { label: 'X', content: 'a' },
      { label: 'Y', content: 'c' },
    ])
  })

  it('critique messages do not leak my own slot label', () => {
    const drafts = [
      { slot: 'A' as const, content: 'mine' },
      { slot: 'B' as const, content: 'other1' },
      { slot: 'C' as const, content: 'other2' },
    ]
    const others = anonymizeOthers(drafts, 'A')
    const msgs = buildCritiqueMessages({
      userTask: 't',
      myDraft: 'mine',
      othersDrafts: others,
    })
    const userContent = msgs[1]?.content ?? ''
    expect(userContent).not.toContain('Drafter A')
    expect(userContent).toContain('Drafter X')
    expect(userContent).toContain('Drafter Y')
  })

  it('synthesis messages include all drafts and critiques', () => {
    const msgs = buildSynthesisMessages({
      userTask: 'task',
      drafts: [
        { slot: 'A', content: 'da' },
        { slot: 'B', content: 'db' },
      ],
      critiques: [
        { slot: 'A', content: 'ca' },
        { slot: 'B', content: 'cb' },
      ],
    })
    expect(msgs[1]?.content).toContain('da')
    expect(msgs[1]?.content).toContain('cb')
  })
})
```

### 5.2 `tests/application/runCouncilChat.test.ts`

Mockeá un `ChatPort` que devuelva respuestas determinísticas y verificá:

- Una corrida feliz emite eventos en el orden esperado.
- Total cost = suma de los costCents individuales.
- Si un draft falla pero quedan ≥2, el council sigue.
- Si fallan 2 de 3, el council emite `council_failed`.
- Si el chairman falla, emite `council_failed` con `partialCostCents` correcto.
- Anonimización: el `messages` que llega al `ChatPort` para una critique nunca contiene `Drafter A` cuando el crítico ES `A`.

Esqueleto:

```ts
import { describe, it, expect, vi } from 'vitest'
import { runCouncilChat } from '../../src/application/runCouncilChat'
import { Ok, Err } from '../../src/domain/result'
import { Model } from '../../src/domain/model'
import { DEFAULT_COUNCIL_CONFIG } from '../../src/domain/council'
import type { CouncilEvent } from '../../src/domain/councilEvents'
import type { ChatPort } from '../../src/application/ports'

function fakeChat(impl: ChatPort['completion']): ChatPort {
  return { completion: impl }
}

async function collect(gen: AsyncGenerator<CouncilEvent>): Promise<CouncilEvent[]> {
  const out: CouncilEvent[] = []
  for await (const e of gen) out.push(e)
  return out
}

describe('runCouncilChat', () => {
  it('happy path emits all expected events', async () => {
    const chat = fakeChat(async ({ messages }) => {
      const isCritique = messages.some((m) =>
        m.content.includes('Other drafters'),
      )
      const isSynthesis = messages.some((m) => m.content.includes('Critiques:'))
      const content = isSynthesis ? 'final' : isCritique ? 'critique' : 'draft'
      return Ok({ content, costCents: 1 })
    })

    const events = await collect(
      runCouncilChat({ chat }, { config: DEFAULT_COUNCIL_CONFIG, userTask: 't' }),
    )

    const kinds = events.map((e) => e.kind)
    expect(kinds).toContain('council_started')
    expect(kinds.filter((k) => k === 'draft_done')).toHaveLength(3)
    expect(kinds.filter((k) => k === 'critique_done')).toHaveLength(3)
    expect(kinds).toContain('synthesis_done')
    expect(kinds).toContain('council_done')

    const done = events.find((e) => e.kind === 'council_done')
    expect(done && 'totalCostCents' in done && done.totalCostCents).toBe(7) // 3 + 3 + 1
  })

  it('aborts when 2 of 3 drafters fail', async () => {
    let drafts = 0
    const chat = fakeChat(async ({ messages }) => {
      const isDraft = !messages.some(
        (m) => m.content.includes('Other drafters') || m.content.includes('Critiques:'),
      )
      if (isDraft) {
        drafts++
        if (drafts <= 2) return Err({ kind: 'unknown', message: 'boom' })
      }
      return Ok({ content: 'x', costCents: 1 })
    })

    const events = await collect(
      runCouncilChat({ chat }, { config: DEFAULT_COUNCIL_CONFIG, userTask: 't' }),
    )

    expect(events.find((e) => e.kind === 'council_failed')).toBeTruthy()
    expect(events.find((e) => e.kind === 'synthesis_done')).toBeUndefined()
  })

  it('continues when 1 of 3 drafters fails', async () => {
    let drafts = 0
    const chat = fakeChat(async ({ messages }) => {
      const isDraft = !messages.some(
        (m) => m.content.includes('Other drafters') || m.content.includes('Critiques:'),
      )
      if (isDraft) {
        drafts++
        if (drafts === 1) return Err({ kind: 'unknown', message: 'boom' })
      }
      return Ok({ content: 'x', costCents: 1 })
    })

    const events = await collect(
      runCouncilChat({ chat }, { config: DEFAULT_COUNCIL_CONFIG, userTask: 't' }),
    )

    expect(events.find((e) => e.kind === 'draft_failed')).toBeTruthy()
    expect(events.find((e) => e.kind === 'council_done')).toBeTruthy()
  })

  it('critique prompt does not leak the critic own slot label', async () => {
    const seenCritiqueMessages: string[] = []
    const chat = fakeChat(async ({ messages }) => {
      const userMsg = messages.find((m) => m.role === 'user')?.content ?? ''
      if (userMsg.includes('Other drafters')) {
        seenCritiqueMessages.push(userMsg)
      }
      return Ok({ content: 'x', costCents: 1 })
    })

    await collect(
      runCouncilChat({ chat }, { config: DEFAULT_COUNCIL_CONFIG, userTask: 't' }),
    )

    // Hubo 3 critiques. Ninguna debería contener referencia a "Drafter A/B/C" — solo X/Y.
    for (const msg of seenCritiqueMessages) {
      expect(msg).not.toMatch(/Drafter [ABC]\b/)
    }
  })
})
```

### 5.3 `tests/presentation/Council.test.tsx`

Test de smoke: render de la ruta, click en "Convocar al concejo", verificar transición de estados. Mockeá `useCases.runCouncilChat` para devolver un generator controlado.

---

## 6. Plan de implementación paso a paso

Ejecutá en este orden. **No saltees pasos** — cada uno verifica el anterior.

1. **`git checkout -b feature/council`**
2. Crear `src/domain/council.ts` y `src/domain/councilEvents.ts`. Correr `npm run typecheck` — debe pasar.
3. Crear `src/application/buildCouncilPrompts.ts` y su test `tests/application/buildCouncilPrompts.test.ts`. Correr `npm run test:ci` — debe pasar.
4. Verificar/agregar `ChatPort` en `src/application/ports.ts`. Si no existe un adapter de single-completion, agregarlo en `src/infrastructure/sdk/sdkClient.ts` (o donde corresponda según el patrón de `runAgenticChat`). Pasar `chat: ChatPort` en `composition/root.ts`.
5. Crear `src/application/runCouncilChat.ts`. Crear su test `tests/application/runCouncilChat.test.ts`. Correr `npm run test:ci`.
6. Agregar el use case envuelto con `withHistory` en `src/application/useCases.ts`. Verificar que aparece tipado en `useAppContainer`.
7. Crear `src/presentation/hooks/useCouncilStream.ts`.
8. Crear `src/presentation/components/council/CouncilSetup.tsx` y `CouncilStream.tsx`.
9. Crear `src/presentation/routes/Council.tsx`.
10. Editar `src/app.tsx` para agregar `<Route path="/council" />`.
11. Editar `src/presentation/layout/Sidebar.tsx` para agregar el item.
12. Editar `src/domain/i18n.ts` agregando las ~25 keys EN + ES.
13. Crear `tests/presentation/Council.test.tsx`.
14. Correr `npm run typecheck`, `npm run lint`, `npm run test:ci`. **Todo verde antes de seguir.**
15. `npm run dev` y prueba manual:
    - Ir a `/`, anotar saldo.
    - Ir a `/council`, escribir prompt simple ("¿Cuál es la capital de Perú?"), correr con defaults.
    - Verificar que aparecen 3 drafts en paralelo, después 3 critiques, después el veredicto.
    - Verificar que `/transactions` muestra UNA entrada nueva con kind `council` y costCents agregado.
    - Verificar que el saldo bajó por aprox el `totalCostCents`.
    - Probar con un drafter mal escrito (ej. `google/gemini-modelo-que-no-existe`) — debería emitir `draft_failed` y seguir con los otros 2.

---

## 7. Guardrails y criterios de aceptación

**Tests:**
- `npm run test:ci` pasa con los nuevos tests sumados (esperado: ~110/110 o más).
- `npm run typecheck` pasa sin errores.
- `npm run lint` pasa (cero `no-floating-promises`, cero `no-explicit-any`).
- Coverage thresholds del proyecto se mantienen (80/75 en domain/application/infrastructure).

**Funcionales:**
- Una corrida con defaults termina en <30s en condiciones normales (3 drafts paralelos + 3 critiques paralelas + 1 synthesis).
- Si el saldo del agente no alcanza, la primera llamada falla y el council emite `council_failed` con error claro (no infinite loop, no retry).
- Cambiar de agente activo en medio de una corrida NO contamina la corrida (los eventos siguen llegando hasta que termine, pero el siguiente run usa el nuevo agente).
- Recargar la página durante una corrida la pierde (es UI-only, no se persiste estado intermedio). Esto es aceptable en v1.

**No-funcionales:**
- Cero strings hardcodeados en JSX (todo vía `useT()`).
- Cero Zod en `domain/` ni `application/`.
- `MAX_DRAFTERS = 3` se respeta tanto en config como en runtime (fail con error de validación si alguien lo bypassa).
- `MAX_CRITIQUE_ROUNDS = 1` — el orquestador no implementa más rondas, es estructural.
- El banner mainnet sigue apareciendo si está activo (no bypass).

**Costo:**
- El `estimateCouncilCostCents` muestra al usuario el costo estimado antes de cada corrida.
- Si la estimación supera `COUNCIL_EXPENSIVE_THRESHOLD_CENTS` (50 cents), `window.confirm` pide confirmación.
- El costo real se loggea en `history` vía `withHistory`.

---

## 8. Edge cases conocidos a manejar

1. **Drafter devuelve string vacío.** Tratarlo como respuesta válida (no abortar). El chairman lo verá y lo ignorará en el synthesis.
2. **Drafter responde con texto idéntico a otro.** No dedupe — el critique va a notar la coincidencia y el chairman decidirá. Es ruido aceptable.
3. **Modelo no existe** (`google/foobar`). El SDK devuelve `validation` o `unknown` error → `draft_failed`. Si pasa con 2 de 3, abort.
4. **Chairman es el mismo modelo que un drafter.** Permitido. Solo significa que el chairman ve 3 drafts (uno propio) + 3 critiques. No hay conflicto técnico.
5. **Texto muy largo** (drafts grandes que no caben en el contexto del chairman). En v1, no se trunca. Si algún chairman moderno (200k+ context) no lo banca, el SDK devuelve error y el council falla. Mejora futura: truncar drafts a N tokens antes del synthesis.
6. **El user navega fuera de `/council` mientras corre.** El `useEffect` cleanup en el hook llama `abortRef.current.abort()`, pero las requests HTTP en vuelo NO se cancelan (el SDK no soporta abort signal en v1). Las respuestas que lleguen post-unmount se descartan en el `if (ac.signal.aborted) return`. **Esto significa que el saldo SÍ se descuenta aunque el user se vaya** — es un trade-off aceptable porque el backend ya cobró por la llamada.

---

## 9. Lo que queda fuera de v1 (no implementar ahora)

- Streaming token-por-token de cada draft. Mejora obvia para v2.
- Multi-round debate (`maxCritiqueRounds > 1`). Estructuralmente posible, deshabilitado por costo.
- Persistencia de corridas en Dexie con UI para verlas después (más allá del log agregado en `history`).
- Configuración de prompts custom (system prompts editables).
- Comparación side-by-side de N corridas del mismo prompt con configs distintas.
- Voting/ranking explícito en la critique (en v1 las critiques son prosa libre).
- Pre-flight health check de los modelos drafters (`council doctor` en the-llm-council). En v1 si un modelo está caído, simplemente falla en el draft.

Cualquiera de estos puede ser un follow-up issue.

---

## 10. Comandos de verificación rápida (al final)

```bash
npm run typecheck
npm run lint
npm run test:ci
npm run test:coverage
npm run dev
# Manual en :4301: ir a /council, correr una vez, verificar /transactions
```

Todo verde → PR a `main`.

---

## Apéndice — Diagrama de flujo

```
┌─────────────────────────────────────────────────────────────────┐
│ User en /council escribe prompt + selecciona drafters/chairman  │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
        ┌─────────────────────────────────────────┐
        │ useCouncilStream.start({config, task})  │
        │ → useCases.runCouncilChat(...)          │
        │ → withHistory wrapper inicia tracking   │
        └────────────────────┬────────────────────┘
                             │
                             ▼
        ┌─────────────────────────────────────────┐
        │ runCouncilChat (generator async*)       │
        └─┬───────────────────────────────────────┘
          │ yield: council_started
          ▼
        ┌─────────────────────────────────────────┐
        │ STAGE 1 — drafts paralelos              │
        │ Promise.all([chat(M_A), chat(M_B), ...])│
        │ yield: draft_started ×N → draft_done ×N │
        └─┬───────────────────────────────────────┘
          │
          ▼
        ┌─────────────────────────────────────────┐
        │ STAGE 2 — critiques cruzadas paralelas  │
        │ cada drafter critica los OTROS dos      │
        │ (anonimizados como X/Y)                 │
        │ yield: critique_started ×N → done ×N    │
        └─┬───────────────────────────────────────┘
          │
          ▼
        ┌─────────────────────────────────────────┐
        │ STAGE 3 — synthesis (chairman)          │
        │ chairman ve drafts + critiques          │
        │ yield: synthesis_started → done         │
        └─┬───────────────────────────────────────┘
          │
          ▼
        ┌─────────────────────────────────────────┐
        │ yield: council_done (finalAnswer, cost) │
        │ withHistory persiste 1 entrada agregada │
        │ UI muestra el veredicto destacado       │
        └─────────────────────────────────────────┘
```

---

**Fin del spec.** Si surge ambigüedad implementando, preferí: (1) seguir el patrón de `runAgenticChat.ts`, (2) consultar el contexto del proyecto en el README/`docs/`, (3) NO traer dependencias nuevas. Si algo realmente bloquea, parar y preguntar antes de improvisar.