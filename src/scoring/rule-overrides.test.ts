import { describe, it, expect } from 'vitest'
import { applyRuleSeverities } from './rule-overrides.js'
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

describe('rule-overrides', () => {
  describe('applyRuleSeverities', () => {
    it('returns diagnostics unchanged when overrides is empty', () => {
      const diags = [makeDiag('ast-slop/narrative-comment', 'error')]
      expect(applyRuleSeverities(diags, {})).toEqual(diags)
    })

    it('filters out diagnostics when override is off', () => {
      const diags = [
        makeDiag('ast-slop/narrative-comment', 'error'),
        makeDiag('ast-slop/trivial-comment', 'warning'),
      ]
      const result = applyRuleSeverities(diags, { 'ast-slop/narrative-comment': 'off' })
      expect(result).toHaveLength(1)
      expect(result[0].rule).toBe('ast-slop/trivial-comment')
    })

    it('rewrites severity from error to warning', () => {
      const diags = [makeDiag('ast-slop/narrative-comment', 'error')]
      const result = applyRuleSeverities(diags, { 'ast-slop/narrative-comment': 'warning' })
      expect(result).toHaveLength(1)
      expect(result[0].severity).toBe('warning')
    })

    it('keeps diagnostics without matching overrides unchanged', () => {
      const diags = [makeDiag('ast-slop/narrative-comment', 'error')]
      const result = applyRuleSeverities(diags, { 'dead-flow/unused-variable': 'off' })
      expect(result).toHaveLength(1)
      expect(result[0].severity).toBe('error')
    })

    it('wildcard override matches rules with matching prefix', () => {
      const diags = [
        makeDiag('ast-slop/narrative-comment', 'error'),
        makeDiag('ast-slop/trivial-comment', 'warning'),
        makeDiag('dead-flow/unused-variable', 'error'),
      ]
      const result = applyRuleSeverities(diags, { 'ast-slop/*': 'info' })
      expect(result).toHaveLength(3)
      expect(result[0].severity).toBe('info')
      expect(result[1].severity).toBe('info')
      expect(result[2].severity).toBe('error')
    })

    it('exact match override takes precedence over wildcard', () => {
      const diags = [makeDiag('ast-slop/narrative-comment', 'error')]
      const result = applyRuleSeverities(diags, {
        'ast-slop/*': 'off',
        'ast-slop/narrative-comment': 'warning',
      })
      expect(result).toHaveLength(1)
      expect(result[0].severity).toBe('warning')
    })

    it('handles empty diagnostics array', () => {
      expect(applyRuleSeverities([], { 'ast-slop/*': 'off' })).toEqual([])
    })

    it('does not duplicate when override severity matches existing', () => {
      const diags = [makeDiag('ast-slop/narrative-comment', 'error')]
      const result = applyRuleSeverities(diags, { 'ast-slop/narrative-comment': 'error' })
      expect(result).toHaveLength(1)
      expect(result[0].severity).toBe('error')
    })
  })
})
