import { useState } from 'react'
import { Button } from '@/presentation/components/ui/button'
import { Card } from '@/presentation/components/ui/card'
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/presentation/components/ui/dialog'
import { TurnstileWidget } from '@/presentation/components/TurnstileWidget'
import { savePendingClaim } from '@/presentation/components/claimSession'
import { useAppContainer } from '@/presentation/hooks/useAppContainer'
import { useActiveAgent } from '@/presentation/hooks/useActiveAgent'
import { useT } from '@/presentation/hooks/useT'
import { randomStateToken } from '@/lib/randomState'

const CALLBACK_PATH = '/oauth/github/callback'

type Props = Readonly<{
  alreadyFunded: boolean
}>

export function ClaimCard({ alreadyFunded }: Props): React.JSX.Element | null {
  const t = useT()
  const container = useAppContainer()
  const agent = useActiveAgent()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [turnstileError, setTurnstileError] = useState(false)
  const [redirecting, setRedirecting] = useState(false)

  if (!container.claim || !agent) return null

  const claim = container.claim

  function onTurnstileToken(token: string) {
    if (!agent || redirecting) return
    setTurnstileError(false)
    setRedirecting(true)
    const state = randomStateToken(32)
    savePendingClaim(state, {
      agentUuid: agent.id,
      turnstileToken: token,
      createdAt: Date.now(),
    })
    const redirectUri = `${window.location.origin}${CALLBACK_PATH}`
    const params = new URLSearchParams({
      client_id: claim.githubClientId,
      redirect_uri: redirectUri,
      scope: 'read:user',
      state,
    })
    window.location.assign(`https://github.com/login/oauth/authorize?${params.toString()}`)
  }

  function close() {
    setDialogOpen(false)
    setTurnstileError(false)
    setRedirecting(false)
  }

  return (
    <>
      <Card className="p-5 border-emerald-500/30 bg-gradient-to-br from-emerald-500/10 to-transparent">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="text-3xl" aria-hidden>🎁</div>
          <div className="flex-1 min-w-[200px]">
            <h2 className="text-base font-semibold">{t('claim.title')}</h2>
            <p className="text-xs text-muted-foreground mt-1 max-w-xl">{t('claim.subtitle')}</p>
          </div>
          <Button
            size="sm"
            onClick={() => setDialogOpen(true)}
            disabled={alreadyFunded}
            title={alreadyFunded ? '' : undefined}
          >
            {t('claim.cta')}
          </Button>
        </div>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) close() }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('claim.title')}</DialogTitle>
            <DialogDescription>
              {redirecting ? t('claim.redirecting') : t('claim.verifying')}
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            {!redirecting ? (
              <TurnstileWidget
                siteKey={claim.turnstileSiteKey}
                onToken={onTurnstileToken}
                onError={() => setTurnstileError(true)}
                onExpire={() => setTurnstileError(true)}
              />
            ) : (
              <div className="text-center text-sm text-muted-foreground py-6">
                {t('claim.redirecting')}
              </div>
            )}
            {turnstileError ? (
              <p className="text-xs text-destructive text-center mt-2">{t('claim.errTurnstile')}</p>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
