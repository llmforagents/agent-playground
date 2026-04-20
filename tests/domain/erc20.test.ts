import { describe, it, expect } from 'vitest'
import { isHexAddress, toBaseUnits, encodeErc20Transfer } from '@/domain/erc20'

describe('erc20 helpers', () => {
  describe('isHexAddress', () => {
    it('accepts valid 0x + 40 hex', () => {
      expect(isHexAddress('0x' + 'a'.repeat(40))).toBe(true)
      expect(isHexAddress('0xc2132D05D31c914a87C6611C10748AEb04B58e8F')).toBe(true)
    })
    it('rejects anything else', () => {
      expect(isHexAddress('0x' + 'a'.repeat(39))).toBe(false)
      expect(isHexAddress('0x' + 'z'.repeat(40))).toBe(false)
      expect(isHexAddress('c2132D05D31c914a87C6611C10748AEb04B58e8F')).toBe(false)
    })
  })

  describe('toBaseUnits', () => {
    it('converts integer amounts', () => {
      expect(toBaseUnits('1', 6)).toBe('1000000')
      expect(toBaseUnits('0', 6)).toBe('0')
      expect(toBaseUnits('1000', 18)).toBe('1000000000000000000000')
    })
    it('converts fractional amounts', () => {
      expect(toBaseUnits('1.5', 6)).toBe('1500000')
      expect(toBaseUnits('0.000001', 6)).toBe('1')
      expect(toBaseUnits('0.1', 18)).toBe('100000000000000000')
    })
    it('rejects more decimals than allowed', () => {
      expect(toBaseUnits('1.1234567', 6)).toBeNull()
    })
    it('rejects garbage', () => {
      expect(toBaseUnits('abc', 6)).toBeNull()
      expect(toBaseUnits('-1', 6)).toBeNull()
      expect(toBaseUnits('', 6)).toBeNull()
    })
  })

  describe('encodeErc20Transfer', () => {
    it('produces the ABI-encoded calldata for transfer(address,uint256)', () => {
      const data = encodeErc20Transfer('0x1234567890123456789012345678901234567890', '1000000')
      expect(data).toBe(
        '0x' +
        'a9059cbb' +
        '0000000000000000000000001234567890123456789012345678901234567890' +
        '00000000000000000000000000000000000000000000000000000000000f4240',
      )
    })
    it('handles zero amount', () => {
      const data = encodeErc20Transfer('0x' + '0'.repeat(40), '0')
      expect(data).toBe(
        '0x' +
        'a9059cbb' +
        '0000000000000000000000000000000000000000000000000000000000000000' +
        '0000000000000000000000000000000000000000000000000000000000000000',
      )
    })
    it('rejects invalid address', () => {
      expect(() => encodeErc20Transfer('0xzzz', '1')).toThrow()
    })
    it('rejects non-integer amount', () => {
      expect(() => encodeErc20Transfer('0x' + 'a'.repeat(40), '1.5')).toThrow()
    })
  })
})
