import { z } from 'zod'

const KEY_PREFIX = 'claim-oauth:'

const PendingSchema = z.object({
  agentUuid: z.string().uuid(),
  turnstileToken: z.string().min(10),
  createdAt: z.number(),
})
export type ClaimPending = z.infer<typeof PendingSchema>

export function savePendingClaim(state: string, data: ClaimPending): void {
  sessionStorage.setItem(KEY_PREFIX + state, JSON.stringify(data))
}

export function loadPendingClaim(state: string): ClaimPending | undefined {
  const raw = sessionStorage.getItem(KEY_PREFIX + state)
  if (!raw) return undefined
  try {
    const parsed = PendingSchema.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : undefined
  } catch {
    return undefined
  }
}

export function clearPendingClaim(state: string): void {
  sessionStorage.removeItem(KEY_PREFIX + state)
}
