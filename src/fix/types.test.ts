import { describe, it, expect } from 'vitest'
import type { FixStep, FixPlan, FixResult, FixOptions, FixDiff, PlanPreviewItem, PlanPreviewResult } from './types.js'

describe('fix types', () => {
  it('supports a valid FixStep object', () => {
    const step: FixStep = {
      filePath: 'src/index.ts',
      startLine: 1,
      endLine: 2,
      oldText: 'console.log("debug")',
      newText: '',
      rule: 'ast-slop/console-leftover',
      confidence: 0.9,
    }

    expect(step.rule).toBe('ast-slop/console-leftover')
    expect(step.confidence).toBeGreaterThanOrEqual(0)
    expect(step.confidence).toBeLessThanOrEqual(1)
  })

  it('supports a valid FixPlan object', () => {
    const plan: FixPlan = {
      steps: [],
      fileCount: 0,
      diagnosticCount: 0,
    }

    expect(plan.fileCount).toBe(0)
    expect(plan.diagnosticCount).toBe(0)
  })

  it('supports FixOptions with required fields', () => {
    const options: FixOptions = {
      mode: 'safe',
      dryRun: true,
      verify: false,
      rules: ['ast-slop/console-leftover'],
    }

    expect(options.mode).toBe('safe')
    expect(options.dryRun).toBe(true)
    expect(options.rules).toHaveLength(1)
  })

  it('supports a valid FixResult object', () => {
    const result: FixResult = {
      filesModified: 1,
      diagnosticsFixed: 1,
      scoreBefore: 80,
      scoreAfter: 85,
      rolledBack: false,
      errors: [],
      diffs: [],
    }

    expect(result.scoreAfter).toBeGreaterThan(result.scoreBefore)
    expect(result.rolledBack).toBe(false)
  })

  it('supports a valid FixDiff object', () => {
    const diff: FixDiff = {
      filePath: 'src/index.ts',
      rule: 'ast-slop/console-leftover',
      line: 1,
      before: 'console.log("debug")',
      after: '',
      confidence: 0.9,
    }

    expect(diff.line).toBe(1)
    expect(diff.after).toBe('')
  })

  it('supports a valid PlanPreviewResult object', () => {
    const item: PlanPreviewItem = {
      filePath: 'src/index.ts',
      rule: 'ast-slop/console-leftover',
      before: 'console.log("debug")',
      after: '',
      confidence: 0.9,
      startLine: 1,
      endLine: 1,
    }

    const preview: PlanPreviewResult = {
      items: [item],
      filesAffected: ['src/index.ts'],
      diagnosticsAddressed: 1,
      scoreBefore: 80,
      estimatedScoreAfter: 85,
      estimatedEffort: 'low',
    }

    expect(preview.estimatedEffort).toBeOneOf(['low', 'medium', 'high'])
    expect(preview.items).toHaveLength(1)
  })
})
