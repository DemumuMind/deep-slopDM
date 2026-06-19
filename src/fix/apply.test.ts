import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { applyFixPlan, rollback } from './apply.js'
import type { FixPlan, FixStep } from './types.js'

const TEST_DIR = join(tmpdir(), 'deep-slop-fix-apply-' + process.pid)

function makePlan(steps: FixStep[]): FixPlan {
  return {
    steps,
    fileCount: new Set(steps.map((s) => s.filePath)).size,
    diagnosticCount: steps.length,
  }
}

describe('applyFixPlan', () => {
  beforeEach(() => {
    mkdirSync(TEST_DIR, { recursive: true })
  })

  afterEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true })
  })

  it('applies a replace step and creates a backup', async () => {
    const filePath = 'target.ts'
    writeFileSync(join(TEST_DIR, filePath), 'console.log("debug")\n', 'utf-8')

    const plan = makePlan([{
      filePath,
      startLine: 1,
      endLine: 1,
      oldText: 'console.log("debug")',
      newText: '// removed debug log',
      rule: 'ast-slop/console-leftover',
      confidence: 0.9,
    }])

    const result = await applyFixPlan(plan, TEST_DIR, false)
    expect(result.filesModified).toBe(1)
    expect(result.diagnosticsFixed).toBe(1)
    expect(result.errors).toEqual([])

    const updated = readFileSync(join(TEST_DIR, filePath), 'utf-8')
    expect(updated).toBe('// removed debug log\n')

    const backup = join(TEST_DIR, '.deep-slop/fix-backup', filePath)
    expect(existsSync(backup)).toBe(true)
    expect(readFileSync(backup, 'utf-8')).toBe('console.log("debug")\n')
  })

  it('dry run returns diffs without modifying files', async () => {
    const filePath = 'dry.ts'
    writeFileSync(join(TEST_DIR, filePath), 'bad\n', 'utf-8')

    const plan = makePlan([{
      filePath,
      startLine: 1,
      endLine: 1,
      oldText: 'bad',
      newText: 'good',
      rule: 'ast-slop/narrative-comment',
      confidence: 0.9,
    }])

    const result = await applyFixPlan(plan, TEST_DIR, true)
    expect(result.filesModified).toBe(1)
    expect(result.diagnosticsFixed).toBe(1)
    expect(result.diffs).toHaveLength(1)
    expect(result.diffs[0].before).toBe('bad')
    expect(result.diffs[0].after).toBe('good')

    const unchanged = readFileSync(join(TEST_DIR, filePath), 'utf-8')
    expect(unchanged).toBe('bad\n')
  })

  it('deletes lines when newText is empty', async () => {
    const filePath = 'delete.ts'
    writeFileSync(join(TEST_DIR, filePath), 'keep\nremove\nkeep\n', 'utf-8')

    const plan = makePlan([{
      filePath,
      startLine: 2,
      endLine: 2,
      oldText: 'remove',
      newText: '',
      rule: 'ast-slop/console-leftover',
      confidence: 0.9,
    }])

    const result = await applyFixPlan(plan, TEST_DIR, false)
    expect(result.filesModified).toBe(1)
    expect(result.errors).toEqual([])

    const updated = readFileSync(join(TEST_DIR, filePath), 'utf-8')
    expect(updated).toBe('keep\nkeep\n')
  })

  it('records an error when oldText does not match', async () => {
    const filePath = 'mismatch.ts'
    writeFileSync(join(TEST_DIR, filePath), 'actual\n', 'utf-8')

    const plan = makePlan([{
      filePath,
      startLine: 1,
      endLine: 1,
      oldText: 'expected',
      newText: 'replaced',
      rule: 'ast-slop/console-leftover',
      confidence: 0.9,
    }])

    const result = await applyFixPlan(plan, TEST_DIR, false)
    expect(result.filesModified).toBe(0)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]).toContain('oldText mismatch')

    const unchanged = readFileSync(join(TEST_DIR, filePath), 'utf-8')
    expect(unchanged).toBe('actual\n')
  })

  it('records an error when the file is missing', async () => {
    const plan = makePlan([{
      filePath: 'missing.ts',
      startLine: 1,
      endLine: 1,
      oldText: 'x',
      newText: 'y',
      rule: 'ast-slop/console-leftover',
      confidence: 0.9,
    }])

    const result = await applyFixPlan(plan, TEST_DIR, false)
    expect(result.filesModified).toBe(0)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]).toContain('File not found')
  })

  it('records an error for invalid line ranges', async () => {
    const filePath = 'range.ts'
    writeFileSync(join(TEST_DIR, filePath), 'one\n', 'utf-8')

    const plan = makePlan([{
      filePath,
      startLine: 5,
      endLine: 5,
      oldText: 'x',
      newText: 'y',
      rule: 'ast-slop/console-leftover',
      confidence: 0.9,
    }])

    const result = await applyFixPlan(plan, TEST_DIR, false)
    expect(result.filesModified).toBe(0)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]).toContain('Invalid line range')
  })

  it('rollback restores files from backup', async () => {
    const filePath = 'rollback.ts'
    const original = 'original content\n'
    writeFileSync(join(TEST_DIR, filePath), original, 'utf-8')

    const plan = makePlan([{
      filePath,
      startLine: 1,
      endLine: 1,
      oldText: 'original content',
      newText: 'modified content',
      rule: 'ast-slop/console-leftover',
      confidence: 0.9,
    }])

    await applyFixPlan(plan, TEST_DIR, false)
    expect(readFileSync(join(TEST_DIR, filePath), 'utf-8')).toBe('modified content\n')

    const rolled = await rollback(TEST_DIR)
    expect(rolled).toContain('rollback.ts')
    expect(readFileSync(join(TEST_DIR, filePath), 'utf-8')).toBe(original)
  })

  it('rollback returns empty list when no backup directory exists', async () => {
    const rolled = await rollback(TEST_DIR)
    expect(rolled).toEqual([])
  })
})
