import { describe, it, expect } from 'vitest'
import { suggestClosest } from './suggest.js'

describe('suggest', () => {
  describe('suggestClosest', () => {
    it('returns null for empty candidates', () => {
      expect(suggestClosest('scan', [])).toBeNull()
    })

    it('returns exact match when available', () => {
      expect(suggestClosest('scan', ['scan', 'fix', 'init'])).toBe('scan')
    })

    it('suggests closest command for typo', () => {
      expect(suggestClosest('scna', ['scan', 'fix', 'init'])).toBe('scan')
    })

    it('suggests closest for single-char typo', () => {
      expect(suggestClosest('fxi', ['scan', 'fix', 'init'])).toBe('fix')
    })

    it('returns null when no candidate is close enough', () => {
      expect(suggestClosest('xyz', ['scan', 'fix', 'init'])).toBeNull()
    })

    it('handles short tokens with budget of 2', () => {
      // 'ab' has length 2, budget = max(2, ceil(2/3)) = max(2, 1) = 2
      expect(suggestClosest('ab', ['abc', 'def'])).toBe('abc')
    })

    it('picks the closest among multiple candidates within budget', () => {
      // 'scnn' length=4, budget = max(2, ceil(4/3)) = max(2, 2) = 2
      // dist('scnn', 'scan') = 2, dist('scnn', 'scam') = 2
      // Both within budget, first found wins (lower distance)
      const result = suggestClosest('scnn', ['scan', 'scam', 'fix'])
      expect(result).toBe('scan')
    })

    it('handles identical strings with distance 0', () => {
      expect(suggestClosest('init', ['scan', 'init', 'fix'])).toBe('init')
    })
  })
})
