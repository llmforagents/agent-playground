import { LLM4AgentsClient } from '@llmforagents/sdk'
import type { ApiKey } from '@/domain/branded'

const DEFAULT_TIMEOUT_MS = 60_000

export type SdkConfig = Readonly<{
  baseUrl?: string
  mcpUrl?: string
  timeout?: number
}>

// The playground is multi-agent: the active apiKey changes at runtime, and
// LLM4AgentsClient locks the key in the constructor. Building a fresh client
// per call is cheap (no I/O happens in the constructor — it just stores
// config), so this matches the existing `getBalance(key)` / `chatCompletion(key, ...)`
// signatures without needing a per-agent cache.
export function createSdkClient(apiKey: ApiKey, config?: SdkConfig): LLM4AgentsClient {
  return new LLM4AgentsClient({
    apiKey: apiKey as unknown as string,
    ...(config?.baseUrl !== undefined ? { baseUrl: config.baseUrl } : {}),
    ...(config?.mcpUrl !== undefined ? { mcpUrl: config.mcpUrl } : {}),
    timeout: config?.timeout ?? DEFAULT_TIMEOUT_MS,
  })
}
