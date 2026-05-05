import { describe, it, expect } from 'vitest'
import {
  buildDrafterMessages,
  buildCritiqueMessages,
  buildSynthesisMessages,
  anonymizeOthers,
} from '@/application/buildCouncilPrompts'

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
