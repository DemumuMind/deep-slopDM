import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { generateFixPlan } from './plan.js'
import type { Diagnostic } from '../types/index.js'

const TEST_DIR = join(tmpdir(), 'deep-slop-fix-plan-' + process.pid)

function makeDiagnostic(
  filePath: string,
  rule: string,
  line: number,
  confidence: number,
  type: 'replace' | 'insert' | 'delete' | 'refactor',
  text: string,
  range?: { startLine: number, startCol: number, endLine: number, endCol: number },
): Diagnostic {
  return {
    filePath,
    engine: 'ast-slop',
    rule,
    severity: 'warning',
    message: 'test diagnostic',
    help: 'test help',
    line,
    column: 1,
    category: 'ai-slop',
    fixable: true,
    suggestion: {
      type,
      text,
      confidence,
      reason: 'test reason',
      range,
    },
  }
}

describe('generateFixPlan', () => {
  beforeEach(() => {
    mkdirSync(TEST_DIR, { recursive: true })
  })

  afterEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true })
  })

  it('returns empty plan when no diagnostics are fixable', () => {
    const plan = generateFixPlan([], 'force')
    expect(plan.steps).toEqual([])
    expect(plan.fileCount).toBe(0)
    expect(plan.diagnosticCount).toBe(0)
  })

  it('filters by safe mode confidence threshold', () => {
    const diagnostics: Diagnostic[] = [
      makeDiagnostic('a.ts', 'ast-slop/console-leftover', 1, 0.9, 'delete', ''),
      makeDiagnostic('a.ts', 'ast-slop/narrative-comment', 2, 0.5, 'delete', ''),
    ]

    const plan = generateFixPlan(diagnostics, 'safe')
    expect(plan.steps).toHaveLength(1)
    expect(plan.steps[0].rule).toBe('ast-slop/console-leftover')
    expect(plan.diagnosticCount).toBe(1)
  })

  it('filters by --rules when provided', () => {
    const diagnostics: Diagnostic[] = [
      makeDiagnostic('a.ts', 'ast-slop/console-leftover', 1, 0.9, 'delete', ''),
      makeDiagnostic('a.ts', 'ast-slop/narrative-comment', 2, 0.9, 'delete', ''),
    ]

    const plan = generateFixPlan(diagnostics, 'force', undefined, ['ast-slop/console-leftover'])
    expect(plan.steps).toHaveLength(1)
    expect(plan.steps[0].rule).toBe('ast-slop/console-leftover')
  })

  it('reads oldText from file and sorts steps bottom-up', () => {
    writeFileSync(join(TEST_DIR, 'a.ts'), 'line one\nline two\nline three\n', 'utf-8')

    const diagnostics: Diagnostic[] = [
      makeDiagnostic('a.ts', 'ast-slop/console-leftover', 1, 0.9, 'replace', 'REPLACED', { startLine: 1, startCol: 1, endLine: 1, endCol: 9 }),
      makeDiagnostic('a.ts', 'ast-slop/narrative-comment', 3, 0.9, 'replace', 'FIXED', { startLine: 3, startCol: 1, endLine: 3, endCol: 9 }),
    ]

    const plan = generateFixPlan(diagnostics, 'force', TEST_DIR)
    expect(plan.steps).toHaveLength(2)
    expect(plan.steps[0].startLine).toBe(3)
    expect(plan.steps[0].oldText).toBe('line three')
    expect(plan.steps[1].startLine).toBe(1)
    expect(plan.steps[1].oldText).toBe('line one')
  })

  it('handles insert suggestions with empty oldText', () => {
    writeFileSync(join(TEST_DIR, 'b.ts'), 'function foo() {}', 'utf-8')

    const diagnostics: Diagnostic[] = [
      makeDiagnostic('b.ts', 'ast-slop/todo-stub', 1, 0.9, 'insert', '// TODO: implement', { startLine: 1, startCol: 1, endLine: 1, endCol: 17 }),
    ]

    const plan = generateFixPlan(diagnostics, 'force', TEST_DIR)
    expect(plan.steps).toHaveLength(1)
    expect(plan.steps[0].oldText).toBe('')
    expect(plan.steps[0].newText).toBe('// TODO: implement')
  })

  it('skips refactor suggestions from auto-fix', () => {
    const diagnostics: Diagnostic[] = [
      makeDiagnostic('c.ts', 'ast-slop/placeholder-impl', 1, 0.9, 'refactor', 'manual rewrite'),
    ]

    const plan = generateFixPlan(diagnostics, 'force')
    expect(plan.steps).toEqual([])
  })

  it('falls back to diagnostic line when range is missing', () => {
    writeFileSync(join(TEST_DIR, 'd.ts'), 'line one\n', 'utf-8')

    const diagnostic = makeDiagnostic('d.ts', 'ast-slop/console-leftover', 1, 0.9, 'delete', '')
    delete (diagnostic.suggestion as { range?: unknown }).range

    const plan = generateFixPlan([diagnostic], 'force', TEST_DIR)
    expect(plan.steps).toHaveLength(1)
    expect(plan.steps[0].startLine).toBe(1)
    expect(plan.steps[0].endLine).toBe(1)
  })

  it('survives missing rootDir and missing files', () => {
    const diagnostics: Diagnostic[] = [
      makeDiagnostic('missing.ts', 'ast-slop/console-leftover', 1, 0.9, 'replace', 'x'),
    ]

    const plan = generateFixPlan(diagnostics, 'force')
    expect(plan.steps).toHaveLength(1)
    expect(plan.steps[0].oldText).toBe('')
  })
})
