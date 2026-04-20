import { describe, it, expect } from 'vitest'
import { runAgenticChat, type AgenticEvent } from '@/application/runAgenticChat'
import { Ok, Err, type Result } from '@/domain/result'
import type { RestApiPort, McpPort, ChatResponseWithMeta } from '@/application/ports'
import type { McpToolResult } from '@/infrastructure/schemas/mcp'
import type { RestError, McpError } from '@/domain/errors'
import { ApiKey, AgentId } from '@/domain/branded'
import type { ChatCompletionResponse } from '@/infrastructure/schemas/rest'

const KEY = ApiKey('sk_test')
const AGENT = AgentId('11111111-1111-4111-8111-111111111111')

function chatWith(messages: readonly { content?: string; tool_calls?: { id: string; type: 'function'; function: { name: string; arguments: string } }[] }[]): RestApiPort {
  let call = 0
  return {
    healthz: async () => Err({ kind: 'network' }) as Result<never, RestError>,
    registerAgent: async () => Err({ kind: 'network' }) as Result<never, RestError>,
    getBalance: async () => Err({ kind: 'network' }) as Result<never, RestError>,
    listModels: async () => Err({ kind: 'network' }) as Result<never, RestError>,
    generateWallet: async () => Err({ kind: 'network' }) as Result<never, RestError>,
    chatCompletion: async (): Promise<Result<ChatResponseWithMeta, RestError>> => {
      const m = messages[call++] ?? { content: '' }
      const data: ChatCompletionResponse = {
        id: `id_${call}`,
        object: 'chat.completion',
        created: 0,
        model: 'test',
        choices: [{
          index: 0,
          message: {
            role: 'assistant' as const,
            content: m.content ?? null,
            ...(m.tool_calls ? { tool_calls: m.tool_calls } : {}),
          },
        }],
      }
      return Ok({ data, meta: { costCents: 2 } })
    },
    chatCompletionStream: async function* () {},
    listTransactions: async () => Err({ kind: 'network' }) as Result<never, RestError>,
    sendTx: async () => Err({ kind: 'network' }) as Result<never, RestError>,
  }
}

async function collect(gen: AsyncGenerator<AgenticEvent, void, void>): Promise<readonly AgenticEvent[]> {
  const out: AgenticEvent[] = []
  for await (const ev of gen) out.push(ev)
  return out
}

function tc(name: string, args: Record<string, unknown>): { id: string; type: 'function'; function: { name: string; arguments: string } } {
  return { id: `tc_${name}_${Math.random()}`, type: 'function', function: { name, arguments: JSON.stringify(args) } }
}

