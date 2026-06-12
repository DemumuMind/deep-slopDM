// ── Fix Plan Generator ─────────────────────────────────
// Groups fixable diagnostics by file, orders bottom-up,
// and filters by confidence based on mode.

import type { Diagnostic } from '../types/index.js'
import type { FixPlan, FixStep } from './types.js'

/** Minimum confidence for 'safe' mode */
const SAFE_CONFIDENCE_THRESHOLD = 0.8

/**
 * Generate a fix plan from a list of diagnostics.
 *
 * - Groups fixable diagnostics by file
 * - Orders steps by line number DESC (bottom-up to preserve offsets)
 * - 'safe' mode: only includes diagnostics with suggestion.confidence >= 0.8
 * - 'force' mode: includes all fixable diagnostics
 */
export function generateFixPlan(
  diagnostics: Diagnostic[],
  mode: 'safe' | 'force',
): FixPlan {
  // Filter to fixable diagnostics with suggestions
  const fixable = diagnostics.filter((d) => {
    if (!d.fixable || !d.suggestion) return false
    if (mode === 'safe' && d.suggestion.confidence < SAFE_CONFIDENCE_THRESHOLD) {
      return false
    }
    return true
  })

  // Build fix steps from diagnostics
  const steps: FixStep[] = fixable.map((d) => {
    const suggestion = d.suggestion!
    const range = suggestion.range

    // Determine line range from suggestion or fallback to diagnostic line
    const startLine = range?.startLine ?? d.line
    const endLine = range?.endLine ?? d.line

    // Derive oldText / newText based on suggestion type
    let oldText = ''
    let newText = suggestion.text

    switch (suggestion.type) {
      case 'replace':
        // oldText will be read from file at apply time; placeholder here
        oldText = ''
        break
      case 'insert':
        oldText = ''
        break
      case 'delete':
        // newText is empty for deletions; oldText from file at apply time
        oldText = ''
        newText = ''
        break
      case 'refactor':
        // Refactor suggestions are manual; skip from auto-fix
        return null as unknown as FixStep
      default:
        oldText = ''
    }

    return {
      filePath: d.filePath,
      startLine,
      endLine,
      oldText,
      newText,
      rule: d.rule,
      confidence: suggestion.confidence,
    }
  }).filter((step): step is FixStep => step !== null)

  // Group by file, then sort each group by line number DESC (bottom-up)
  const fileGroups = new Map<string, FixStep[]>()
  for (const step of steps) {
    const group = fileGroups.get(step.filePath) ?? []
    group.push(step)
    fileGroups.set(step.filePath, group)
  }

  // Sort each group bottom-up (highest line first)
  const sortedSteps: FixStep[] = []
  for (const groupSteps of fileGroups.values()) {
    groupSteps.sort((a, b) => b.startLine - a.startLine)
    sortedSteps.push(...groupSteps)
  }

  // Count distinct files
  const fileCount = fileGroups.size

  return {
    steps: sortedSteps,
    fileCount,
    diagnosticCount: fixable.length,
  }
}
