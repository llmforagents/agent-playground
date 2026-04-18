import { z } from 'zod'

const EnvSchema = z.object({
  VITE_API_BASE: z.string().min(1),
  VITE_MCP_BASE: z.string().min(1),
})

export type AppEnv = Readonly<{ apiBase: string; mcpBase: string }>

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
  return { apiBase: parsed.data.VITE_API_BASE, mcpBase: parsed.data.VITE_MCP_BASE }
}
