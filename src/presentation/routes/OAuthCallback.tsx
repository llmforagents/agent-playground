import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { Button } from '@/presentation/components/ui/button'
import { Card } from '@/presentation/components/ui/card'
import { useAppContainer } from '@/presentation/hooks/useAppContainer'
import { useT } from '@/presentation/hooks/useT'
import { clearPendingClaim, loadPendingClaim } from '@/presentation/components/claimSession'
import { useQueryClient } from '@tanstack/react-query'
import { AgentId } from '@/domain/branded'
import type { ClaimResponse } from '@/infrastructure/schemas/rest'
import type { RestError, ClaimErrorKind, AppError } from '@/domain/errors'
import { describeError } from '@/domain/errors'
import type { MessageKey } from '@/domain/i18n'

type State =
  | { kind: 'idle' }
  | { kind: 'exchanging' }
  | { kind: 'success'; data: ClaimResponse }
  | { kind: 'error'; messageKey: MessageKey; requestId?: string; rawMessage?: string }
  | { kind: 'missing_state' }

function fmtUsd(cents: number): string {
  const usd = cents / 100
  return `$${usd.toFixed(2)}`
}

function errorKeyForClaim(code: ClaimErrorKind): MessageKey {
  switch (code) {
    case 'turnstile_failed': return 'claim.errTurnstile'
    case 'github_oauth_failed': return 'claim.errGithub'
    case 'already_claimed': return 'claim.errAlreadyClaimed'
    case 'agent_not_found': return 'claim.errAgentNotFound'
    case 'agent_inactive': return 'claim.errAgentInactive'
    case 'provider_error': return 'claim.errProvider'
    case 'rate_limited': return 'claim.errRateLimited'
    case 'validation_error': return 'claim.errValidation'
  }
}

function mapRestError(e: RestError): { messageKey: MessageKey; requestId?: string; rawMessage?: string } {
  if (e.kind === 'claim_failed') {
    const out: { messageKey: MessageKey; requestId?: string; rawMessage?: string } = {
      messageKey: errorKeyForClaim(e.code),
    }
    if (e.requestId !== undefined) out.requestId = e.requestId
    return out
  }
  if (e.kind === 'rate_limited') return { messageKey: 'claim.errRateLimited' }
  if (e.kind === 'validation') return { messageKey: 'claim.errValidation' }
  return { messageKey: 'claim.errGeneric', rawMessage: describeError(e as AppError) }
}

export function OAuthCallback() {
  const t = useT()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const container = useAppContainer()
  const queryClient = useQueryClient()
  const [state, setState] = useState<State>({ kind: 'idle' })
  const ranRef = useRef(false)

  useEffect(() => {
    if (ranRef.current) return
    ranRef.current = true

    const stateToken = params.get('state')
    const code = params.get('code')
    const oauthError = params.get('error')

    if (!stateToken) {
      setState({ kind: 'missing_state' })
      return
    }
    const pending = loadPendingClaim(stateToken)
    if (!pending) {
      setState({ kind: 'missing_state' })
      return
    }
    clearPendingClaim(stateToken)

    if (oauthError || !code) {
      setState({ kind: 'error', messageKey: 'claim.errGithub' })
      return
    }

    setState({ kind: 'exchanging' })
    void (async () => {
      const res = await container.useCases.claimPlaygroundCredit(
        AgentId(pending.agentUuid),
        {
          agentUuid: pending.agentUuid,
          turnstileToken: pending.turnstileToken,
          githubCode: code,
        },
      )
      if (res.ok) {
        setState({ kind: 'success', data: res.value })
        await queryClient.invalidateQueries({ queryKey: ['agent', pending.agentUuid, 'balance'] })
        toast.success(t('claim.success'))
      } else {
        const mapped = mapRestError(res.error)
        const next: State = mapped.requestId !== undefined && mapped.rawMessage !== undefined
          ? { kind: 'error', messageKey: mapped.messageKey, requestId: mapped.requestId, rawMessage: mapped.rawMessage }
          : mapped.requestId !== undefined
            ? { kind: 'error', messageKey: mapped.messageKey, requestId: mapped.requestId }
            : mapped.rawMessage !== undefined
              ? { kind: 'error', messageKey: mapped.messageKey, rawMessage: mapped.rawMessage }
              : { kind: 'error', messageKey: mapped.messageKey }
        setState(next)
      }
    })()
  }, [params, container, queryClient, t])

  useEffect(() => {
    if (state.kind !== 'success') return
    const timer = setTimeout(() => navigate('/wallet', { replace: true }), 4000)
    return () => clearTimeout(timer)
  }, [state, navigate])

  return (
    <div className="mx-auto max-w-lg pt-10">
      <Card className="p-8 space-y-4 text-center">
        <h1 className="text-lg font-semibold">{t('claim.callbackTitle')}</h1>

        {state.kind === 'idle' || state.kind === 'exchanging' ? (
          <p className="text-sm text-muted-foreground">{t('claim.exchanging')}</p>
        ) : null}

        {state.kind === 'missing_state' ? (
          <>
            <p className="text-sm text-muted-foreground">{t('claim.callbackMissingState')}</p>
            <Link to="/wallet"><Button size="sm">{t('claim.callbackBackToWallet')}</Button></Link>
          </>
        ) : null}

        {state.kind === 'error' ? (
          <>
            <p className="text-sm text-foreground">{t(state.messageKey)}</p>
            {state.rawMessage ? (
              <p className="text-xs text-muted-foreground">{state.rawMessage}</p>
            ) : null}
            {state.requestId ? (
              <p className="text-[10px] text-muted-foreground font-mono">
                {t('claim.requestId')}: {state.requestId}
              </p>
            ) : null}
            <div className="flex justify-center gap-2 pt-2">
              <Link to="/wallet"><Button size="sm" variant="secondary">{t('claim.callbackBackToWallet')}</Button></Link>
            </div>
          </>
        ) : null}

        {state.kind === 'success' ? (
          <>
            <div className="text-3xl">🎉</div>
            <p className="text-sm font-medium">{t('claim.success')}</p>
            <p className="text-xs text-muted-foreground">
              {t('claim.successDetail', {
                login: state.data.githubLogin,
                balance: fmtUsd(state.data.balanceCents),
              })}
            </p>
            <Link to="/wallet"><Button size="sm">{t('claim.callbackBackToWallet')}</Button></Link>
          </>
        ) : null}
      </Card>
    </div>
  )
}
