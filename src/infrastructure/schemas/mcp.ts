import { z } from 'zod'

const ProxyTierEnum = z.enum(['none', 'datacenter', 'residential'])

const UrlField = z.string().url().max(2048)

export const FetchHtmlParamsSchema = z.object({
  url: UrlField,
  timeout_ms: z.number().int().min(1000).max(30000).optional(),
  proxy_tier: ProxyTierEnum,
})

export const MarkdownParamsSchema = z.object({
  url: UrlField,
  selector: z.string().optional(),
  proxy_tier: ProxyTierEnum,
})

export const LinksParamsSchema = z.object({
  url: UrlField,
  same_origin_only: z.boolean().optional(),
  proxy_tier: ProxyTierEnum,
})

const ViewportSchema = z.object({
  width: z.number().int().min(320).max(3840),
  height: z.number().int().min(240).max(2160),
})

export const ScreenshotParamsSchema = z.object({
  url: UrlField,
  selector: z.string().optional(),
  full_page: z.boolean().optional(),
  viewport: ViewportSchema.optional(),
  proxy_tier: ProxyTierEnum,
})

export const PdfParamsSchema = z.object({
  url: UrlField,
  format: z.enum(['A4', 'Letter', 'Legal']).optional(),
  proxy_tier: ProxyTierEnum,
})

export const ExtractParamsSchema = z.object({
  url: UrlField,
  selectors: z.record(z.string(), z.string()),
  proxy_tier: ProxyTierEnum,
})

export const SessionCreateParamsSchema = z.object({
  proxy_tier: ProxyTierEnum,
  initial_url: UrlField.optional(),
})

export const SessionExecParamsSchema = z.object({
  session_id: z.string().min(1),
  action: z.object({ type: z.string() }).loose(),
})

export const SessionCloseParamsSchema = z.object({
  session_id: z.string().min(1),
})

export const SessionStatusParamsSchema = z.object({
  session_id: z.string().min(1),
})

const SearchCommonSchema = z.object({
  q: z.string().min(1).max(2048),
  gl: z.string().length(2).optional(),
  hl: z.string().min(2).max(5).optional(),
  tbs: z.string().max(50).optional(),
  page: z.number().int().min(1).optional(),
  location: z.string().max(200).optional(),
})

export const GoogleSearchParamsSchema = SearchCommonSchema
export const GoogleNewsParamsSchema = SearchCommonSchema
export const GoogleMapsParamsSchema = SearchCommonSchema

export const GoogleBatchSearchParamsSchema = z.object({
  queries: z.array(SearchCommonSchema).min(1).max(100),
})

const ImageSourceField = z.string().min(1).max(200_000)

export const GenerateImageParamsSchema = z.object({
  prompt: z.string().min(1).max(4096),
  width: z.number().int().min(512).max(2048).optional(),
  height: z.number().int().min(512).max(2048).optional(),
})

export const EditImageParamsSchema = z.object({
  prompt: z.string().min(1).max(4096),
  image: ImageSourceField,
  aspect_ratio: z.enum([
    'match_input_image', '1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3',
  ]).optional(),
})

export const AnalyzeImageParamsSchema = z.object({
  prompt: z.string().min(1).max(4096),
  image: ImageSourceField,
})

export const SearchOrganicResultSchema = z.object({
  title: z.string(),
  link: z.string(),
  snippet: z.string().optional(),
  date: z.string().optional(),
  source: z.string().optional(),
}).loose()

export const SearchMapsResultSchema = z.object({
  title: z.string(),
  address: z.string().optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  category: z.string().optional(),
  rating: z.number().optional(),
  phone: z.string().optional(),
  website: z.string().optional(),
}).loose()

export const SearchResponseSchema = z.object({
  results: z.array(z.unknown()),
  query: z.string().optional(),
}).loose()

export const BatchSearchResponseSchema = z.object({
  results: z.array(SearchResponseSchema),
  queryCount: z.number().int().optional(),
}).loose()

export const McpContentItemSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('text'), text: z.string() }),
  z.object({ type: z.literal('image'), data: z.string(), mimeType: z.string() }),
  z.object({ type: z.literal('resource'), resource: z.object({ uri: z.string(), mimeType: z.string().optional(), text: z.string().optional(), blob: z.string().optional() }) }),
])

export const McpToolResultSchema = z.object({
  content: z.array(McpContentItemSchema),
  isError: z.boolean().optional(),
})
export type McpToolResult = z.infer<typeof McpToolResultSchema>

export const TOOL_PARAM_SCHEMAS = {
  fetch_html: FetchHtmlParamsSchema,
  markdown: MarkdownParamsSchema,
  links: LinksParamsSchema,
  screenshot: ScreenshotParamsSchema,
  pdf: PdfParamsSchema,
  extract: ExtractParamsSchema,
  session_create: SessionCreateParamsSchema,
  session_exec: SessionExecParamsSchema,
  session_close: SessionCloseParamsSchema,
  session_status: SessionStatusParamsSchema,
  google_search: GoogleSearchParamsSchema,
  google_news: GoogleNewsParamsSchema,
  google_maps: GoogleMapsParamsSchema,
  google_batch_search: GoogleBatchSearchParamsSchema,
  generate_image: GenerateImageParamsSchema,
  edit_image: EditImageParamsSchema,
  analyze_image: AnalyzeImageParamsSchema,
} as const
