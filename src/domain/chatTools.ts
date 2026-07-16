import type { McpToolName } from './scraper'

export type ChatToolDef = Readonly<{
  mcpName: McpToolName
  category: 'search' | 'scraper' | 'image' | 'ai' | 'notify' | 'data' | 'vector' | 'web_crawl' | 'memory' | 'web3' | 'document' | 'graph' | 'skills' | 'workspace'
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
    mcpName: 'google_batch_search',
    category: 'search',
    costPerCall: '$0.0012 × N',
    openai: {
      type: 'function',
      function: {
        name: 'google_batch_search',
        description: 'Run 2–100 Google web searches in PARALLEL in a single tool call. Use this whenever you need to look up several independent things at once (e.g. comparing multiple products, fetching facts about several people/places, or researching different angles of one question) — it is much faster than calling google_search several times sequentially. Each query is billed at the google_search rate.',
        parameters: {
          type: 'object',
          properties: {
            queries: {
              type: 'array',
              minItems: 1,
              maxItems: 100,
              description: 'List of independent search queries to run in parallel. Each item has the same shape as google_search params.',
              items: {
                type: 'object',
                properties: SEARCH_COMMON,
                required: ['q'],
              },
            },
          },
          required: ['queries'],
        },
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
        description: 'Fetch the full HTML of a given URL. Prefer `markdown` for readable content; use this only when raw HTML is needed. Set `auto_fallback: true` for sites that may block or rate-limit datacenter requests (news, ecommerce, social, financial dashboards) — the tool will then transparently retry with a datacenter and residential proxy if the direct fetch fails.',
        parameters: {
          type: 'object',
          properties: {
            url: { type: 'string', description: 'The URL to fetch' },
            proxy_tier: { type: 'string', enum: ['none', 'datacenter', 'residential'], description: 'Starting proxy tier. Default "none". With auto_fallback=true the tool may escalate to higher tiers; without it, the requested tier is honored exactly.' },
            auto_fallback: { type: 'boolean', description: 'If true and the requested tier fails, retry with higher tiers (datacenter → residential). Default false. You are billed at the tier that actually returned the page.' },
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

  {
    mcpName: 'generate_ad_banner',
    category: 'image',
    costPerCall: '$0.06',
    openai: {
      type: 'function',
      function: {
        name: 'generate_ad_banner',
        description: 'Generate an advertising banner at an EXACT pixel size for an ad network (Google, Meta, Instagram, LinkedIn, Reddit, X, TikTok, Pinterest). Returns a base64 image cropped to the requested size. Give a size as either `preset` (a catalog key like "leaderboard", "medium_rectangle", "fb_story", or a "WxH" string like "728x90") OR both `width` and `height`. Use when the user asks for an ad, banner, or creative at a specific ad size. Cost: $0.06 per banner.',
        parameters: {
          type: 'object',
          properties: {
            prompt: { type: 'string', description: 'What the banner should show (max 4096 chars)' },
            preset: { type: 'string', description: 'Ad-size preset key (e.g. "leaderboard", "medium_rectangle", "fb_story") or a "WxH" string (e.g. "728x90"). Provide this OR width+height.' },
            width: { type: 'integer', description: 'Banner width in pixels (16–4000). Use with height when not using a preset.' },
            height: { type: 'integer', description: 'Banner height in pixels (16–4000). Use with width when not using a preset.' },
            output_format: { type: 'string', enum: ['png', 'jpeg'], description: 'Output format, default "png".' },
            images: { type: 'array', items: { type: 'string' }, description: 'Optional reference images (e.g. a brand logo) as https URLs or base64 data URIs; the banner is composed using them.' },
          },
          required: ['prompt'],
        },
      },
    },
  },

  // === AI ===
  {
    mcpName: 'ai_summarize',
    category: 'ai',
    costPerCall: '$0.005',
    openai: {
      type: 'function',
      function: {
        name: 'ai_summarize',
        description: 'Summarize long text into a concise version. Use when the user wants a TL;DR, abstract, or shorter form of a passage, article, or document.',
        parameters: {
          type: 'object',
          properties: {
            text: { type: 'string', description: 'The text to summarize' },
            max_words: { type: 'integer', description: 'Optional maximum length of the summary in words' },
          },
          required: ['text'],
        },
      },
    },
  },
  {
    mcpName: 'ai_translate',
    category: 'ai',
    costPerCall: '$0.005',
    openai: {
      type: 'function',
      function: {
        name: 'ai_translate',
        description: 'Translate text into a target language. Use when the user asks to translate or localize content.',
        parameters: {
          type: 'object',
          properties: {
            text: { type: 'string', description: 'The text to translate' },
            target_lang: { type: 'string', description: 'Target language code or name (e.g. "es", "fr", "Japanese")' },
            source_lang: { type: 'string', description: 'Optional source language code or name; auto-detected if omitted' },
          },
          required: ['text', 'target_lang'],
        },
      },
    },
  },
  {
    mcpName: 'ai_embed',
    category: 'ai',
    costPerCall: '$0.001',
    openai: {
      type: 'function',
      function: {
        name: 'ai_embed',
        description: 'Compute a 768-dimensional embedding vector for one or more texts. Use for semantic search, clustering, or similarity comparisons.',
        parameters: {
          type: 'object',
          properties: {
            input: {
              description: 'A single string or an array of strings to embed',
              anyOf: [
                { type: 'string' },
                { type: 'array', items: { type: 'string' } },
              ],
            },
          },
          required: ['input'],
        },
      },
    },
  },
  {
    mcpName: 'ai_classify',
    category: 'ai',
    costPerCall: '$0.01',
    openai: {
      type: 'function',
      function: {
        name: 'ai_classify',
        description: 'Zero-shot classify a text into exactly one of the provided candidate labels. Use for routing, tagging, or sentiment/intent detection.',
        parameters: {
          type: 'object',
          properties: {
            text: { type: 'string', description: 'The text to classify' },
            labels: {
              type: 'array',
              items: { type: 'string' },
              minItems: 2,
              maxItems: 20,
              description: 'Candidate labels to choose from (2–20)',
            },
          },
          required: ['text', 'labels'],
        },
      },
    },
  },
  {
    mcpName: 'ai_moderate',
    category: 'ai',
    costPerCall: '$0.01',
    openai: {
      type: 'function',
      function: {
        name: 'ai_moderate',
        description: 'Moderate text for unsafe content (hate, harassment, sexual, self-harm, violence). Returns per-category scores and flags.',
        parameters: {
          type: 'object',
          properties: {
            text: { type: 'string', description: 'The text to moderate' },
          },
          required: ['text'],
        },
      },
    },
  },
  {
    mcpName: 'ai_rerank',
    category: 'ai',
    costPerCall: '$0.01',
    openai: {
      type: 'function',
      function: {
        name: 'ai_rerank',
        description: 'Rerank a list of documents by relevance to a query. Use to improve search/RAG results after an initial retrieval step.',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'The query to rank documents against' },
            documents: {
              type: 'array',
              items: { type: 'string' },
              description: 'The candidate documents to rerank',
            },
            top_k: { type: 'integer', description: 'Optional number of top results to return' },
          },
          required: ['query', 'documents'],
        },
      },
    },
  },
  {
    mcpName: 'image_to_text',
    category: 'ai',
    costPerCall: '$0.02',
    openai: {
      type: 'function',
      function: {
        name: 'image_to_text',
        description: 'OCR or caption an image provided as base64. Returns the extracted text or a description.',
        parameters: {
          type: 'object',
          properties: {
            image_base64: { type: 'string', description: 'The image encoded as base64' },
          },
          required: ['image_base64'],
        },
      },
    },
  },
  {
    mcpName: 'speech_to_text',
    category: 'ai',
    costPerCall: '$0.015/MB',
    openai: {
      type: 'function',
      function: {
        name: 'speech_to_text',
        description: 'Transcribe audio to text using Whisper. Provide the audio as base64. Billed per MB of audio.',
        parameters: {
          type: 'object',
          properties: {
            audio_base64: { type: 'string', description: 'The audio file encoded as base64' },
          },
          required: ['audio_base64'],
        },
      },
    },
  },

  // === Notify ===
  {
    mcpName: 'send_telegram',
    category: 'notify',
    costPerCall: '$0.01',
    openai: {
      type: 'function',
      function: {
        name: 'send_telegram',
        description: 'Send a message to a Telegram chat via a bot token. Supports optional Markdown/HTML formatting.',
        parameters: {
          type: 'object',
          properties: {
            bot_token: { type: 'string', description: 'The Telegram bot token' },
            chat_id: {
              description: 'Target chat id (numeric) or @channel username',
              anyOf: [
                { type: 'string' },
                { type: 'number' },
              ],
            },
            text: { type: 'string', description: 'The message text to send' },
            parse_mode: { type: 'string', enum: ['Markdown', 'MarkdownV2', 'HTML'], description: 'Optional formatting mode' },
          },
          required: ['bot_token', 'chat_id', 'text'],
        },
      },
    },
  },
  {
    mcpName: 'send_discord',
    category: 'notify',
    costPerCall: '$0.01',
    openai: {
      type: 'function',
      function: {
        name: 'send_discord',
        description: 'Post a message to a Discord channel via an incoming webhook URL.',
        parameters: {
          type: 'object',
          properties: {
            webhook_url: { type: 'string', description: 'The Discord webhook URL' },
            content: { type: 'string', description: 'The message content to post' },
          },
          required: ['webhook_url', 'content'],
        },
      },
    },
  },
  {
    mcpName: 'send_slack',
    category: 'notify',
    costPerCall: '$0.01',
    openai: {
      type: 'function',
      function: {
        name: 'send_slack',
        description: 'Post a message to a Slack channel via an incoming webhook URL.',
        parameters: {
          type: 'object',
          properties: {
            webhook_url: { type: 'string', description: 'The Slack webhook URL' },
            text: { type: 'string', description: 'The message text to post' },
          },
          required: ['webhook_url', 'text'],
        },
      },
    },
  },
  {
    mcpName: 'webhook_post',
    category: 'notify',
    costPerCall: '$0.01',
    openai: {
      type: 'function',
      function: {
        name: 'webhook_post',
        description: 'POST a JSON body to an arbitrary URL (SSRF-guarded). Use to trigger external webhooks or APIs.',
        parameters: {
          type: 'object',
          properties: {
            url: { type: 'string', description: 'The destination URL' },
            body: { description: 'The JSON body to send' },
            headers: { type: 'object', description: 'Optional additional request headers', additionalProperties: { type: 'string' } },
          },
          required: ['url', 'body'],
        },
      },
    },
  },
  {
    mcpName: 'send_email',
    category: 'notify',
    costPerCall: '$0.02',
    openai: {
      type: 'function',
      function: {
        name: 'send_email',
        description: 'Send an email. Provide either an html or a text body (or both).',
        parameters: {
          type: 'object',
          properties: {
            to: { type: 'string', description: 'Recipient email address' },
            subject: { type: 'string', description: 'Email subject line' },
            html: { type: 'string', description: 'HTML body (provide html or text)' },
            text: { type: 'string', description: 'Plain-text body (provide html or text)' },
            from: { type: 'string', description: 'Optional sender address' },
          },
          required: ['to', 'subject'],
        },
      },
    },
  },
  {
    mcpName: 'send_sms',
    category: 'notify',
    costPerCall: '$0.03',
    openai: {
      type: 'function',
      function: {
        name: 'send_sms',
        description: 'Send an SMS text message to a phone number in E.164 format.',
        parameters: {
          type: 'object',
          properties: {
            to: { type: 'string', description: 'Recipient phone number in E.164 format (e.g. "+14155552671")' },
            body: { type: 'string', description: 'The SMS message body' },
          },
          required: ['to', 'body'],
        },
      },
    },
  },

  // === Data ===
  {
    mcpName: 'dns_lookup',
    category: 'data',
    costPerCall: 'Free',
    openai: {
      type: 'function',
      function: {
        name: 'dns_lookup',
        description: 'Resolve DNS records for a hostname. Use to look up A, AAAA, MX, TXT, NS, CNAME, or SOA records.',
        parameters: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'The hostname to resolve' },
            type: { type: 'string', enum: ['A', 'AAAA', 'MX', 'TXT', 'NS', 'CNAME', 'SOA'], description: 'Record type, default "A"' },
          },
          required: ['name'],
        },
      },
    },
  },
  {
    mcpName: 'ip_geolocate',
    category: 'data',
    costPerCall: 'Free',
    openai: {
      type: 'function',
      function: {
        name: 'ip_geolocate',
        description: 'Geolocate an IP address. Returns country, region, city, and approximate coordinates.',
        parameters: {
          type: 'object',
          properties: {
            ip: { type: 'string', description: 'The IPv4 or IPv6 address to locate' },
          },
          required: ['ip'],
        },
      },
    },
  },
  {
    mcpName: 'url_unfurl',
    category: 'data',
    costPerCall: '$0.01',
    openai: {
      type: 'function',
      function: {
        name: 'url_unfurl',
        description: 'Fetch OpenGraph metadata for a URL: title, description, and preview image. Use to build link previews.',
        parameters: {
          type: 'object',
          properties: {
            url: { type: 'string', description: 'The URL to unfurl' },
          },
          required: ['url'],
        },
      },
    },
  },
  {
    mcpName: 'rss_parse',
    category: 'data',
    costPerCall: '$0.01',
    openai: {
      type: 'function',
      function: {
        name: 'rss_parse',
        description: 'Parse an RSS or Atom feed into structured items (title, link, date, summary).',
        parameters: {
          type: 'object',
          properties: {
            url: { type: 'string', description: 'The feed URL' },
            limit: { type: 'integer', description: 'Optional maximum number of items to return' },
          },
          required: ['url'],
        },
      },
    },
  },
  {
    mcpName: 'youtube_transcript',
    category: 'data',
    costPerCall: '$0.01',
    openai: {
      type: 'function',
      function: {
        name: 'youtube_transcript',
        description: 'Get the transcript of a YouTube video. Accepts a video id or URL.',
        parameters: {
          type: 'object',
          properties: {
            video: { type: 'string', description: 'The YouTube video id or URL' },
            lang: { type: 'string', description: 'Optional preferred transcript language code (e.g. "en")' },
          },
          required: ['video'],
        },
      },
    },
  },
  {
    mcpName: 'whois',
    category: 'data',
    costPerCall: '$0.01',
    openai: {
      type: 'function',
      function: {
        name: 'whois',
        description: 'Look up domain registration details via RDAP (registrar, dates, nameservers, status).',
        parameters: {
          type: 'object',
          properties: {
            domain: { type: 'string', description: 'The domain name to look up' },
          },
          required: ['domain'],
        },
      },
    },
  },
  {
    mcpName: 'crypto_price',
    category: 'data',
    costPerCall: '$0.01',
    openai: {
      type: 'function',
      function: {
        name: 'crypto_price',
        description: 'Get current crypto spot prices from CoinGecko for one or more coins.',
        parameters: {
          type: 'object',
          properties: {
            ids: {
              type: 'array',
              items: { type: 'string' },
              description: 'CoinGecko coin ids (e.g. ["bitcoin", "ethereum"])',
            },
            vs_currencies: {
              type: 'array',
              items: { type: 'string' },
              description: 'Optional quote currencies (e.g. ["usd", "eur"]), default ["usd"]',
            },
          },
          required: ['ids'],
        },
      },
    },
  },
  {
    mcpName: 'fx_convert',
    category: 'data',
    costPerCall: '$0.01',
    openai: {
      type: 'function',
      function: {
        name: 'fx_convert',
        description: 'Convert an amount between fiat currencies using ECB reference rates.',
        parameters: {
          type: 'object',
          properties: {
            amount: { type: 'number', description: 'The amount to convert' },
            from: { type: 'string', description: 'Source currency code (e.g. "USD")' },
            to: { type: 'string', description: 'Target currency code (e.g. "EUR")' },
          },
          required: ['amount', 'from', 'to'],
        },
      },
    },
  },
  {
    mcpName: 'qr_generate',
    category: 'data',
    costPerCall: '$0.01',
    openai: {
      type: 'function',
      function: {
        name: 'qr_generate',
        description: 'Generate a QR code as an SVG from arbitrary data (URL, text, etc.).',
        parameters: {
          type: 'object',
          properties: {
            data: { type: 'string', description: 'The data to encode in the QR code' },
            size: { type: 'integer', description: 'Optional output size in pixels' },
            ecc: { type: 'string', enum: ['L', 'M', 'Q', 'H'], description: 'Optional error-correction level' },
          },
          required: ['data'],
        },
      },
    },
  },
  {
    mcpName: 'captcha_solve_create',
    category: 'data',
    costPerCall: '$0.02',
    openai: {
      type: 'function',
      function: {
        name: 'captcha_solve_create',
        description: 'Submit a captcha to be solved. Returns a task id to poll with captcha_solve_result.',
        parameters: {
          type: 'object',
          properties: {
            type: { type: 'string', description: 'Captcha type (e.g. "recaptcha_v2", "hcaptcha", "turnstile")' },
            website_url: { type: 'string', description: 'The page URL hosting the captcha' },
            website_key: { type: 'string', description: 'The captcha site key' },
          },
          required: ['type', 'website_url', 'website_key'],
        },
      },
    },
  },
  {
    mcpName: 'captcha_solve_result',
    category: 'data',
    costPerCall: 'Free',
    openai: {
      type: 'function',
      function: {
        name: 'captcha_solve_result',
        description: 'Poll the result of a captcha task created with captcha_solve_create.',
        parameters: {
          type: 'object',
          properties: {
            task_id: { type: 'string', description: 'The task id returned by captcha_solve_create' },
          },
          required: ['task_id'],
        },
      },
    },
  },

  // === Vector ===
  {
    mcpName: 'vector_upsert',
    category: 'vector',
    costPerCall: '$0.005',
    openai: {
      type: 'function',
      function: {
        name: 'vector_upsert',
        description: 'Upsert items into your private vector store. Provide text (auto-embedded) and/or a precomputed vector per item.',
        parameters: {
          type: 'object',
          properties: {
            items: {
              type: 'array',
              description: 'The items to upsert',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string', description: 'Unique id for the item' },
                  text: { type: 'string', description: 'Text to embed (auto-embedded if no vector given)' },
                  vector: { type: 'array', items: { type: 'number' }, description: 'Optional precomputed embedding vector' },
                  metadata: { type: 'object', description: 'Optional metadata stored alongside the item' },
                },
                required: ['id'],
              },
            },
          },
          required: ['items'],
        },
      },
    },
  },
  {
    mcpName: 'vector_query',
    category: 'vector',
    costPerCall: '$0.01',
    openai: {
      type: 'function',
      function: {
        name: 'vector_query',
        description: 'Semantic search over your private vector store. Provide a text query (auto-embedded) or a raw vector.',
        parameters: {
          type: 'object',
          properties: {
            query: {
              description: 'A text query (auto-embedded) or a raw embedding vector',
              anyOf: [
                { type: 'string' },
                { type: 'array', items: { type: 'number' } },
              ],
            },
            top_k: { type: 'integer', description: 'Optional number of results to return' },
            filter: { type: 'object', description: 'Optional metadata filter' },
          },
          required: ['query'],
        },
      },
    },
  },
  {
    mcpName: 'vector_delete',
    category: 'vector',
    costPerCall: 'Free',
    openai: {
      type: 'function',
      function: {
        name: 'vector_delete',
        description: 'Delete items from your private vector store by id.',
        parameters: {
          type: 'object',
          properties: {
            ids: {
              type: 'array',
              items: { type: 'string' },
              description: 'The ids of the items to delete',
            },
          },
          required: ['ids'],
        },
      },
    },
  },

  // === Web Crawl ===
  {
    mcpName: 'web_crawl',
    category: 'web_crawl',
    costPerCall: '$0.005/page',
    openai: {
      type: 'function',
      function: {
        name: 'web_crawl',
        description: 'Crawl a site breadth-first starting from a URL and return aggregated markdown or a link graph. Billed per page crawled.',
        parameters: {
          type: 'object',
          properties: {
            start_url: { type: 'string', description: 'The URL to start crawling from' },
            max_pages: { type: 'integer', description: 'Optional maximum number of pages to crawl' },
            max_depth: { type: 'integer', description: 'Optional maximum link depth from the start URL' },
            allow_subdomains: { type: 'boolean', description: 'If true, follow links into subdomains' },
            render: { type: 'boolean', description: 'If true, render JavaScript before extracting' },
            include: { type: 'array', items: { type: 'string' }, description: 'Optional URL patterns to include' },
            exclude: { type: 'array', items: { type: 'string' }, description: 'Optional URL patterns to exclude' },
            output: { type: 'string', enum: ['markdown', 'links'], description: 'Output format, default "markdown"' },
            save_to_workspace: { type: 'boolean', description: 'If true, save crawl output to the workspace' },
          },
          required: ['start_url'],
        },
      },
    },
  },

  // === Memory ===
  {
    mcpName: 'memory_set',
    category: 'memory',
    costPerCall: '$0.01',
    openai: {
      type: 'function',
      function: {
        name: 'memory_set',
        description: 'Store a JSON value (≤64KB) under a key for later retrieval. Use to persist state across calls.',
        parameters: {
          type: 'object',
          properties: {
            key: { type: 'string', description: 'The key to store the value under' },
            value: { description: 'The JSON value to store (≤64KB)' },
            ttl_days: { type: 'integer', description: 'Optional time-to-live in days' },
          },
          required: ['key', 'value'],
        },
      },
    },
  },
  {
    mcpName: 'memory_get',
    category: 'memory',
    costPerCall: 'Free',
    openai: {
      type: 'function',
      function: {
        name: 'memory_get',
        description: 'Read a previously stored value by key.',
        parameters: {
          type: 'object',
          properties: {
            key: { type: 'string', description: 'The key to read' },
          },
          required: ['key'],
        },
      },
    },
  },
  {
    mcpName: 'memory_list',
    category: 'memory',
    costPerCall: 'Free',
    openai: {
      type: 'function',
      function: {
        name: 'memory_list',
        description: 'List your stored keys, optionally filtered by prefix and paginated with a cursor.',
        parameters: {
          type: 'object',
          properties: {
            prefix: { type: 'string', description: 'Optional key prefix to filter by' },
            limit: { type: 'integer', description: 'Optional maximum number of keys to return' },
            cursor: { type: 'string', description: 'Optional pagination cursor from a previous call' },
          },
          required: [],
        },
      },
    },
  },
  {
    mcpName: 'memory_delete',
    category: 'memory',
    costPerCall: 'Free',
    openai: {
      type: 'function',
      function: {
        name: 'memory_delete',
        description: 'Delete a stored key.',
        parameters: {
          type: 'object',
          properties: {
            key: { type: 'string', description: 'The key to delete' },
          },
          required: ['key'],
        },
      },
    },
  },

  // === Web3 ===
  {
    mcpName: 'token_balance',
    category: 'web3',
    costPerCall: '$0.01',
    openai: {
      type: 'function',
      function: {
        name: 'token_balance',
        description: 'Get the native or token balance for an address on a supported chain.',
        parameters: {
          type: 'object',
          properties: {
            chain: { type: 'string', enum: ['ethereum', 'polygon', 'base', 'solana'], description: 'The blockchain' },
            address: { type: 'string', description: 'The wallet address to query' },
            token: { type: 'string', description: 'Optional token contract address; omit for the native balance' },
          },
          required: ['chain', 'address'],
        },
      },
    },
  },
  {
    mcpName: 'tx_status',
    category: 'web3',
    costPerCall: '$0.01',
    openai: {
      type: 'function',
      function: {
        name: 'tx_status',
        description: 'Get the status of a transaction by hash on a supported chain.',
        parameters: {
          type: 'object',
          properties: {
            chain: { type: 'string', enum: ['ethereum', 'polygon', 'base', 'solana'], description: 'The blockchain' },
            tx_hash: { type: 'string', description: 'The transaction hash' },
          },
          required: ['chain', 'tx_hash'],
        },
      },
    },
  },
  {
    mcpName: 'nft_metadata',
    category: 'web3',
    costPerCall: '$0.01',
    openai: {
      type: 'function',
      function: {
        name: 'nft_metadata',
        description: 'Fetch the ERC-721 tokenURI and resolved metadata for an NFT.',
        parameters: {
          type: 'object',
          properties: {
            chain: { type: 'string', enum: ['ethereum', 'polygon', 'base'], description: 'The blockchain' },
            contract: { type: 'string', description: 'The NFT contract address' },
            token_id: { type: 'string', description: 'The token id' },
          },
          required: ['chain', 'contract', 'token_id'],
        },
      },
    },
  },
  {
    mcpName: 'ens_resolve',
    category: 'web3',
    costPerCall: '$0.01',
    openai: {
      type: 'function',
      function: {
        name: 'ens_resolve',
        description: 'Resolve an ENS name to an address (forward) or an address to its primary ENS name (reverse).',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'The ENS name or address to resolve' },
            direction: { type: 'string', enum: ['forward', 'reverse'], description: 'forward = name→address, reverse = address→name' },
          },
          required: ['query', 'direction'],
        },
      },
    },
  },

  // === Document ===
  {
    mcpName: 'pdf_parse',
    category: 'document',
    costPerCall: '$0.005/page',
    openai: {
      type: 'function',
      function: {
        name: 'pdf_parse',
        description: 'Extract text from a PDF, either a workspace file or a URL. Optionally limit to a page range. Billed per page.',
        parameters: {
          type: 'object',
          properties: {
            workspace_file: { type: 'string', description: 'Path to a PDF in the workspace (provide this or url)' },
            url: { type: 'string', description: 'URL of a PDF to fetch (provide this or workspace_file)' },
            pages: { type: 'string', description: 'Optional page range (e.g. "1-5", "2,4,6")' },
          },
          required: [],
        },
      },
    },
  },
  {
    mcpName: 'doc_extract',
    category: 'document',
    costPerCall: '$0.005/unit',
    openai: {
      type: 'function',
      function: {
        name: 'doc_extract',
        description: 'Extract text from a workspace document (docx, xlsx, or csv).',
        parameters: {
          type: 'object',
          properties: {
            workspace_file: { type: 'string', description: 'Path to the document in the workspace' },
            format: { type: 'string', enum: ['docx', 'xlsx', 'csv'], description: 'The document format' },
          },
          required: ['workspace_file', 'format'],
        },
      },
    },
  },
  {
    mcpName: 'article_extract',
    category: 'document',
    costPerCall: '$0.01',
    openai: {
      type: 'function',
      function: {
        name: 'article_extract',
        description: 'Fetch a URL and extract clean reader-mode content as markdown, stripping nav, ads, and boilerplate.',
        parameters: {
          type: 'object',
          properties: {
            url: { type: 'string', description: 'The article URL to extract' },
          },
          required: ['url'],
        },
      },
    },
  },

  // === Memory ===
  {
    mcpName: 'semantic_memory_add',
    category: 'memory',
    costPerCall: '$0.01',
    openai: {
      type: 'function',
      function: {
        name: 'semantic_memory_add',
        description: 'Extract and store long-term facts from text or conversation messages into your private semantic memory. Automatically deduplicates against existing memories. Provide exactly one of text or messages. Billed per ~4000-char chunk (min 1 unit).',
        parameters: {
          type: 'object',
          properties: {
            text: { type: 'string', description: 'Raw text to extract facts from (max 20000 chars). Provide this OR messages.' },
            messages: {
              type: 'array',
              description: 'Conversation messages to extract facts from (max 200). Provide this OR text.',
              items: {
                type: 'object',
                properties: {
                  role: { type: 'string', description: 'Message role (e.g. "user", "assistant")' },
                  content: { type: 'string', description: 'Message content' },
                },
                required: ['role', 'content'],
              },
            },
            provenance: {
              type: 'object',
              description: 'Optional provenance metadata: source (observation|operator|agent_self|peer_agent|inference), confidence (0-1), valence (-1 to 1), magnitude (0-1), validAt, invalidAt, visibility (private|shared), acl.',
              properties: {
                source: { type: 'string', enum: ['observation', 'operator', 'agent_self', 'peer_agent', 'inference'] },
                confidence: { type: 'number' },
                valence: { type: 'number' },
                magnitude: { type: 'number' },
                validAt: { type: 'integer' },
                invalidAt: { type: 'integer' },
                visibility: { type: 'string', enum: ['private', 'shared'] },
                acl: { type: 'array', items: { type: 'string' } },
              },
            },
          },
          required: [],
        },
      },
    },
  },
  {
    mcpName: 'semantic_memory_search',
    category: 'memory',
    costPerCall: '$0.01',
    openai: {
      type: 'function',
      function: {
        name: 'semantic_memory_search',
        description: 'Search your semantic memory for facts relevant to a query. Returns up to top_k memories ranked by relevance (reranked). Per-call billing.',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'The search query (max 512 chars)' },
            top_k: { type: 'integer', description: 'Number of results to return, 1-20 (default 8)' },
          },
          required: ['query'],
        },
      },
    },
  },
  {
    mcpName: 'memory_recall',
    category: 'memory',
    costPerCall: '$0.02',
    openai: {
      type: 'function',
      function: {
        name: 'memory_recall',
        description: 'Recall the most relevant memories (semantic facts + episodic experiences + graph facts + skills) for a query as one ranked brief.',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'The query to recall memories for (max 512 chars)' },
            top_k: { type: 'integer', description: 'Number of results to return, 1-20 (default 8)' },
            sources: {
              type: 'array',
              items: { type: 'string', enum: ['semantic', 'episodic', 'graph', 'skill'] },
              description: 'Optional subset of memory sources to query; defaults to all four',
            },
          },
          required: ['query'],
        },
      },
    },
  },
  {
    mcpName: 'memory_reflect',
    category: 'memory',
    costPerCall: '$0.02',
    openai: {
      type: 'function',
      function: {
        name: 'memory_reflect',
        description: 'Distill recent unreflected episodes into durable lessons (stored to semantic memory) and suggested rules (returned), and best-effort generate reusable skills. Metered per ~20-episode chunk.',
        parameters: {
          type: 'object',
          properties: {
            window: { type: 'integer', description: 'Number of recent unreflected episodes to consider, 1-50 (default 20)' },
          },
          required: [],
        },
      },
    },
  },
  {
    mcpName: 'memory_consolidate',
    category: 'memory',
    costPerCall: '$0.02',
    openai: {
      type: 'function',
      function: {
        name: 'memory_consolidate',
        description: 'Maintain semantic memory: merge near-duplicates (dedup) and forget stale/low-value memories (decay), optionally decaying confidence over time (decay_confidence). Bounded and idempotent.',
        parameters: {
          type: 'object',
          properties: {
            max_ops: { type: 'integer', description: 'Maximum operations to perform, 1-100 (default 50)' },
            operations: {
              type: 'array',
              items: { type: 'string', enum: ['decay', 'dedup', 'decay_confidence'] },
              description: 'Which maintenance operations to run (default ["decay", "dedup"])',
            },
          },
          required: [],
        },
      },
    },
  },
  {
    mcpName: 'context_assemble',
    category: 'memory',
    costPerCall: '$0.03',
    openai: {
      type: 'function',
      function: {
        name: 'context_assemble',
        description: 'Assemble a token-budgeted working-memory brief from all stores (semantic, episodic, graph, skills) relevant to a goal.',
        parameters: {
          type: 'object',
          properties: {
            goal: { type: 'string', description: 'The goal or task to assemble context for (max 512 chars)' },
            token_budget: { type: 'integer', description: 'Approximate token budget for the assembled brief, 200-8000 (default 2000)' },
            sources: {
              type: 'array',
              items: { type: 'string', enum: ['semantic', 'episodic', 'graph', 'skill'] },
              description: 'Optional subset of memory sources to include; defaults to all four',
            },
          },
          required: ['goal'],
        },
      },
    },
  },
  {
    mcpName: 'episode_log',
    category: 'memory',
    costPerCall: 'free',
    openai: {
      type: 'function',
      function: {
        name: 'episode_log',
        description: 'Record a trajectory (situation/action/outcome + valence) into episodic memory. Free, rate-limited.',
        parameters: {
          type: 'object',
          properties: {
            situation: { type: 'string', description: 'The situation encountered (max 20000 chars)' },
            action: { type: 'string', description: 'Optional action taken (max 20000 chars)' },
            outcome: { type: 'string', description: 'Optional outcome observed (max 20000 chars)' },
            valence: { type: 'number', description: 'Optional outcome valence, -1 (bad) to 1 (good)' },
            magnitude: { type: 'number', description: 'Optional magnitude/importance, 0-1' },
            provenance: {
              type: 'object',
              description: 'Optional provenance metadata (source, confidence, visibility, acl, etc.)',
              properties: {
                source: { type: 'string', enum: ['observation', 'operator', 'agent_self', 'peer_agent', 'inference'] },
                confidence: { type: 'number' },
                visibility: { type: 'string', enum: ['private', 'shared'] },
                acl: { type: 'array', items: { type: 'string' } },
              },
            },
          },
          required: ['situation'],
        },
      },
    },
  },
  {
    mcpName: 'memory_gc',
    category: 'memory',
    costPerCall: 'free',
    openai: {
      type: 'function',
      function: {
        name: 'memory_gc',
        description: 'Permanently delete your memories that were soft-deleted over 90 days ago, reclaiming storage.',
        parameters: {
          type: 'object',
          properties: {
            max_ops: { type: 'integer', description: 'Maximum number of items to purge, 1-100 (default 50)' },
          },
          required: [],
        },
      },
    },
  },
  {
    mcpName: 'memory_status',
    category: 'memory',
    costPerCall: 'free',
    openai: {
      type: 'function',
      function: {
        name: 'memory_status',
        description: 'Report your memory lifecycle state (active/hibernated/thawing) and thaw progress. Free, no charge, never gated.',
        parameters: { type: 'object', properties: {}, required: [] },
      },
    },
  },
  {
    mcpName: 'memory_usage',
    category: 'memory',
    costPerCall: 'free',
    openai: {
      type: 'function',
      function: {
        name: 'memory_usage',
        description: 'Report your current memory footprint (item_count, byte_size) vs quota (5000 items / 5MB). Free, no charge.',
        parameters: { type: 'object', properties: {}, required: [] },
      },
    },
  },
  {
    mcpName: 'memory_export',
    category: 'memory',
    costPerCall: '$0.03',
    openai: {
      type: 'function',
      function: {
        name: 'memory_export',
        description: 'Export your live memories (semantic/graph/skills, optionally episodic) as a portable bundle with a single-use download URL.',
        parameters: {
          type: 'object',
          properties: {
            pillars: {
              type: 'array',
              items: { type: 'string', enum: ['semantic', 'graph', 'skills', 'episodic'] },
              description: 'Optional subset of memory pillars to export; defaults to all',
            },
            include_episodes: { type: 'boolean', description: 'If true, include episodic memories (default false)' },
            include_vectors: { type: 'boolean', description: 'If true, include raw embedding vectors (default false)' },
          },
          required: [],
        },
      },
    },
  },
  {
    mcpName: 'memory_import',
    category: 'memory',
    costPerCall: '$0.05',
    openai: {
      type: 'function',
      function: {
        name: 'memory_import',
        description: 'Import a memory-os-bundle/v1 (from a prior memory_export) into your own memory — semantic/graph/skills/episodic, provenance- and lineage-stamped. Provide exactly one of bundle_key or bundle. Supports "into_empty" (always insert) and "merge" (dedup + source-rank conflict resolution) modes.',
        parameters: {
          type: 'object',
          properties: {
            bundle_key: { type: 'string', description: 'A bundle_key returned by a prior memory_export call. Provide this OR bundle.' },
            bundle: { type: 'object', description: 'A full memory-os-bundle/v1 envelope object to import inline. Provide this OR bundle_key.' },
            mode: { type: 'string', enum: ['into_empty', 'merge'], description: 'Import mode, default "into_empty"' },
          },
          required: [],
        },
      },
    },
  },

  // === Graph ===
  {
    mcpName: 'graph_add',
    category: 'graph',
    costPerCall: '$0.04',
    openai: {
      type: 'function',
      function: {
        name: 'graph_add',
        description: 'Extract a knowledge graph (entities + edges) from text or conversation messages and persist it to your private graph memory. Automatically classifies entities (merge/gray/new), judges ambiguous merges with LLM, and invalidates contradicted edges (bi-temporal). Provide exactly one of text or messages. Billed per ~3000-char chunk (min 1 unit).',
        parameters: {
          type: 'object',
          properties: {
            text: { type: 'string', description: 'Raw text to extract a graph from (max 20000 chars). Provide this OR messages.' },
            messages: {
              type: 'array',
              description: 'Conversation messages to extract a graph from (max 200). Provide this OR text.',
              items: {
                type: 'object',
                properties: {
                  role: { type: 'string', description: 'Message role (e.g. "user", "assistant")' },
                  content: { type: 'string', description: 'Message content' },
                },
                required: ['role', 'content'],
              },
            },
            provenance: {
              type: 'object',
              description: 'Optional provenance metadata (source, confidence, visibility, acl, etc.)',
              properties: {
                source: { type: 'string', enum: ['observation', 'operator', 'agent_self', 'peer_agent', 'inference'] },
                confidence: { type: 'number' },
                visibility: { type: 'string', enum: ['private', 'shared'] },
                acl: { type: 'array', items: { type: 'string' } },
              },
            },
          },
          required: [],
        },
      },
    },
  },
  {
    mcpName: 'graph_search',
    category: 'graph',
    costPerCall: '$0.02',
    openai: {
      type: 'function',
      function: {
        name: 'graph_search',
        description: 'Hybrid knowledge-graph search: fuses semantic (vector), full-text, and BFS expansion via Reciprocal Rank Fusion. Returns ranked facts with entity names, relation, and temporal validity. Supports point-in-time queries via as_of.',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'The search query (max 512 chars)' },
            top_k: { type: 'integer', description: 'Number of facts to return, 1-20 (default 8)' },
            hops: { type: 'integer', description: 'BFS expansion hops from seed entities, 0-3 (default 1)' },
            as_of: { type: 'integer', description: 'Optional unix-ms timestamp for point-in-time (bi-temporal) queries' },
          },
          required: ['query'],
        },
      },
    },
  },

  // === Skills ===
  {
    mcpName: 'skill_get',
    category: 'skills',
    costPerCall: 'free',
    openai: {
      type: 'function',
      function: {
        name: 'skill_get',
        description: 'Fetch a skill by exact name. Free, rate-limited.',
        parameters: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'The exact skill name (max 200 chars)' },
          },
          required: ['name'],
        },
      },
    },
  },
  {
    mcpName: 'skill_save',
    category: 'skills',
    costPerCall: '$0.01',
    openai: {
      type: 'function',
      function: {
        name: 'skill_save',
        description: 'Save (or self-edit) a named, triggerable skill (procedure) into your skill library.',
        parameters: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'The skill name (max 200 chars)' },
            trigger: { type: 'string', description: 'Description of the situation that should trigger this skill (max 2000 chars)' },
            body: { type: 'string', description: 'The skill procedure/body content (max 16000 chars)' },
            provenance: {
              type: 'object',
              description: 'Optional provenance metadata (source, confidence, visibility, acl, etc.)',
              properties: {
                source: { type: 'string', enum: ['observation', 'operator', 'agent_self', 'peer_agent', 'inference'] },
                confidence: { type: 'number' },
                visibility: { type: 'string', enum: ['private', 'shared'] },
                acl: { type: 'array', items: { type: 'string' } },
              },
            },
          },
          required: ['name', 'trigger', 'body'],
        },
      },
    },
  },
  {
    mcpName: 'skill_search',
    category: 'skills',
    costPerCall: 'free',
    openai: {
      type: 'function',
      function: {
        name: 'skill_search',
        description: 'Search your skill library for skills whose trigger matches the situation. Free, rate-limited.',
        parameters: {
          type: 'object',
          properties: {
            situation: { type: 'string', description: 'Description of the current situation to match against skill triggers (max 512 chars)' },
            top_k: { type: 'integer', description: 'Number of skills to return, 1-20 (default 5)' },
          },
          required: ['situation'],
        },
      },
    },
  },

  // === Workspace ===
  {
    mcpName: 'workspace_create',
    category: 'workspace',
    costPerCall: 'free',
    openai: {
      type: 'function',
      function: {
        name: 'workspace_create',
        description: 'Create or confirm your private workspace (idempotent).',
        parameters: { type: 'object', properties: {}, required: [] },
      },
    },
  },
  {
    mcpName: 'workspace_list',
    category: 'workspace',
    costPerCall: 'free',
    openai: {
      type: 'function',
      function: {
        name: 'workspace_list',
        description: 'List files in your workspace (free, rate-limited).',
        parameters: {
          type: 'object',
          properties: {
            prefix: { type: 'string', description: 'Optional filename prefix to filter by (max 255 chars)' },
            limit: { type: 'integer', description: 'Optional maximum number of files to return, 1-500' },
          },
          required: [],
        },
      },
    },
  },
  {
    mcpName: 'workspace_stat',
    category: 'workspace',
    costPerCall: 'free',
    openai: {
      type: 'function',
      function: {
        name: 'workspace_stat',
        description: 'Get metadata for one file (free, rate-limited).',
        parameters: {
          type: 'object',
          properties: {
            filename: { type: 'string', description: 'Path of the file in the workspace' },
          },
          required: ['filename'],
        },
      },
    },
  },
  {
    mcpName: 'workspace_delete',
    category: 'workspace',
    costPerCall: 'free',
    openai: {
      type: 'function',
      function: {
        name: 'workspace_delete',
        description: 'Delete a file from your workspace (free, rate-limited, no refund).',
        parameters: {
          type: 'object',
          properties: {
            filename: { type: 'string', description: 'Path of the file to delete' },
          },
          required: ['filename'],
        },
      },
    },
  },
  {
    mcpName: 'workspace_copy',
    category: 'workspace',
    costPerCall: 'free',
    openai: {
      type: 'function',
      function: {
        name: 'workspace_copy',
        description: 'Copy a file to a new name within your workspace.',
        parameters: {
          type: 'object',
          properties: {
            source_filename: { type: 'string', description: 'Path of the existing file to copy' },
            dest_filename: { type: 'string', description: 'Destination path for the copy' },
            days_to_store: { type: 'integer', description: 'How many days to retain the copy, 1-365' },
          },
          required: ['source_filename', 'dest_filename', 'days_to_store'],
        },
      },
    },
  },
  {
    mcpName: 'workspace_extend',
    category: 'workspace',
    costPerCall: 'free',
    openai: {
      type: 'function',
      function: {
        name: 'workspace_extend',
        description: 'Extend storage on an existing file by N days.',
        parameters: {
          type: 'object',
          properties: {
            filename: { type: 'string', description: 'Path of the file to extend' },
            additional_days: { type: 'integer', description: 'Additional days to extend storage by, 1-365' },
          },
          required: ['filename', 'additional_days'],
        },
      },
    },
  },
  {
    mcpName: 'workspace_upload',
    category: 'workspace',
    costPerCall: '$0.01/MB',
    openai: {
      type: 'function',
      function: {
        name: 'workspace_upload',
        description: 'Upload a file inline (≤10MB), billed per-MB + storage days.',
        parameters: {
          type: 'object',
          properties: {
            filename: { type: 'string', description: 'Destination path in the workspace' },
            content_base64: { type: 'string', description: 'The file content encoded as base64' },
            days_to_store: { type: 'integer', description: 'How many days to retain the file, 1-365' },
            content_type: { type: 'string', description: 'Optional MIME type of the file' },
          },
          required: ['filename', 'content_base64', 'days_to_store'],
        },
      },
    },
  },
  {
    mcpName: 'workspace_upload_init',
    category: 'workspace',
    costPerCall: 'free',
    openai: {
      type: 'function',
      function: {
        name: 'workspace_upload_init',
        description: 'Begin a large upload — returns a presigned PUT URL and an upload_id to finalize with workspace_upload_finalize.',
        parameters: {
          type: 'object',
          properties: {
            filename: { type: 'string', description: 'Destination path in the workspace' },
            size_bytes: { type: 'integer', description: 'Total size of the upload in bytes (0 to 5GB)' },
            days_to_store: { type: 'integer', description: 'How many days to retain the file, 1-365' },
            content_type: { type: 'string', description: 'Optional MIME type of the file' },
          },
          required: ['filename', 'size_bytes', 'days_to_store'],
        },
      },
    },
  },
  {
    mcpName: 'workspace_upload_finalize',
    category: 'workspace',
    costPerCall: '$0.01/MB',
    openai: {
      type: 'function',
      function: {
        name: 'workspace_upload_finalize',
        description: 'Confirm a large upload (started with workspace_upload_init) completed; settles billing.',
        parameters: {
          type: 'object',
          properties: {
            upload_id: { type: 'string', description: 'The upload id returned by workspace_upload_init' },
          },
          required: ['upload_id'],
        },
      },
    },
  },
  {
    mcpName: 'workspace_download',
    category: 'workspace',
    costPerCall: '$0.004/MB',
    openai: {
      type: 'function',
      function: {
        name: 'workspace_download',
        description: 'Download a file inline (≤10MB) or get a short-lived signed URL.',
        parameters: {
          type: 'object',
          properties: {
            filename: { type: 'string', description: 'Path of the file to download' },
            format: { type: 'string', enum: ['inline', 'url'], description: 'Response format, default "inline"' },
            url_ttl_minutes: { type: 'integer', description: 'TTL for the signed URL in minutes, 1-15 (only used with format="url")' },
          },
          required: ['filename'],
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
