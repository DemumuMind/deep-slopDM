import { describe, it, expect } from 'vitest'
import { scoreLabel, calculateScore, DEFAULT_SCORING_CONFIG } from './index.js'
import type { Diagnostic } from '../types/index.js'

function makeDiag(rule: string, severity: 'error' | 'warning' | 'info' | 'suggestion'): Diagnostic {
  return {
    filePath: 'test.ts',
    engine: 'ast-slop',
    rule,
    severity,
    message: 'test',
    help: 'test help',
    line: 1,
    column: 1,
    category: 'ai-slop',
    fixable: false,
  }
}

/** Config with very low smoothing for tests that need score differentiation */
const LOW_SMOOTHING_CONFIG = {
  ...DEFAULT_SCORING_CONFIG,
  smoothing: 0,
}

describe('scoring/index', () => {
  describe('scoreLabel', () => {
    it('returns Healthy for scores >= 75', () => {
      expect(scoreLabel(100)).toBe('Healthy')
      expect(scoreLabel(75)).toBe('Healthy')
      expect(scoreLabel(90)).toBe('Healthy')
    })

    it('returns Needs Work for scores >= 50 and < 75', () => {
      expect(scoreLabel(74)).toBe('Needs Work')
      expect(scoreLabel(50)).toBe('Needs Work')
      expect(scoreLabel(60)).toBe('Needs Work')
    })

    it('returns Critical for scores < 50', () => {
      expect(scoreLabel(49)).toBe('Critical')
      expect(scoreLabel(0)).toBe('Critical')
      expect(scoreLabel(25)).toBe('Critical')
    })
  })

  describe('calculateScore', () => {
    it('returns 100 for empty diagnostics', () => {
      const result = calculateScore([], 100)
      expect(result.score).toBe(100)
      expect(result.label).toBe('Healthy')
      expect(result.density).toBe(0)
    })

    it('penalizes error diagnostics more than warnings', () => {
      // Use multiple distinct rules to avoid maxPerRule cap
      const rules = [
        'ast-slop/narrative-comment',
        'ast-slop/empty-catch',
        'security-deep/eval-usage',
        'import-intelligence/circular-dependency',
        'dead-flow/unreachable-after-terminator',
      ]
      const errors = rules.map(r => makeDiag(r, 'error'))
      const warnings = rules.map(r => makeDiag(r, 'warning'))

      const errorResult = calculateScore(errors, 1, LOW_SMOOTHING_CONFIG)
      const warningResult = calculateScore(warnings, 1, LOW_SMOOTHING_CONFIG)

      // Error weight (10) > Warning weight (1), so error score should be lower
      expect(errorResult.score).toBeLessThan(warningResult.score)
    })

    it('does not penalize info/suggestion diagnostics in scoring', () => {
      const infos = [makeDiag('ast-slop/narrative-comment', 'info')]
      const result = calculateScore(infos, 100)
      // info has weight 0 so totalDeduction should be 0
      expect(result.totalDeduction).toBe(0)
    })

    it('uses logarithmic mode by default', () => {
      const result = calculateScore([], 100)
      expect(result.mode).toBe('logarithmic')
    })

    it('uses linear mode when configured', () => {
      const config = { ...DEFAULT_SCORING_CONFIG, mode: 'linear' as const }
      const result = calculateScore([], 0, config)
      expect(result.mode).toBe('linear')
    })

    it('linear mode scores lower with more diagnostics', () => {
      const config = { ...DEFAULT_SCORING_CONFIG, mode: 'linear' as const }
      const one = calculateScore([makeDiag('ast-slop/narrative-comment', 'error')], 0, config)
      const five = calculateScore(
        Array.from({ length: 5 }, () => makeDiag('ast-slop/narrative-comment', 'error')),
        0,
        config,
      )
      expect(five.score).toBeLessThan(one.score)
    })

    it('clamps score between 0 and 100', () => {
      const manyErrors = Array.from({ length: 200 }, (_, i) =>
        makeDiag(`ast-slop/narrative-comment`, 'error'),
      )
      const result = calculateScore(manyErrors, 1, LOW_SMOOTHING_CONFIG)
      expect(result.score).toBeGreaterThanOrEqual(0)
      expect(result.score).toBeLessThanOrEqual(100)
    })

    it('density is higher for more diagnostics relative to file count', () => {
      const few = calculateScore([makeDiag('ast-slop/narrative-comment', 'error')], 10000)
      const many = calculateScore(
        Array.from({ length: 100 }, () => makeDiag('ast-slop/narrative-comment', 'error')),
        10,
      )
      expect(many.density).toBeGreaterThan(few.density)
    })

    it('only error and warning count toward density', () => {
      const allInfo = Array.from({ length: 50 }, () => makeDiag('ast-slop/narrative-comment', 'info'))
      const result = calculateScore(allInfo, 1)
      expect(result.density).toBe(0)
    })

    it('logarithmic score with low smoothing drops below 100', () => {
      const errors = Array.from({ length: 10 }, () => makeDiag('ast-slop/narrative-comment', 'error'))
      const result = calculateScore(errors, 1, LOW_SMOOTHING_CONFIG)
      expect(result.score).toBeLessThan(100)
    })
  })
})
