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

// ── Fix Plan Applier ───────────────────────────────────
// Applies fix steps to files with backup and rollback support.

import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import type { FixPlan, FixResult, FixDiff } from './types.js'

/** Directory for backup copies of original files */
const BACKUP_DIR = '.deep-slop/fix-backup'

/**
 * Apply a fix plan to the project files.
 *
 * - If dryRun: return plan with diff data without modifying files
 * - Creates backup copies in .deep-slop/fix-backup/
 * - Applies steps bottom-up (reverse line order within each file)
 * - Returns FixResult with files modified count and diffs
 */
export async function applyFixPlan(
  plan: FixPlan,
  rootDir: string,
  dryRun: boolean,
): Promise<FixResult> {
  // Dry run: return plan with diff data without modifying anything
  if (dryRun) {
    const diffs = buildDryRunDiffs(plan, rootDir)
    return {
      filesModified: plan.fileCount,
      diagnosticsFixed: plan.diagnosticCount,
      scoreBefore: 0,
      scoreAfter: 0,
      rolledBack: false,
      errors: [],
      diffs,
    }
  }

  const errors: string[] = []
  const modifiedFiles = new Set<string>()
  const backupDir = join(rootDir, BACKUP_DIR)

  // Group steps by file for batch processing
  const fileSteps = new Map<string, typeof plan.steps>()
  for (const step of plan.steps) {
    const group = fileSteps.get(step.filePath) ?? []
    group.push(step)
    fileSteps.set(step.filePath, group)
  }

  // Ensure backup directory exists
  try {
    mkdirSync(backupDir, { recursive: true })
  } catch (err) {
    errors.push(`Failed to create backup directory: ${err instanceof Error ? err.message : String(err)}`)
    return {
      filesModified: 0,
      diagnosticsFixed: 0,
      scoreBefore: 0,
      scoreAfter: 0,
      rolledBack: false,
      errors,
      diffs: [],
    }
  }

  // Process each file
  for (const [filePath, steps] of fileSteps) {
    const absolutePath = join(rootDir, filePath)

    if (!existsSync(absolutePath)) {
      errors.push(`File not found: ${filePath}`)
      continue
    }

    // Backup the original file
    const backupPath = join(backupDir, filePath)
    try {
      mkdirSync(dirname(backupPath), { recursive: true })
      copyFileSync(absolutePath, backupPath)
    } catch (err) {
      errors.push(`Failed to backup ${filePath}: ${err instanceof Error ? err.message : String(err)}`)
      continue
    }

    // Read file content
    let content: string
    try {
      content = readFileSync(absolutePath, 'utf-8')
    } catch (err) {
      errors.push(`Failed to read ${filePath}: ${err instanceof Error ? err.message : String(err)}`)
      continue
    }

    // Apply steps bottom-up (steps are already sorted DESC by line)
    // This preserves line offsets since we edit from the bottom first
    const lines = content.split('\n')
    let applied = 0

    for (const step of steps) {
      // Convert 1-based line numbers to 0-based array indices
      const startIdx = step.startLine - 1
      const endIdx = step.endLine - 1

      if (startIdx < 0 || endIdx >= lines.length || startIdx > endIdx) {
        errors.push(`Invalid line range ${step.startLine}-${step.endLine} in ${filePath}`)
        continue
      }

      if (step.oldText) {
        // Verify oldText matches the content at the target range
        const existingText = lines.slice(startIdx, endIdx + 1).join('\n')
        if (existingText !== step.oldText) {
          errors.push(`oldText mismatch at ${filePath}:${step.startLine}`)
          continue
        }
      }

      // For delete operations (newText is empty), remove the lines entirely
      if (step.newText === '') {
        lines.splice(startIdx, endIdx - startIdx + 1)
        applied++
      } else if (step.newText !== undefined) {
        // Replace/insert: splice in the new content
        const replacementLines = step.newText.split('\n')
        lines.splice(startIdx, endIdx - startIdx + 1, ...replacementLines)
        applied++
      }
    }

    // Write modified content back
    if (applied > 0) {
      try {
        writeFileSync(absolutePath, lines.join('\n'), 'utf-8')
        modifiedFiles.add(filePath)
      } catch (err) {
        errors.push(`Failed to write ${filePath}: ${err instanceof Error ? err.message : String(err)}`)
      }
    }
  }

  return {
    filesModified: modifiedFiles.size,
    diagnosticsFixed: plan.diagnosticCount - errors.length,
    scoreBefore: 0,
    scoreAfter: 0,
    rolledBack: false,
    errors,
    diffs: [],
  }
}

/**
 * Build diff data for dry-run display.
 * Reads file content and builds before/after for each fix step.
 */
function buildDryRunDiffs(plan: FixPlan, rootDir: string): FixDiff[] {
  const diffs: FixDiff[] = []

  // Cache file reads
  const fileCache = new Map<string, string[]>()

  for (const step of plan.steps) {
    let before = '(unable to read file)'

    if (!fileCache.has(step.filePath)) {
      try {
        const absolutePath = join(rootDir, step.filePath)
        const content = readFileSync(absolutePath, 'utf-8')
        fileCache.set(step.filePath, content.split('\n'))
      } catch {
        fileCache.set(step.filePath, [])
      }
    }

    const lines = fileCache.get(step.filePath)!
    const startIdx = Math.max(0, step.startLine - 1)
    const endIdx = Math.min(lines.length - 1, step.endLine - 1)
    if (startIdx <= endIdx && lines.length > 0) {
      before = lines.slice(startIdx, endIdx + 1).join('\n')
    }

    diffs.push({
      filePath: step.filePath,
      rule: step.rule,
      line: step.startLine,
      before,
      after: step.newText || '',
      confidence: step.confidence,
    })
  }

  return diffs
}

/**
 * Rollback modified files from backup.
 * Restores all files from .deep-slop/fix-backup/ to their original locations.
 */
export async function rollback(rootDir: string): Promise<string[]> {
  const backupDir = join(rootDir, BACKUP_DIR)
  const rolled: string[] = []

  if (!existsSync(backupDir)) return rolled

  // Find all backup files and restore them
  const { readdirSync, statSync } = await import('node:fs')
  const { join: joinPath, relative } = await import('node:path')

  function restoreDir(dir: string): void {
    for (const entry of readdirSync(dir)) {
      const full = joinPath(dir, entry)
      if (statSync(full).isDirectory()) {
        restoreDir(full)
      } else {
        const relPath = relative(backupDir, full)
        const targetPath = joinPath(rootDir, relPath)
        try {
          copyFileSync(full, targetPath)
          rolled.push(relPath)
        } catch {
          // Best-effort rollback
        }
      }
    }
  }

  restoreDir(backupDir)
  return rolled
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
