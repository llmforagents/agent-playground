import type { McpToolName } from './scraper'

export type ChatToolDef = Readonly<{
  mcpName: McpToolName
  category: 'search' | 'scraper' | 'image'
  costPerCall: string
  openai: {
    type: 'function'
    function: {
      name: string
      description: string
      parameters: {
        type: 'object'
        properties: Record<string, unknown>
        required: readonly string[]
      }
    }
  }
}>

const SEARCH_COMMON = {
  q: { type: 'string', description: 'Search query (max 2048 chars)' },
  gl: { type: 'string', description: 'Country code, 2 chars (e.g. "us", "ar", "es")' },
  hl: { type: 'string', description: 'Language code, 2-5 chars (e.g. "en", "es", "pt-BR")' },
  tbs: { type: 'string', description: 'Date filter: "qdr:h" (last hour), "qdr:d" (day), "qdr:w" (week)' },
  page: { type: 'integer', description: 'Page number, >= 1' },
  location: { type: 'string', description: 'Geographic location hint (max 200 chars)' },
} as const

export const CHAT_TOOLS: readonly ChatToolDef[] = [
  {
    mcpName: 'google_search',
    category: 'search',
    costPerCall: '$0.0012',
    openai: {
      type: 'function',
      function: {
        name: 'google_search',
        description: 'Search Google for organic web results. Use for current events, facts, finding URLs, or when your knowledge might be outdated.',
        parameters: { type: 'object', properties: SEARCH_COMMON, required: ['q'] },
      },
    },
  },
  {
    mcpName: 'google_news',
    category: 'search',
    costPerCall: '$0.0012',
    openai: {
      type: 'function',
      function: {
        name: 'google_news',
        description: 'Search Google News for recent articles. Returns title, link, snippet, date, source. Use "tbs=qdr:h" or "qdr:d" for recent news.',
        parameters: { type: 'object', properties: SEARCH_COMMON, required: ['q'] },
      },
    },
  },
  {
    mcpName: 'google_maps',
    category: 'search',
    costPerCall: '$0.0012',
    openai: {
      type: 'function',
      function: {
        name: 'google_maps',
        description: 'Search Google Maps for places and businesses. Returns title, address, lat/lng, rating, phone, website.',
        parameters: { type: 'object', properties: SEARCH_COMMON, required: ['q'] },
      },
    },
  },
  {
    mcpName: 'fetch_html',
    category: 'scraper',
    costPerCall: '$0.0007',
    openai: {
      type: 'function',
      function: {
        name: 'fetch_html',
        description: 'Fetch the full HTML of a given URL. Prefer `markdown` for readable content; use this only when raw HTML is needed.',
        parameters: {
          type: 'object',
          properties: {
            url: { type: 'string', description: 'The URL to fetch' },
            proxy_tier: { type: 'string', enum: ['none', 'datacenter', 'residential'], description: 'Proxy tier, default "none"' },
          },
          required: ['url'],
        },
      },
    },
  },
  {
    mcpName: 'markdown',
    category: 'scraper',
    costPerCall: '$0.0010',
    openai: {
      type: 'function',
      function: {
        name: 'markdown',
        description: 'Render a webpage as Markdown. Best for reading articles, documentation, blog posts.',
        parameters: {
          type: 'object',
          properties: {
            url: { type: 'string', description: 'The URL to fetch' },
            selector: { type: 'string', description: 'Optional CSS selector to scope the extraction' },
            proxy_tier: { type: 'string', enum: ['none', 'datacenter', 'residential'], description: 'Proxy tier, default "none"' },
          },
          required: ['url'],
        },
      },
    },
  },
  {
    mcpName: 'links',
    category: 'scraper',
    costPerCall: '$0.0007',
    openai: {
      type: 'function',
      function: {
        name: 'links',
        description: 'Extract all links from a webpage. Returns an array of {href, text}.',
        parameters: {
          type: 'object',
          properties: {
            url: { type: 'string', description: 'The URL to fetch' },
            same_origin_only: { type: 'boolean', description: 'If true, only include same-origin links' },
            proxy_tier: { type: 'string', enum: ['none', 'datacenter', 'residential'], description: 'Proxy tier, default "none"' },
          },
          required: ['url'],
        },
      },
    },
  },
  {
    mcpName: 'extract',
    category: 'scraper',
    costPerCall: '$0.0012',
    openai: {
      type: 'function',
      function: {
        name: 'extract',
        description: 'Extract structured fields from a webpage using CSS selectors. Returns an object with the selector values.',
        parameters: {
          type: 'object',
          properties: {
            url: { type: 'string', description: 'The URL to fetch' },
            selectors: {
              type: 'object',
              description: 'Map of field name → CSS selector. E.g. {"title": "h1", "price": ".price"}',
              additionalProperties: { type: 'string' },
            },
            proxy_tier: { type: 'string', enum: ['none', 'datacenter', 'residential'], description: 'Proxy tier, default "none"' },
          },
          required: ['url', 'selectors'],
        },
      },
    },
  },
  {
    mcpName: 'generate_image',
    category: 'image',
    costPerCall: '$0.01–$0.02',
    openai: {
      type: 'function',
      function: {
        name: 'generate_image',
        description: 'Generate a PNG image from a text prompt. Returns a base64 PNG. Use when the user asks to create, draw, or imagine a picture. Cost: $0.01 up to 1.5 MP, $0.02 above.',
        parameters: {
          type: 'object',
          properties: {
            prompt: { type: 'string', description: 'What to draw (max 4096 chars)' },
            width: { type: 'integer', description: 'Width in pixels (512–2048, default 1024)' },
            height: { type: 'integer', description: 'Height in pixels (512–2048, default 1024)' },
          },
          required: ['prompt'],
        },
      },
    },
  },
  {
    mcpName: 'edit_image',
    category: 'image',
    costPerCall: '$0.02',
    openai: {
      type: 'function',
      function: {
        name: 'edit_image',
        description: 'Edit an existing image from a text prompt. Returns a base64 PNG. Use when the user wants to modify an image (remove background, add/remove elements, restyle).',
        parameters: {
          type: 'object',
          properties: {
            prompt: { type: 'string', description: 'What to change in the image (max 4096 chars)' },
            image: { type: 'string', description: 'Source image: either an https URL or a base64 data URI' },
            aspect_ratio: {
              type: 'string',
              enum: ['match_input_image', '1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3'],
              description: 'Optional aspect ratio',
            },
          },
          required: ['prompt', 'image'],
        },
      },
    },
  },
  {
    mcpName: 'analyze_image',
    category: 'image',
    costPerCall: '$0.006',
    openai: {
      type: 'function',
      function: {
        name: 'analyze_image',
        description: 'Describe or answer a question about an image (vision). Returns a text answer. Use for OCR, captions, or visual Q&A. Cheaper than generate/edit.',
        parameters: {
          type: 'object',
          properties: {
            prompt: { type: 'string', description: 'What to ask about the image (max 4096 chars)' },
            image: { type: 'string', description: 'Source image: either an https URL or a base64 data URI' },
          },
          required: ['prompt', 'image'],
        },
      },
    },
  },
]

