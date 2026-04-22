import { useMemo, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Card } from '@/presentation/components/ui/card'
import { Button } from '@/presentation/components/ui/button'
import { Input } from '@/presentation/components/ui/input'
import { Textarea } from '@/presentation/components/ui/textarea'
import { ErrorView } from '@/presentation/components/ErrorView'
import { JsonView } from '@/presentation/components/JsonView'
import { CopyButton } from '@/presentation/components/CopyButton'
import { useAppContainer } from '@/presentation/hooks/useAppContainer'
import { useActiveAgent } from '@/presentation/hooks/useActiveAgent'
import { useT } from '@/presentation/hooks/useT'
import type { MessageKey } from '@/domain/i18n'
import type { ImageTool } from '@/domain/scraper'
import { IMAGE_TOOLS } from '@/domain/scraper'
import type { McpToolResult } from '@/infrastructure/schemas/mcp'

const TOOL_LABEL_KEYS: Record<ImageTool, MessageKey> = {
  generate_image: 'images.toolGenerate',
  edit_image: 'images.toolEdit',
  analyze_image: 'images.toolAnalyze',
}

const TOOL_DESCRIPTION_KEYS: Record<ImageTool, MessageKey> = {
  generate_image: 'images.descGenerate',
  edit_image: 'images.descEdit',
  analyze_image: 'images.descAnalyze',
}

const TOOL_COST_LABELS: Record<ImageTool, string> = {
  generate_image: '$0.01 (≤1.5 MP) · $0.02 (>1.5 MP)',
  edit_image: '$0.02',
  analyze_image: '$0.006',
}

function imageDataUri(result: McpToolResult): string | null {
  const first = result.content[0]
  if (!first || first.type !== 'image') return null
  return `data:${first.mimeType};base64,${first.data}`
}

function textContent(result: McpToolResult): string | null {
  const first = result.content[0]
  if (!first || first.type !== 'text') return null
  return first.text
}