describe('runAgenticChat cost guards', () => {
  it('aborts immediately on the first tool failure — no second chat completion', async () => {
    const failingMcp: McpPort = {
      callTool: async (): Promise<Result<McpToolResult, McpError>> =>
        Err({ kind: 'upstream_error', status: 500, body: 'boom' }),
    }
    let chatCalls = 0
    const rest: RestApiPort = {
      ...chatWith([{ tool_calls: [tc('google_search', { q: 'x' })] }, { content: 'this should never be called' }]),
      chatCompletion: async () => {
        chatCalls++
        const data: ChatCompletionResponse = {
          id: 'id', object: 'chat.completion', created: 0, model: 'test',
          choices: [{
            index: 0,
            message: { role: 'assistant' as const, content: null, tool_calls: [tc('google_search', { q: 'x' })] },
          }],
        }
        return Ok({ data, meta: { costCents: 2 } })
      },
    }
    const events = await collect(runAgenticChat(
      { rest, mcp: failingMcp, key: KEY, agent: AGENT },
      { model: 'openai/gpt-4', messages: [{ role: 'user', content: 'hi' }], mode: 'native' },
    ))
    const aborted = events.find((e) => e.kind === 'aborted')
    expect(aborted).toBeDefined()
    expect(aborted?.kind === 'aborted' && aborted.reason).toBe('tool_failed')
    // CRITICAL: the model was only called ONCE. No retry after the failure.
    expect(chatCalls).toBe(1)
  })

  it('does NOT re-invoke MCP when the model repeats the same tool call with the same args (after success)', async () => {
    let mcpCalls = 0
    const mcp: McpPort = {
      callTool: async (): Promise<Result<McpToolResult, McpError>> => {
        mcpCalls++
        return Ok({ content: [{ type: 'text' as const, text: 'result' }] })
      },
    }
    const rest = chatWith([
      { tool_calls: [tc('google_search', { q: 'x' })] },
      { tool_calls: [tc('google_search', { q: 'x' })] }, // same args — should be guarded
      { content: 'final answer' },
    ])
    const events = await collect(runAgenticChat(
      { rest, mcp, key: KEY, agent: AGENT },
      { model: 'openai/gpt-4', messages: [{ role: 'user', content: 'hi' }], mode: 'native', maxIterations: 5 },
    ))
    expect(mcpCalls).toBe(1)
    expect(events.find((e) => e.kind === 'final')).toBeDefined()
  })

  it('aborts when the model retries a previously failed tool with the same args', async () => {
    let mcpCalls = 0
    const mcp: McpPort = {
      callTool: async (): Promise<Result<McpToolResult, McpError>> => {
        mcpCalls++
        return Err({ kind: 'upstream_error', status: 500, body: 'boom' })
      },
    }
    const rest = chatWith([
      { tool_calls: [tc('google_search', { q: 'x' })] },
      { tool_calls: [tc('google_search', { q: 'x' })] }, // same failed args — abort
    ])
    const events = await collect(runAgenticChat(
      { rest, mcp, key: KEY, agent: AGENT },
      { model: 'openai/gpt-4', messages: [{ role: 'user', content: 'hi' }], mode: 'native', maxIterations: 5 },
    ))
    // First call fails → abort immediately. MCP called only once.
    expect(mcpCalls).toBe(1)
    const aborted = events.find((e) => e.kind === 'aborted')
    expect(aborted).toBeDefined()
  })

  it('respects the 3-tool-call cap', async () => {
    let mcpCalls = 0
    const mcp: McpPort = {
      callTool: async (): Promise<Result<McpToolResult, McpError>> => {
        mcpCalls++
        return Ok({ content: [{ type: 'text' as const, text: `r${mcpCalls}` }] })
      },
    }
    const rest = chatWith([
      { tool_calls: [tc('google_search', { q: 'a' })] },
      { tool_calls: [tc('google_search', { q: 'b' })] },
      { tool_calls: [tc('google_search', { q: 'c' })] },
      { tool_calls: [tc('google_search', { q: 'd' })] }, // 4th — cap should kick in
    ])
    const events = await collect(runAgenticChat(
      { rest, mcp, key: KEY, agent: AGENT },
      { model: 'openai/gpt-4', messages: [{ role: 'user', content: 'hi' }], mode: 'native', maxIterations: 10 },
    ))
    expect(mcpCalls).toBe(3)
    const aborted = events.find((e) => e.kind === 'aborted')
    expect(aborted?.kind === 'aborted' && aborted.reason).toBe('tool_cap_reached')
  })

  it('aborts on unknown tool (does not keep calling the model)', async () => {
    const mcp: McpPort = {
      callTool: async (): Promise<Result<McpToolResult, McpError>> =>
        Ok({ content: [{ type: 'text' as const, text: 'never called' }] }),
    }
    let chatCalls = 0
    const rest: RestApiPort = {
      ...chatWith([]),
      chatCompletion: async () => {
        chatCalls++
        return Ok({
          data: {
            id: 'id', object: 'chat.completion', created: 0, model: 'test',
            choices: [{
              index: 0,
              message: { role: 'assistant' as const, content: null, tool_calls: [tc('totally_fake_tool', {})] },
            }],
          },
          meta: {},
        })
      },
    }
    const events = await collect(runAgenticChat(
      { rest, mcp, key: KEY, agent: AGENT },
      { model: 'openai/gpt-4', messages: [{ role: 'user', content: 'hi' }], mode: 'native' },
    ))
    expect(chatCalls).toBe(1)
    expect(events.find((e) => e.kind === 'aborted')).toBeDefined()
  })
})
