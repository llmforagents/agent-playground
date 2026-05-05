import type { DrafterSlot } from '@/domain/council'

export type ChatMessage = Readonly<{
  role: 'system' | 'user' | 'assistant'
  content: string
}>

const DRAFTER_SYSTEM = `You are one of three independent expert drafters in a council.
Produce your best, complete answer to the user's task. Be thorough but concise.
Do not refer to "other models" or imagine what others would say. Just answer.
If the task requires code, provide working code with brief context.
If the task is open-ended, structure your answer in clear sections.`

export function buildDrafterMessages(userTask: string): ReadonlyArray<ChatMessage> {
  return [
    { role: 'system', content: DRAFTER_SYSTEM },
    { role: 'user', content: userTask },
  ]
}

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
anonymized as Drafter X, Y, etc. — you do not know which model produced each.

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
