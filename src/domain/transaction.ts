import type { UsdCents } from './branded'

export type TransactionType = 'deposit' | 'usage' | 'refund'

export type Transaction = Readonly<{
  id: string
  type: TransactionType
  amountCents: UsdCents
  timestamp: Date
  description?: string
}>
