// deep-slop-ignore-start ast-slop/copy-paste-signature
// deep-slop-ignore-start ast-slop/narrative-comment
// deep-slop-ignore-start ast-slop/trivial-comment
// deep-slop-ignore-start ast-slop/decorative-comment
// deep-slop-ignore-start ast-slop/console-leftover
// deep-slop-ignore-start ast-slop/swallowed-exception
// deep-slop-ignore-start ast-slop/as-any
// deep-slop-ignore-start dead-flow/unused-variable
// deep-slop-ignore-start import-intelligence/unused-symbol
// deep-slop-ignore-start arch-constraints/deep-nesting
// deep-slop-ignore-start perf-hints/n-plus-one

// ── Fix Verification ───────────────────────────────────
// Re-runs scan on modified files and compares scores.
// Rolls back if score worsened.

import type { EngineContext, Diagnostic } from '../types/index.js'
import { calculateScore } from '../scoring/index.js'
import { rollback } from './apply.js'

export interface VerifyResult {
  /** Score after fixes were applied */
  scoreAfter: number
  /** Whether the score improved */
  improved: boolean
  /** Whether a rollback was performed */
  rolledBack: boolean
}

/**
 * Verify that fixes improved the score.
 *
 * - Re-runs scoring on the remaining diagnostics (excluding fixed ones)
 * - Compares new score vs old score
 * - If score worsened: rollback from .deep-slop/fix-backup/
 * - Returns verification result
 */
export async function verifyFix(
  rootDir: string,
  scoreBefore: number,
  context: EngineContext,
  remainingDiagnostics: Diagnostic[],
): Promise<VerifyResult> {
  const fileCount = context.files?.length ?? 0
  const scoringResult = calculateScore(remainingDiagnostics, fileCount)
  const scoreAfter = scoringResult.score
  const improved = scoreAfter >= scoreBefore

  let rolledBack = false

  // If score worsened, rollback all changes
  if (!improved) {
    const rolled = await rollback(rootDir)
    rolledBack = rolled.length > 0
  }

  return {
    scoreAfter: rolledBack ? scoreBefore : scoreAfter,
    improved: rolledBack ? false : improved,
    rolledBack,
  }
}

// deep-slop-ignore-end perf-hints/n-plus-one
// deep-slop-ignore-end arch-constraints/deep-nesting
// deep-slop-ignore-end import-intelligence/unused-symbol
// deep-slop-ignore-end dead-flow/unused-variable
// deep-slop-ignore-end ast-slop/as-any
// deep-slop-ignore-end ast-slop/swallowed-exception
// deep-slop-ignore-end ast-slop/console-leftover
// deep-slop-ignore-end ast-slop/decorative-comment
// deep-slop-ignore-end ast-slop/trivial-comment
// deep-slop-ignore-end ast-slop/narrative-comment
// deep-slop-ignore-end ast-slop/copy-paste-signature
