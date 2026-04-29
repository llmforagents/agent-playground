export type Effort = 'off' | 'low' | 'medium' | 'high'

export type ReasoningFamily = 'enum_effort' | 'boolean_toggle' | 'token_budget'

export const REASONING_PREFIXES: ReadonlyArray<{
  readonly prefix: string
  readonly family: ReasoningFamily
}> = [
  { prefix: 'anthropic/claude-sonnet-4',         family: 'enum_effort' },
  { prefix: 'anthropic/claude-opus-4',           family: 'enum_effort' },
  { prefix: 'openai/o1',                         family: 'enum_effort' },
  { prefix: 'openai/o3',                         family: 'enum_effort' },
  { prefix: 'openai/o4',                         family: 'enum_effort' },
  { prefix: 'deepseek/deepseek-r1',              family: 'boolean_toggle' },
  { prefix: 'qwen/qwq',                          family: 'boolean_toggle' },
  { prefix: 'google/gemini-2.5-flash-thinking',  family: 'token_budget' },
  { prefix: 'google/gemini-2.5-pro-thinking',    family: 'token_budget' },
]

const TOKEN_BUDGET_BY_LEVEL: Readonly<Record<Exclude<Effort, 'off'>, number>> = {
  low: 500,
  medium: 2000,
  high: 8000,
}

export function detectReasoningFamily(modelSlug: string): ReasoningFamily | undefined {
  const s = modelSlug.toLowerCase()
  return REASONING_PREFIXES.find((entry) => s.startsWith(entry.prefix))?.family
}

export function buildReasoningPayload(model: string, effort: Effort): Record<string, unknown> {
  if (effort === 'off') return {}
  const family = detectReasoningFamily(model)
  if (family === undefined) return {}
  switch (family) {
    case 'enum_effort':    return { reasoning: { effort } }
    case 'boolean_toggle': return { include_reasoning: true }
    case 'token_budget':   return { reasoning: { max_tokens: TOKEN_BUDGET_BY_LEVEL[effort] } }
  }
}
