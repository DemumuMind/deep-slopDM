// ── Fix Plan Generator ─────────────────────────────────
// Groups fixable diagnostics by file, orders bottom-up,
// and filters by confidence based on mode and rules.

import type { Diagnostic } from '../types/index.js'
import type { FixPlan, FixStep } from './types.js'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/** Minimum confidence for 'safe' mode */
const SAFE_CONFIDENCE_THRESHOLD = 0.8

/**
 * Generate a fix plan from a list of diagnostics.
 *
 * - Filters by --rules if provided
 * - Groups fixable diagnostics by file
 * - Reads file content to populate oldText for accurate diffs
 * - Orders steps by line number DESC (bottom-up to preserve offsets)
 * - 'safe' mode: only includes diagnostics with suggestion.confidence >= 0.8
 * - 'force' mode: includes all fixable diagnostics
 */
export function generateFixPlan(
  diagnostics: Diagnostic[],
  mode: 'safe' | 'force',
  rootDir?: string,
  rules?: string[],
): FixPlan {
  // Filter to fixable diagnostics with suggestions
  let fixable = diagnostics.filter((d) => {
    if (!d.fixable || !d.suggestion) return false
    if (mode === 'safe' && d.suggestion.confidence < SAFE_CONFIDENCE_THRESHOLD) {
      return false
    }
    return true
  })

  // Apply --rule filter if provided
  if (rules && rules.length > 0) {
    const ruleSet = new Set(rules)
    fixable = fixable.filter((d) => ruleSet.has(d.rule))
  }

  // Build file content cache for oldText resolution
  const fileCache = new Map<string, string[]>()
  const getFileLines = (filePath: string): string[] | null => {
    if (fileCache.has(filePath)) return fileCache.get(filePath)!
    if (!rootDir) return null
    try {
      const absolutePath = join(rootDir, filePath)
      const content = readFileSync(absolutePath, 'utf-8')
      const lines = content.split('\n')
      fileCache.set(filePath, lines)
      return lines
    } catch {
      return null
    }
  }

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

    // Read actual file content for oldText when possible
    const fileLines = getFileLines(d.filePath)
    if (fileLines) {
      const startIdx = Math.max(0, startLine - 1)
      const endIdx = Math.min(fileLines.length - 1, endLine - 1)
      if (startIdx <= endIdx && startIdx < fileLines.length) {
        oldText = fileLines.slice(startIdx, endIdx + 1).join('\n')
      }
    }

    switch (suggestion.type) {
      case 'replace':
        // oldText already populated from file; newText from suggestion
        break
      case 'insert':
        // For inserts, oldText is empty, newText is the suggestion
        oldText = ''
        break
      case 'delete':
        // For deletes, oldText is the line content; newText is empty
        newText = ''
        break
      case 'refactor':
        // Refactor suggestions are manual; skip from auto-fix
        return null as unknown as FixStep
      default:
        break
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

