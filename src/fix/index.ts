// ── Fix Pipeline Entry Point ───────────────────────────
// Orchestrates: generate plan → apply → (optionally) verify

import type { Diagnostic, EngineContext } from '../types/index.js'
import { calculateScore } from '../scoring/index.js'
import { generateFixPlan } from './plan.js'
import { applyFixPlan } from './apply.js'
import { verifyFix } from './verify.js'
import type { FixOptions, FixResult } from './types.js'

export type { FixStep, FixPlan, FixResult, FixOptions } from './types.js'

/**
 * Run the fix pipeline on a set of diagnostics.
 *
 * 1. Generate fix plan from diagnostics
 * 2. Apply fix plan (or dry-run)
 * 3. Optionally verify by re-scoring and rolling back if worse
 *
 * @param diagnostics - All diagnostics from a scan
 * @param context - Engine context with project info
 * @param options - Fix pipeline options (mode, dryRun, verify)
 * @returns FixResult with stats about what was changed
 */
export async function runFix(
  diagnostics: Diagnostic[],
  context: EngineContext,
  options: FixOptions,
): Promise<FixResult> {
  const { mode, dryRun, verify } = options
  const rootDir = context.rootDirectory

  // Calculate score before fixes
  const fileCount = context.files?.length ?? 0
  const scoreBefore = calculateScore(diagnostics, fileCount).score

  // Generate fix plan
  const plan = generateFixPlan(diagnostics, mode)

  if (plan.steps.length === 0) {
    return {
      filesModified: 0,
      diagnosticsFixed: 0,
      scoreBefore,
      scoreAfter: scoreBefore,
      rolledBack: false,
      errors: [],
    }
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
