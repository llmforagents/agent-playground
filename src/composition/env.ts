import { z } from 'zod'

const EnvSchema = z.object({
  VITE_API_BASE: z.string().min(1),
  VITE_MCP_BASE: z.string().min(1),
  VITE_GITHUB_CLIENT_ID: z.string().min(1).optional(),
  VITE_TURNSTILE_SITE_KEY: z.string().min(1).optional(),
})

export type ClaimConfig = Readonly<{
  githubClientId: string
  turnstileSiteKey: string
}>

export type AppEnv = Readonly<{
  apiBase: string
  mcpBase: string
  claim?: ClaimConfig
}>

export function loadEnv(raw: Readonly<Record<string, string | undefined>>): AppEnv {
  const parsed = EnvSchema.safeParse(raw)
  if (!parsed.success) {
    const errors = parsed.error.issues
      .map((i) => {
        const key = i.path.length > 0 ? i.path.join('.') : '(root)'
        return `  ${key}: ${i.message}`
      })
      .join('\n')
    throw new Error(`Invalid environment:\n${errors}`)
  }
  const { VITE_API_BASE, VITE_MCP_BASE, VITE_GITHUB_CLIENT_ID, VITE_TURNSTILE_SITE_KEY } = parsed.data
  const claim: ClaimConfig | undefined =
    VITE_GITHUB_CLIENT_ID && VITE_TURNSTILE_SITE_KEY
      ? { githubClientId: VITE_GITHUB_CLIENT_ID, turnstileSiteKey: VITE_TURNSTILE_SITE_KEY }
      : undefined
  return claim
    ? { apiBase: VITE_API_BASE, mcpBase: VITE_MCP_BASE, claim }
    : { apiBase: VITE_API_BASE, mcpBase: VITE_MCP_BASE }
}
