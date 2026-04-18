export type CopyResult = Readonly<{ ok: true } | { ok: false; reason: string }>

export async function safeCopy(text: string): Promise<CopyResult> {
  const nav = globalThis.navigator
  if (nav && nav.clipboard && typeof nav.clipboard.writeText === 'function') {
    try {
      await nav.clipboard.writeText(text)
      return { ok: true }
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e)
      const fallback = execCopyFallback(text)
      if (fallback.ok) return fallback
      return { ok: false, reason: `clipboard API failed (${reason}); fallback also failed` }
    }
  }
  return execCopyFallback(text)
}

function execCopyFallback(text: string): CopyResult {
  const doc = globalThis.document
  if (!doc) return { ok: false, reason: 'no document' }
  const ta = doc.createElement('textarea')
  ta.value = text
  ta.setAttribute('readonly', '')
  ta.style.position = 'fixed'
  ta.style.top = '0'
  ta.style.left = '0'
  ta.style.opacity = '0'
  ta.style.pointerEvents = 'none'
  doc.body.appendChild(ta)
  ta.focus()
  ta.select()
  ta.setSelectionRange(0, text.length)
  let ok = false
  try {
    ok = doc.execCommand('copy')
  } catch {
    ok = false
  } finally {
    doc.body.removeChild(ta)
  }
  return ok ? { ok: true } : { ok: false, reason: 'execCommand(copy) returned false' }
}
