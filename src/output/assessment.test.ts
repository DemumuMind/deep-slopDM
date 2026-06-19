import { describe, it, expect } from 'vitest'
import type { Diagnostic } from '../types/index.js'
import { assessDiagnostic, summarizeAssessments } from './assessment.js'

function base(severity: Diagnostic['severity']): Diagnostic {
  return {
    filePath: 'src/app.ts',
    engine: 'ast-slop',
    rule: 'ast-slop/todo-stub',
    severity,
    message: 'todo',
    help: 'remove',
    line: 1,
    column: 1,
    category: 'style',
    fixable: false,
  }
}

describe('assessDiagnostic', () => {
  it('classifies trivial fixable high-confidence suggestions', () => {
    const diag: Diagnostic = {
      ...base('info'),
      fixable: true,
      suggestion: {
        type: 'replace',
        text: 'fix',
        confidence: 0.9,
        reason: 'high confidence',
      },
    }
    expect(assessDiagnostic(diag)).toEqual({
      complexity: 'trivial',
      estimatedEffort: '1 min',
      priority: 1,
    })
  })

  it('classifies simple non-fixable warnings', () => {
    const diag: Diagnostic = {
      ...base('warning'),
      fixable: false,
    }
    expect(assessDiagnostic(diag).complexity).toBe('simple')
    expect(assessDiagnostic(diag).estimatedEffort).toBe('5 min')
  })

  it('classifies moderate fixable errors', () => {
    const diag: Diagnostic = {
      ...base('error'),
      fixable: true,
    }
    expect(assessDiagnostic(diag)).toEqual({
      complexity: 'moderate',
      estimatedEffort: '15 min',
      priority: 3,
    })
  })

  it('classifies complex architecture issues', () => {
    const diag: Diagnostic = {
      ...base('warning'),
      category: 'architecture',
    }
    expect(assessDiagnostic(diag)).toEqual({
      complexity: 'complex',
      estimatedEffort: '60 min',
      priority: 4,
    })
  })

  it('classifies complex non-fixable security errors', () => {
    const diag: Diagnostic = {
      ...base('error'),
      fixable: false,
      category: 'security',
    }
    expect(assessDiagnostic(diag).complexity).toBe('complex')
  })
})

describe('summarizeAssessments', () => {
  it('returns zero effort for an empty list', () => {
    expect(summarizeAssessments([])).toEqual({
      total: 0,
      byComplexity: { trivial: 0, simple: 0, moderate: 0, complex: 0 },
      estimatedTotalEffort: '0 min',
      topPriority: 0,
    })
  })

  it('aggregates complexity and effort', () => {
    const diagnostics: Diagnostic[] = [
      { ...base('error'), fixable: true },
      { ...base('info'), fixable: true, suggestion: { type: 'replace', text: 'x', confidence: 0.9, reason: 'x' } },
      { ...base('warning'), category: 'architecture' },
    ]
    const summary = summarizeAssessments(diagnostics)
    expect(summary.total).toBe(3)
    expect(summary.byComplexity.moderate).toBe(1)
    expect(summary.byComplexity.trivial).toBe(1)
    expect(summary.byComplexity.complex).toBe(1)
    expect(summary.estimatedTotalEffort).toBe('1h 16m')
    expect(summary.topPriority).toBe(4)
  })

  it('formats hours when effort crosses 60 minutes', () => {
    const diagnostics: Diagnostic[] = Array.from({ length: 6 }).map(() => ({
      ...base('error'),
      fixable: true,
    }))
    const summary = summarizeAssessments(diagnostics)
    expect(summary.estimatedTotalEffort).toBe('1h 30m')
  })
})