export function Images() {
  const t = useT()
  const agent = useActiveAgent()
  const container = useAppContainer()
  const [tool, setTool] = useState<ImageTool>('generate_image')

  const [prompt, setPrompt] = useState('')
  const [width, setWidth] = useState(1024)
  const [height, setHeight] = useState(1024)

  const [instruction, setInstruction] = useState('')
  const [sourceImage, setSourceImage] = useState('')
  const [aspect, setAspect] = useState('')

  const [question, setQuestion] = useState('')

  const run = useMutation({
    mutationFn: async (): Promise<McpToolResult> => {
      if (!agent) throw new Error('no agent')
      const params = buildParams({ tool, prompt, width, height, instruction, sourceImage, aspect, question })
      const res = await container.useCases.callScraperTool(agent.id, agent.apiKey, tool, params)
      if (!res.ok) throw res.error
      return res.value
    },
  })

  const dataUri = useMemo(() => (run.data ? imageDataUri(run.data) : null), [run.data])
  const analyzeText = useMemo(() => (run.data ? textContent(run.data) : null), [run.data])

  if (!agent) return <p className="text-sm text-muted-foreground">{t('noAgent.select')}</p>
  const err = run.error

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Card className="p-6">
        <div className="text-center mb-4">
          <h2 className="text-lg font-semibold">{t('images.title')}</h2>
          <p className="text-xs text-muted-foreground mt-1">{t('images.subtitle')}</p>
        </div>

        <div className="rounded-lg border border-border bg-muted/30 p-1 grid grid-cols-3 gap-1.5 mb-4">
          {IMAGE_TOOLS.map((tl) => {
            const isActive = tool === tl
            return (
              <button
                key={tl}
                type="button"
                onClick={() => setTool(tl)}
                className={`py-2.5 px-3 text-sm rounded-md transition-colors text-center ${
                  isActive
                    ? 'bg-foreground/15 text-foreground shadow-sm font-medium ring-1 ring-foreground/10'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                }`}
              >
                {t(TOOL_LABEL_KEYS[tl])}
              </button>
            )
          })}
        </div>

        <p className="text-xs text-muted-foreground text-center mb-1">{t(TOOL_DESCRIPTION_KEYS[tool])}</p>
        <p className="text-xs text-muted-foreground text-center mb-4 tabular-nums">
          <b className="text-foreground">{TOOL_COST_LABELS[tool]}</b>
          <span className="ml-2 text-[10px] opacity-70">{t('images.perCall')}</span>
        </p>

        <div className="space-y-4">
          {tool === 'generate_image' ? (
            <>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">{t('images.prompt')}</label>
                <Textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  rows={3}
                  placeholder="A neon-lit dashboard on a developer desk, cinematic"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">{t('images.width')}</label>
                  <Input
                    type="number"
                    min={512}
                    max={2048}
                    value={width}
                    onChange={(e) => setWidth(Number(e.target.value) || 1024)}
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">{t('images.height')}</label>
                  <Input
                    type="number"
                    min={512}
                    max={2048}
                    value={height}
                    onChange={(e) => setHeight(Number(e.target.value) || 1024)}
                  />
                </div>
              </div>
            </>
          ) : null}

          {tool === 'edit_image' ? (
            <>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">{t('images.instruction')}</label>
                <Textarea
                  value={instruction}
                  onChange={(e) => setInstruction(e.target.value)}
                  rows={3}
                  placeholder={t('images.instructionHint')}
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">{t('images.sourceImage')}</label>
                <Textarea
                  value={sourceImage}
                  onChange={(e) => setSourceImage(e.target.value)}
                  rows={2}
                  placeholder="https://… or data:image/png;base64,…"
                  className="font-mono text-xs"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">
                  {t('images.aspect')} <span className="normal-case text-muted-foreground/60">{t('scraper.optional')}</span>
                </label>
                <Input
                  value={aspect}
                  onChange={(e) => setAspect(e.target.value)}
                  placeholder="1:1, 16:9, 4:3…"
                />
              </div>
            </>
          ) : null}

          {tool === 'analyze_image' ? (
            <>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">{t('images.question')}</label>
                <Textarea
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  rows={3}
                  placeholder="What is in this image? Describe it in detail."
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">{t('images.sourceImage')}</label>
                <Textarea
                  value={sourceImage}
                  onChange={(e) => setSourceImage(e.target.value)}
                  rows={2}
                  placeholder="https://… or data:image/png;base64,…"
                  className="font-mono text-xs"
                />
              </div>
            </>
          ) : null}

          <Button className="w-full" onClick={() => run.mutate()} disabled={run.isPending}>
            {run.isPending ? t('images.running') : t('images.run', { tool: t(TOOL_LABEL_KEYS[tool]) })}
          </Button>
          {err ? <ErrorView error={err} /> : null}
        </div>
      </Card>

      {run.data ? (
        <section>
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <h2 className="text-lg font-semibold">{t('images.result')}</h2>
            {dataUri ? (
              <a href={dataUri} download={`${tool}.png`}>
                <Button size="sm" variant="secondary">{t('images.download')}</Button>
              </a>
            ) : analyzeText ? (
              <CopyButton text={analyzeText} label={t('scraper.copyResult')} size="sm" variant="secondary" />
            ) : null}
          </div>
          <Card className="p-4">
            {dataUri ? (
              <div className="overflow-auto rounded-lg border border-border bg-muted/20 p-2">
                <img src={dataUri} alt={tool} className="max-w-full h-auto mx-auto rounded" />
              </div>
            ) : analyzeText ? (
              <pre className="text-sm font-mono bg-muted/40 text-foreground rounded-lg border border-border p-3 whitespace-pre-wrap overflow-auto max-h-[60vh]">
                {analyzeText}
              </pre>
            ) : (
              <JsonView value={run.data} maxHeight="60vh" />
            )}
          </Card>
        </section>
      ) : null}
    </div>
  )
}

type BuildArgs = Readonly<{
  tool: ImageTool
  prompt: string
  width: number
  height: number
  instruction: string
  sourceImage: string
  aspect: string
  question: string
}>

function buildParams(a: BuildArgs): unknown {
  switch (a.tool) {
    case 'generate_image': {
      const out: Record<string, unknown> = { prompt: a.prompt }
      if (a.width) out['width'] = a.width
      if (a.height) out['height'] = a.height
      return out
    }
    case 'edit_image': {
      const out: Record<string, unknown> = { prompt: a.instruction, image: a.sourceImage }
      if (a.aspect) out['aspect_ratio'] = a.aspect
      return out
    }
    case 'analyze_image':
      return { prompt: a.question, image: a.sourceImage }
  }
}
