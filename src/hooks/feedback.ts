// ── Hook Feedback ───────────────────────────────────────
// Format agent-friendly feedback comparing before/after scan results

import type { ScanResult, Diagnostic } from '../types/index.js'

/**
 * Format hook feedback as agent-friendly plain text.
 *
 * Shows score delta, fixed count, new issues, and remaining count.
 * Designed for AI agents to understand the impact of their edit.
 */
export function formatHookFeedback(before: ScanResult, after: ScanResult): string {
  const lines: string[] = []

  // Score delta
  const beforeScore = before.score ?? 0
  const afterScore = after.score ?? 0
  const scoreDelta = afterScore - beforeScore
  const scoreSign = scoreDelta > 0 ? '+' : ''
  lines.push(`Score: ${before.score ?? '—'} → ${after.score ?? '—'} (${scoreSign}${scoreDelta})`)

  // Fixed count — diagnostics that were in before but not in after
  const beforeDiags = collectDiagKeys(before)
  const afterDiags = collectDiagKeys(after)
  const fixedCount = beforeDiags.size - intersectionSize(beforeDiags, afterDiags)
  if (fixedCount > 0) {
    lines.push(`${fixedCount} issue${fixedCount === 1 ? '' : 's'} resolved`)
  }

  // New issues — diagnostics in after but not in before
  const newCount = afterDiags.size - intersectionSize(beforeDiags, afterDiags)
  if (newCount > 0) {
    lines.push(`${newCount} new warning${newCount === 1 ? '' : 's'} introduced`)
  }

  // Remaining
  const remaining = after.totalDiagnostics
  lines.push(`${remaining} issue${remaining === 1 ? '' : 's'} remaining`)

  return lines.join('\n')
}

/** Collect a set of unique diagnostic identifiers from a scan result */
function collectDiagKeys(result: ScanResult): Set<string> {
  const keys = new Set<string>()
  for (const engine of result.engines) {
    for (const diag of engine.diagnostics) {
      keys.add(`${diag.filePath}:${diag.line}:${diag.rule}`)
    }
  }
  return keys
}

/** Count the intersection size of two sets */
function intersectionSize(a: Set<string>, b: Set<string>): number {
  let count = 0
  a.forEach((key) => {
    if (b.has(key)) count++
  })
  return count
}

