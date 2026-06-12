import { describe, it, expect } from 'vitest'
import { formatHookFeedback } from './feedback.js'
import type { ScanResult, Diagnostic } from '../types/index.js'

function makeDiag(filePath: string, line: number, rule: string): Diagnostic {
  return {
    filePath,
    engine: 'ast-slop',
    rule,
    severity: 'error',
    message: 'test',
    help: 'test',
    line,
    column: 1,
    category: 'ai-slop',
    fixable: false,
  }
}

function makeScanResult(score: number, diags: Diagnostic[]): ScanResult {
  return {
    score,
    engines: diags.length > 0
      ? [{ engine: 'ast-slop', diagnostics: diags, elapsed: 100, skipped: false }]
      : [],
    categoryScores: {} as Record<string, number>,
    totalDiagnostics: diags.length,
    bySeverity: { error: diags.length, warning: 0, info: 0, suggestion: 0 },
    byEngine: { 'ast-slop': diags.length } as Record<string, number>,
    meta: {
      rootDirectory: '/test',
      languages: ['typescript'],
      frameworks: ['none'],
      filesScanned: 10,
      elapsed: 100,
    },
  }
}

describe('feedback', () => {
  describe('formatHookFeedback', () => {
    it('shows score delta', () => {
      const before = makeScanResult(80, [])
      const after = makeScanResult(90, [])
      const feedback = formatHookFeedback(before, after)
      expect(feedback).toContain('Score: 80 → 90 (+10)')
    })

    it('shows negative score delta', () => {
      const before = makeScanResult(90, [])
      const after = makeScanResult(80, [])
      const feedback = formatHookFeedback(before, after)
      expect(feedback).toContain('Score: 90 → 80 (-10)')
    })

    it('shows zero score delta', () => {
      const before = makeScanResult(80, [])
      const after = makeScanResult(80, [])
      const feedback = formatHookFeedback(before, after)
      expect(feedback).toContain('Score: 80 → 80 (0)')
    })

    it('shows resolved issues when diagnostics are removed', () => {
      const diag = makeDiag('app.ts', 5, 'ast-slop/narrative-comment')
      const before = makeScanResult(70, [diag])
      const after = makeScanResult(90, [])
      const feedback = formatHookFeedback(before, after)
      expect(feedback).toContain('1 issue resolved')
      expect(feedback).toContain('0 issues remaining')
    })

    it('shows new warnings when new diagnostics appear', () => {
      const diag = makeDiag('app.ts', 5, 'ast-slop/narrative-comment')
      const before = makeScanResult(90, [])
      const after = makeScanResult(70, [diag])
      const feedback = formatHookFeedback(before, after)
      expect(feedback).toContain('1 new warning introduced')
    })

    it('pluralizes issues correctly', () => {
      const diags = [
        makeDiag('a.ts', 1, 'ast-slop/narrative-comment'),
        makeDiag('b.ts', 2, 'ast-slop/trivial-comment'),
      ]
      const after = makeScanResult(70, diags)
      const feedback = formatHookFeedback(makeScanResult(90, []), after)
      expect(feedback).toContain('2 new warnings introduced')
      expect(feedback).toContain('2 issues remaining')
    })
  })
})
