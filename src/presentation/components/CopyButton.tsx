import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/presentation/components/ui/button'
import { safeCopy } from '@/lib/clipboard'

type Props = Readonly<{
  text: string
  label?: string
  size?: 'sm' | 'default'
  variant?: 'default' | 'secondary' | 'ghost' | 'outline'
  className?: string
}>

export function CopyButton({ text, label = 'Copy', size = 'sm', variant = 'secondary', className }: Props) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async (): Promise<void> => {
    const res = await safeCopy(text)
    if (res.ok) {
      setCopied(true)
      toast.success('Copied to clipboard')
      setTimeout(() => setCopied(false), 1500)
    } else {
      toast.error('Copy failed', { description: res.reason })
    }
  }

  const classes = className ? className : ''
  return (
    <Button size={size} variant={variant} className={classes} onClick={() => { void handleCopy() }}>
      {copied ? 'Copied!' : label}
    </Button>
  )
}
