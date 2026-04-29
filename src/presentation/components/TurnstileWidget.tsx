import { useEffect, useRef } from 'react'

declare global {
  interface Window {
    turnstile?: TurnstileApi
    onTurnstileReady?: () => void
  }
}

type TurnstileApi = Readonly<{
  render: (
    container: HTMLElement,
    options: Readonly<{
      sitekey: string
      callback: (token: string) => void
      'error-callback'?: () => void
      'expired-callback'?: () => void
      theme?: 'light' | 'dark' | 'auto'
      size?: 'normal' | 'compact' | 'flexible'
      action?: string
    }>,
  ) => string
  reset: (widgetId?: string) => void
  remove: (widgetId?: string) => void
}>

const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js'

let scriptPromise: Promise<void> | undefined

function loadScript(): Promise<void> {
  if (scriptPromise) return scriptPromise
  scriptPromise = new Promise<void>((resolve, reject) => {
    if (typeof window === 'undefined') {
      reject(new Error('window unavailable'))
      return
    }
    if (window.turnstile) {
      resolve()
      return
    }
    const existing = document.querySelector<HTMLScriptElement>(`script[src^="${SCRIPT_SRC}"]`)
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true })
      existing.addEventListener('error', () => reject(new Error('turnstile script failed')), { once: true })
      return
    }
    const s = document.createElement('script')
    s.src = SCRIPT_SRC
    s.async = true
    s.defer = true
    s.addEventListener('load', () => resolve(), { once: true })
    s.addEventListener('error', () => reject(new Error('turnstile script failed')), { once: true })
    document.head.appendChild(s)
  })
  return scriptPromise
}

export function TurnstileWidget(props: Readonly<{
  siteKey: string
  onToken: (token: string) => void
  onError?: () => void
  onExpire?: () => void
  theme?: 'light' | 'dark' | 'auto'
}>): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const widgetIdRef = useRef<string | undefined>(undefined)
  const onTokenRef = useRef(props.onToken)
  const onErrorRef = useRef(props.onError)
  const onExpireRef = useRef(props.onExpire)
  onTokenRef.current = props.onToken
  onErrorRef.current = props.onError
  onExpireRef.current = props.onExpire

  useEffect(() => {
    let cancelled = false
    loadScript().then(() => {
      if (cancelled || !containerRef.current || !window.turnstile) return
      widgetIdRef.current = window.turnstile.render(containerRef.current, {
        sitekey: props.siteKey,
        callback: (token: string) => onTokenRef.current(token),
        'error-callback': () => onErrorRef.current?.(),
        'expired-callback': () => onExpireRef.current?.(),
        theme: props.theme ?? 'auto',
        size: 'flexible',
      })
    }).catch(() => {
      onErrorRef.current?.()
    })
    return () => {
      cancelled = true
      const id = widgetIdRef.current
      if (id !== undefined && window.turnstile) {
        try { window.turnstile.remove(id) } catch { /* widget may have been GC'd */ }
      }
    }
  }, [props.siteKey, props.theme])

  return <div ref={containerRef} className="flex justify-center min-h-[65px]" />
}
