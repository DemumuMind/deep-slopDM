import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { verifyFix } from './verify.js'
import { DEFAULT_CONFIG } from '../types/index.js'
import type { Diagnostic, EngineContext } from '../types/index.js'

const TEST_DIR = join(tmpdir(), 'deep-slop-fix-verify-' + process.pid)

function makeDiagnostic(rule: string, severity: 'error' | 'warning' | 'info' | 'suggestion'): Diagnostic {
  return {
    filePath: 'src/index.ts',
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

function makeContext(): EngineContext {
  return {
    rootDirectory: TEST_DIR,
    languages: ['typescript'],
    frameworks: ['none'],
    installedTools: {},
    config: DEFAULT_CONFIG,
    files: ['src/index.ts'],
  }
}

function manyErrors(count: number): Diagnostic[] {
  return Array.from({ length: count }, (_, i) =>
    makeDiagnostic(`ast-slop/rule-${i}`, 'error'),
  )
}

describe('verifyFix', () => {
  beforeEach(() => {
    mkdirSync(TEST_DIR, { recursive: true })
  })

  afterEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true })
  })

  it('returns improved when score stays the same', async () => {
    const diagnostics: Diagnostic[] = []
    const result = await verifyFix(TEST_DIR, 100, makeContext(), diagnostics)
    expect(result.scoreAfter).toBe(100)
    expect(result.improved).toBe(true)
    expect(result.rolledBack).toBe(false)
  })

  it('returns improved when scoreAfter is higher than scoreBefore', async () => {
    const diagnostics: Diagnostic[] = [makeDiagnostic('ast-slop/console-leftover', 'warning')]
    const result = await verifyFix(TEST_DIR, 50, makeContext(), diagnostics)
    expect(result.scoreAfter).toBeGreaterThan(50)
    expect(result.improved).toBe(true)
    expect(result.rolledBack).toBe(false)
  })

  it('rolls back when score worsens and backup exists', async () => {
    const filePath = 'src/index.ts'
    const backupDir = join(TEST_DIR, '.deep-slop/fix-backup')
    mkdirSync(backupDir, { recursive: true })
    mkdirSync(join(TEST_DIR, 'src'), { recursive: true })
    mkdirSync(join(backupDir, 'src'), { recursive: true })
    writeFileSync(join(TEST_DIR, filePath), 'worse\n', 'utf-8')
    writeFileSync(join(backupDir, filePath), 'better\n', 'utf-8')

    const diagnostics = manyErrors(50)

    const result = await verifyFix(TEST_DIR, 95, makeContext(), diagnostics)
    expect(result.improved).toBe(false)
    expect(result.rolledBack).toBe(true)
    expect(result.scoreAfter).toBe(95)
    expect(existsSync(join(TEST_DIR, filePath))).toBe(true)
    expect(readFileSync(join(TEST_DIR, filePath), 'utf-8')).toBe('better\n')
  })

  it('does not roll back when score worsens but no backup exists', async () => {
    const diagnostics = manyErrors(50)

    const result = await verifyFix(TEST_DIR, 95, makeContext(), diagnostics)
    expect(result.improved).toBe(false)
    expect(result.rolledBack).toBe(false)
    expect(result.scoreAfter).toBeLessThan(95)
  })
})
