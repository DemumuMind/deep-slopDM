// ── Fix Pipeline Entry Point ───────────────────────────
// Orchestrates: generate plan → apply → (optionally) verify

import type { Diagnostic, EngineContext } from '../types/index.js'
import { calculateScore } from '../scoring/index.js'
import { generateFixPlan } from './plan.js'
import { applyFixPlan } from './apply.js'
import { verifyFix } from './verify.js'
import type { FixOptions, FixResult, PlanPreviewResult, PlanPreviewItem } from './types.js'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

export type { FixStep, FixPlan, FixResult, FixOptions, FixDiff, PlanPreviewItem, PlanPreviewResult } from './types.js'

/**
 * Run the fix pipeline on a set of diagnostics.
 *
 * 1. Generate fix plan from diagnostics
 * 2. Apply fix plan (or dry-run)
 * 3. Optionally verify by re-scoring and rolling back if worse
 *
 * @param diagnostics - All diagnostics from a scan
 * @param context - Engine context with project info
 * @param options - Fix pipeline options (mode, dryRun, verify, rules)
 * @returns FixResult with stats about what was changed
 */
export async function runFix(
  diagnostics: Diagnostic[],
  context: EngineContext,
  options: FixOptions,
): Promise<FixResult> {
  const { mode, dryRun, verify, plan: isPlan, rules } = options
  const rootDir = context.rootDirectory

  // Calculate score before fixes
  const fileCount = context.files?.length ?? 0
  const scoreBefore = calculateScore(diagnostics, fileCount).score

  // Generate fix plan (pass rules filter and rootDir for oldText resolution)
  const plan = generateFixPlan(diagnostics, mode, rootDir, rules)

  if (plan.steps.length === 0) {
    return {
      filesModified: 0,
      diagnosticsFixed: 0,
      scoreBefore,
      scoreAfter: scoreBefore,
      rolledBack: false,
      errors: [],
      diffs: [],
    }
  }

  // If plan mode, return detailed preview instead of applying
  if (isPlan) {
    return generatePlanPreview(diagnostics, context, mode, scoreBefore, fileCount, rules)
  }

  // Apply fix plan
  const result = await applyFixPlan(plan, rootDir, dryRun)

  // Fill in scoreBefore
  result.scoreBefore = scoreBefore

  // If dry run, score stays the same
  if (dryRun) {
    result.scoreAfter = scoreBefore
    return result
  }

  // Optionally verify
  if (verify) {
    // Compute remaining diagnostics (those not fixed)
    const fixedRules = new Set(
      plan.steps.map((s) => `${s.filePath}:${s.startLine}:${s.rule}`)
    )
    const remaining = diagnostics.filter((d) => {
      const key = `${d.filePath}:${d.line}:${d.rule}`
      return !fixedRules.has(key)
    })

    const verifyResult = await verifyFix(rootDir, scoreBefore, context, remaining)
    result.scoreAfter = verifyResult.scoreAfter
    result.rolledBack = verifyResult.rolledBack

    if (verifyResult.rolledBack) {
      result.filesModified = 0
      result.diagnosticsFixed = 0
    }
  } else {
    // Without verification, estimate score after
    const fixedRules = new Set(
      plan.steps.map((s) => `${s.filePath}:${s.startLine}:${s.rule}`)
    )
    const remaining = diagnostics.filter((d) => {
      const key = `${d.filePath}:${d.line}:${d.rule}`
      return !fixedRules.has(key)
    })
    result.scoreAfter = calculateScore(remaining, fileCount).score
  }

  return result
}

/**
 * Generate a detailed plan preview with before/after snippets.
 * Returns a FixResult-shaped object but with plan preview data encoded
 * in the errors field (consumed by the CLI --plan handler).
 */
function generatePlanPreview(
  diagnostics: Diagnostic[],
  context: EngineContext,
  mode: 'safe' | 'force',
  scoreBefore: number,
  fileCount: number,
  rules?: string[],
): FixResult {
  const rootDir = context.rootDirectory
  const plan = generateFixPlan(diagnostics, mode, rootDir, rules)

  // Build preview items with before/after snippets
  const items: PlanPreviewItem[] = plan.steps.map((step) => {
    let before = ''
    try {
      const absolutePath = join(rootDir, step.filePath)
      const content = readFileSync(absolutePath, 'utf-8')
      const lines = content.split('\n')
      const startIdx = Math.max(0, step.startLine - 1)
      const endIdx = Math.min(lines.length - 1, step.endLine - 1)
      before = lines.slice(startIdx, endIdx + 1).join('\n')
    } catch {
      before = '(unable to read file)'
    }

    return {
      filePath: step.filePath,
      rule: step.rule,
      before,
      after: step.newText || '(deletion)',
      confidence: step.confidence,
      startLine: step.startLine,
      endLine: step.endLine,
    }
  })

  // Compute estimated score after
  const fixedRules = new Set(
    plan.steps.map((s) => `${s.filePath}:${s.startLine}:${s.rule}`)
  )
  const remaining = diagnostics.filter((d) => {
    const key = `${d.filePath}:${d.line}:${d.rule}`
    return !fixedRules.has(key)
  })
  const estimatedScoreAfter = calculateScore(remaining, fileCount).score

  // Estimate effort
  const effort: 'low' | 'medium' | 'high' =
    plan.steps.length <= 5 ? 'low' : plan.steps.length <= 20 ? 'medium' : 'high'

  // Serialize preview data into errors field for CLI consumption
  const previewData: PlanPreviewResult = {
    items,
    filesAffected: [...new Set(plan.steps.map((s) => s.filePath))],
    diagnosticsAddressed: plan.diagnosticCount,
    scoreBefore,
    estimatedScoreAfter,
    estimatedEffort: effort,
  }

  return {
    filesModified: plan.fileCount,
    diagnosticsFixed: plan.diagnosticCount,
    scoreBefore,
    scoreAfter: estimatedScoreAfter,
    rolledBack: false,
    errors: [JSON.stringify(previewData)],
    diffs: [],
  }
}

/** Extract PlanPreviewResult from a FixResult returned by plan mode */
export function extractPlanPreview(result: FixResult): PlanPreviewResult | null {
  if (result.errors.length !== 1) return null
  try {
    const data = JSON.parse(result.errors[0])
    if (data && typeof data.items === 'object' && typeof data.scoreBefore === 'number') {
      return data as PlanPreviewResult
    }
  } catch {
    return null
  }
  return null
}
