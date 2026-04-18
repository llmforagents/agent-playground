export function JsonView({ value, maxHeight = '24rem' }: { value: unknown; maxHeight?: string }) {
  let text: string
  try { text = JSON.stringify(value, null, 2) } catch { text = String(value) }
  return (
    <pre
      className="text-xs font-mono bg-muted/40 text-foreground rounded-lg border border-border p-3 overflow-auto"
      style={{ maxHeight }}
    >
      {text}
    </pre>
  )
}