export function findChatTool(name: string): ChatToolDef | undefined {
  if (!name) return undefined
  const exact = CHAT_TOOLS.find((t) => t.openai.function.name === name)
  if (exact) return exact
  // Fuzzy matching for common LLM mistakes: "search" → "google_search", etc.
  const lower = name.toLowerCase()
  // Strip common prefixes/suffixes
  const normalized = lower.replace(/^(call_|tool_|mcp_|fn_|function_)/, '').replace(/-/g, '_')
  const alt = CHAT_TOOLS.find((t) => t.openai.function.name === normalized)
  if (alt) return alt
  // Aliases: "search" → first matching tool
  if (/^search$|^web_?search$|^google$/.test(lower)) {
    return CHAT_TOOLS.find((t) => t.openai.function.name === 'google_search')
  }
  if (/^news$/.test(lower)) {
    return CHAT_TOOLS.find((t) => t.openai.function.name === 'google_news')
  }
  if (/^maps?$|^places?$/.test(lower)) {
    return CHAT_TOOLS.find((t) => t.openai.function.name === 'google_maps')
  }
  if (/^fetch$|^get_?html$|^html$/.test(lower)) {
    return CHAT_TOOLS.find((t) => t.openai.function.name === 'fetch_html')
  }
  if (/^to_?markdown$|^md$/.test(lower)) {
    return CHAT_TOOLS.find((t) => t.openai.function.name === 'markdown')
  }
  if (/^(generate|create|draw|make)_?(image|picture|img)$|^image$|^txt2img$|^text_to_image$/.test(lower)) {
    return CHAT_TOOLS.find((t) => t.openai.function.name === 'generate_image')
  }
  if (/^(edit|modify|change)_?(image|picture|img)$|^img2img$/.test(lower)) {
    return CHAT_TOOLS.find((t) => t.openai.function.name === 'edit_image')
  }
  if (/^(analyze|describe|caption|ocr|vision|view)_?(image|picture|img)?$/.test(lower)) {
    return CHAT_TOOLS.find((t) => t.openai.function.name === 'analyze_image')
  }
  return undefined
}
