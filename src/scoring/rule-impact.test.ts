import { describe, it, expect } from 'vitest'
import { getRuleImpact, RULE_IMPACT, DEFAULT_IMPACT, TIER_DEFAULTS } from './rule-impact.js'

describe('rule-impact', () => {
  describe('TIER_DEFAULTS', () => {
    it('has entries for all six tiers', () => {
      expect(TIER_DEFAULTS.strict).toBeDefined()
      expect(TIER_DEFAULTS.standard).toBeDefined()
      expect(TIER_DEFAULTS.maintainability).toBeDefined()
      expect(TIER_DEFAULTS.mechanical).toBeDefined()
      expect(TIER_DEFAULTS.style).toBeDefined()
      expect(TIER_DEFAULTS.advisory).toBeDefined()
    })

    it('strict tier has the highest multiplier', () => {
      expect(TIER_DEFAULTS.strict.multiplier).toBeGreaterThanOrEqual(TIER_DEFAULTS.standard.multiplier)
      expect(TIER_DEFAULTS.strict.multiplier).toBeGreaterThanOrEqual(TIER_DEFAULTS.advisory.multiplier)
    })
  })

  describe('RULE_IMPACT', () => {
    it('maps known rule IDs to impact objects', () => {
      const impact = RULE_IMPACT['ast-slop/narrative-comment']
      expect(impact).toBeDefined()
      expect(impact.tier).toBe('strict')
      expect(impact.multiplier).toBeGreaterThan(0)
      expect(impact.cap).toBeGreaterThan(0)
    })
  })

  describe('getRuleImpact', () => {
    it('returns the correct impact for a known rule', () => {
      const impact = getRuleImpact('security-deep/eval-usage')
      expect(impact.tier).toBe('strict')
      expect(impact.multiplier).toBe(1.0)
    })

    it('returns DEFAULT_IMPACT for unknown rules', () => {
      const impact = getRuleImpact('nonexistent/rule')
      expect(impact).toBe(DEFAULT_IMPACT)
      expect(impact.tier).toBe('mechanical')
    })

    it('default impact has valid structure', () => {
      expect(DEFAULT_IMPACT.tier).toBeDefined()
      expect(DEFAULT_IMPACT.multiplier).toBeGreaterThan(0)
      expect(DEFAULT_IMPACT.cap).toBeGreaterThan(0)
      expect(DEFAULT_IMPACT.rationale).toBeTruthy()
    })
  })
})
