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

// ── Quality Gate Baseline ─────────────────────────────
// Capture and compare score baselines for quality gate

import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { BaselineData } from './types.js'

/** Directory for deep-slop metadata */
const DEEP_SLOP_DIR = '.deep-slop'

/** Baseline file name */
const BASELINE_FILE = 'baseline.json'

/**
 * Capture a quality gate baseline score.
 *
 * Writes .deep-slop/baseline.json with the score, timestamp,
 * and diagnostic summary.
 */
export function captureBaseline(rootDir: string, score: number, diagnostics?: { total: number; errors: number; warnings: number }): void {
  const dir = join(rootDir, DEEP_SLOP_DIR)
  const filePath = join(dir, BASELINE_FILE)

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }

  const data: BaselineData = {
    score,
    timestamp: new Date().toISOString(),
    diagnostics: diagnostics ?? { total: 0, errors: 0, warnings: 0 },
  }

  writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf-8')
}

/**
 * Read the captured baseline score.
 *
 * Returns the baseline data or null if no baseline has been captured.
 */
export function readBaseline(rootDir: string): BaselineData | null {
  const filePath = join(rootDir, DEEP_SLOP_DIR, BASELINE_FILE)

  if (!existsSync(filePath)) {
    return null
  }

  try {
    const content = readFileSync(filePath, 'utf-8')
    return JSON.parse(content) as BaselineData
  } catch {
    return null
  }
}

/**
 * Check if the current score passes the quality gate.
 *
 * Compares the current score against the captured baseline.
 * A score passes if it is >= the baseline score.
 */
export function checkQualityGate(
  rootDir: string,
  currentScore: number,
): { pass: boolean; delta: number; baselineScore: number } {
  const baseline = readBaseline(rootDir)

  if (!baseline) {
    // No baseline — pass by default (first run)
    return { pass: true, delta: 0, baselineScore: 0 }
  }

  const delta = currentScore - baseline.score
  const pass = currentScore >= baseline.score

  return { pass, delta, baselineScore: baseline.score }
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
