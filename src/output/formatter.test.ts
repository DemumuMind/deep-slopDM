import { describe, it, expect } from 'vitest'
import type { ScanResult, Diagnostic } from '../types/index.js'

process.env.NO_COLOR = '1'
const { formatOutput } = await import('./formatter.js')

function diagnostic(overrides: Partial<Diagnostic> = {}): Diagnostic {
  return {
    filePath: 'src/app.ts',
    engine: 'ast-slop',
    rule: 'ast-slop/todo-stub',
    severity: 'warning',
    message: 'TODO found',
    help: 'Resolve the TODO',
    line: 5,
    column: 1,
    category: 'ai-slop',
    fixable: false,
    ...overrides,
  }
}

function buildResult(partial: Partial<ScanResult> = {}): ScanResult {
  return {
    engines: [],
    score: 95,
    scoreable: true,
    categoryScores: {
      'ai-slop': 95,
      imports: 100,
      'dead-code': 100,
      types: 100,
      syntax: 100,
      security: 100,
      architecture: 100,
      duplication: 100,
      performance: 100,
      i18n: 100,
      config: 100,
      style: 100,
    },
    totalDiagnostics: 0,
    bySeverity: { error: 0, warning: 0, info: 0, suggestion: 0 },
    byEngine: { 'ast-slop': 0 },
    suppressedCount: 0,
    meta: {
      rootDirectory: '/tmp',
      languages: ['typescript'],
      frameworks: ['none'],
      filesScanned: 3,
      elapsed: 42,
    },
    ...partial,
  } as unknown as ScanResult
}

describe('formatOutput', () => {
  it('formats a clean scan result', () => {
    const result = buildResult({ score: 95, totalDiagnostics: 0 })
    const output = formatOutput(result)
    expect(output).toContain('deep-slop scan results')
    expect(output).toContain('Score: 95/100')
    expect(output).toContain('No issues found')
  })

  it('formats a result with diagnostics', () => {
    const d = diagnostic()
    const result = buildResult({
      score: 72,
      totalDiagnostics: 1,
      bySeverity: { error: 0, warning: 1, info: 0, suggestion: 0 },
      byEngine: { 'ast-slop': 1 },
      engines: [
        {
          engine: 'ast-slop',
          diagnostics: [d],
          elapsed: 12,
          skipped: false,
        },
      ],
    } as unknown as Partial<ScanResult>)
    const output = formatOutput(result)
    expect(output).toContain('ast-slop')
    expect(output).toContain('TODO Stub')
    expect(output).toContain('src/app.ts:5:1')
    expect(output).toContain('TODO found')
  })

  it('handles a null score', () => {
    const result = buildResult({ score: null, scoreable: false, totalDiagnostics: 0 })
    const output = formatOutput(result)
    expect(output).toContain('\u2014')
    expect(output).toContain('unsupported languages')
  })

  it('shows suppressed count when present', () => {
    const result = buildResult({ suppressedCount: 2, totalDiagnostics: 2 })
    const output = formatOutput(result)
    expect(output).toContain('suppressed')
    expect(output).toContain('2')
  })
})
