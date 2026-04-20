export type Erc20Token = Readonly<{
  symbol: string
  address: string
  decimals: number
  chain: 'polygon'
}>

export const POLYGON_TOKENS: readonly Erc20Token[] = [
  { symbol: 'USDC',   address: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359', decimals: 6,  chain: 'polygon' },
  { symbol: 'USDC.e', address: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174', decimals: 6,  chain: 'polygon' },
  { symbol: 'USDT',   address: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F', decimals: 6,  chain: 'polygon' },
  { symbol: 'DAI',    address: '0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063', decimals: 18, chain: 'polygon' },
  { symbol: 'WETH',   address: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619', decimals: 18, chain: 'polygon' },
]

const TRANSFER_SELECTOR = 'a9059cbb'

export function isHexAddress(s: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(s)
}

function padLeft64(hex: string): string {
  return hex.padStart(64, '0')
}

export function toBaseUnits(amount: string, decimals: number): string | null {
  const trimmed = amount.trim()
  if (!/^\d+(\.\d+)?$/.test(trimmed)) return null
  const [whole, frac = ''] = trimmed.split('.')
  if (frac.length > decimals) return null
  const paddedFrac = frac.padEnd(decimals, '0')
  const combined = `${whole}${paddedFrac}`.replace(/^0+(?=\d)/, '')
  return combined === '' ? '0' : combined
}

export function encodeErc20Transfer(recipient: string, amountBase: string): string {
  if (!isHexAddress(recipient)) throw new Error('invalid recipient address')
  if (!/^\d+$/.test(amountBase)) throw new Error('invalid amount (must be decimal integer in base units)')
  const addrHex = recipient.slice(2).toLowerCase()
  const amountHex = BigInt(amountBase).toString(16)
  return `0x${TRANSFER_SELECTOR}${padLeft64(addrHex)}${padLeft64(amountHex)}`
}
