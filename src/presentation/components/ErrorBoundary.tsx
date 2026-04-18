import { Component, type ErrorInfo, type ReactNode } from 'react'

type Props = Readonly<{ children: ReactNode }>
type State = Readonly<{ error: Error | null; info: ErrorInfo | null }>

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, info: null }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    this.setState({ error, info })

    console.error('[ErrorBoundary]', error, info)
  }

  private reset = (): void => {
    this.setState({ error: null, info: null })
  }

  override render(): ReactNode {
    if (!this.state.error) return this.props.children
    return (
      <div className="p-6">
        <div className="rounded border border-destructive/40 bg-destructive/10 p-4 text-sm space-y-2 max-w-3xl">
          <div className="font-semibold text-base">Render error</div>
          <div>{this.state.error.name}: {this.state.error.message}</div>
          {this.state.error.stack ? (
            <pre className="text-xs overflow-auto max-h-64 whitespace-pre-wrap">{this.state.error.stack}</pre>
          ) : null}
          {this.state.info?.componentStack ? (
            <pre className="text-xs overflow-auto max-h-64 whitespace-pre-wrap">{this.state.info.componentStack}</pre>
          ) : null}
          <div className="flex gap-2 pt-2">
            <button className="rounded bg-primary text-primary-foreground px-3 py-1" onClick={this.reset}>Try again</button>
            <button className="rounded bg-secondary text-secondary-foreground px-3 py-1" onClick={() => window.location.reload()}>Reload page</button>
          </div>
        </div>
      </div>
    )
  }
}
