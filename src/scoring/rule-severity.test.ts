import { describe, it, expect } from 'vitest'
import { SEVERITY_WEIGHTS, getSeverityWeight } from './rule-severity.js'

describe('rule-severity', () => {
  describe('SEVERITY_WEIGHTS', () => {
    it('has weights for all four severity levels', () => {
      expect(SEVERITY_WEIGHTS.error).toBeDefined()
      expect(SEVERITY_WEIGHTS.warning).toBeDefined()
      expect(SEVERITY_WEIGHTS.info).toBeDefined()
      expect(SEVERITY_WEIGHTS.suggestion).toBeDefined()
    })

    it('errors have the highest weight', () => {
      expect(SEVERITY_WEIGHTS.error).toBeGreaterThan(SEVERITY_WEIGHTS.warning)
      expect(SEVERITY_WEIGHTS.error).toBeGreaterThan(SEVERITY_WEIGHTS.info)
      expect(SEVERITY_WEIGHTS.error).toBeGreaterThan(SEVERITY_WEIGHTS.suggestion)
    })

    it('info and suggestion have zero weight', () => {
      expect(SEVERITY_WEIGHTS.info).toBe(0)
      expect(SEVERITY_WEIGHTS.suggestion).toBe(0)
    })
  })

  describe('getSeverityWeight', () => {
    it('returns correct weight for error', () => {
      expect(getSeverityWeight('error')).toBe(SEVERITY_WEIGHTS.error)
    })

    it('returns correct weight for warning', () => {
      expect(getSeverityWeight('warning')).toBe(SEVERITY_WEIGHTS.warning)
    })

    it('returns zero for info', () => {
      expect(getSeverityWeight('info')).toBe(0)
    })

    it('returns zero for suggestion', () => {
      expect(getSeverityWeight('suggestion')).toBe(0)
    })
  })
})
