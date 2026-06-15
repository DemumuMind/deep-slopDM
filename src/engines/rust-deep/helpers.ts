// ── Rust Deep Engine Helpers ──────────────────────────────
// Regex-based analysis of Rust code for common AI slop / quality issues.
// Falls back to regex only; tree-sitter Rust parser is available via
// src/utils/tree-sitter/ but is not required for this engine.

import { readdir } from 'node:fs/promises'
import { join, relative, extname } from 'node:path'
import type {
  Diagnostic,
  Severity,
  Suggestion,
} from '../../types/index.js'

// ── Helpers ──────────────────────────────────────────────

export const RUST_EXTENSIONS = new Set(['.rs'])

export function isRustFile(filePath: string): boolean {
  return RUST_EXTENSIONS.has(extname(filePath).toLowerCase())
}

/** Recursively collect .rs files under root, respecting excludes */
export async function collectRustFiles(
  root: string,
  exclude: string[],
): Promise<string[]> {
  const results: string[] = []

  async function walk(dir: string): Promise<void> {
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const full = join(dir, entry.name)
      if (exclude.some((pat) => full.includes(pat))) continue
      if (entry.isDirectory()) {
        await walk(full)
      } else if (entry.isFile() && isRustFile(full)) {
        results.push(full)
      }
    }
  }

  await walk(root)
  return results
}

export function relativePath(root: string, filePath: string): string {
  return relative(root, filePath).replace(/\\/g, '/')
}

export function makeDiagnostic(
  filePath: string,
  rule: string,
  severity: Severity,
  message: string,
  help: string,
  line: number,
  column: number,
  opts?: {
    fixable?: boolean
    suggestion?: Suggestion
    detail?: Record<string, unknown>
  },
): Diagnostic {
  return {
    filePath,
    engine: 'rust-deep' as const,
    rule,
    severity,
    message,
    help,
    line,
    column,
    category: 'syntax' as const,
    fixable: opts?.fixable ?? false,
    suggestion: opts?.suggestion,
    detail: opts?.detail,
  }
}

// ── Comment / string helpers ───────────────────────────────

/**
 * Track whether a line is inside a block comment (`/* ... *\/`).
 * Returns { skip, inBlockComment } — skip means the line is entirely
 * comment and should be ignored for pattern matching.
 */
export function checkCommentState(
  text: string,
  inBlockComment: boolean,
): { skip: boolean; inBlockComment: boolean } {
  if (inBlockComment) {
    const closeIdx = text.indexOf('*/')
    if (closeIdx === -1) return { skip: true, inBlockComment: true }
    const afterClose = text.substring(closeIdx + 2)
    const reopenIdx = afterClose.indexOf('/*')
    if (reopenIdx !== -1) {
      const recloseIdx = afterClose.indexOf('*/', reopenIdx + 2)
      return { skip: true, inBlockComment: recloseIdx === -1 }
    }
    return { skip: true, inBlockComment: false }
  }

  const trimmed = text.trim()
  if (trimmed.startsWith('//')) return { skip: true, inBlockComment: false }
  if (trimmed.startsWith('/*')) {
    const closeIdx = text.indexOf('*/', text.indexOf('/*') + 2)
    return { skip: true, inBlockComment: closeIdx === -1 }
  }

  // Mid-line block comment opener
  const openIdx = text.indexOf('/*')
  if (openIdx !== -1) {
    const afterOpen = text.substring(openIdx + 2)
    const closeIdx = afterOpen.indexOf('*/')
    return { skip: false, inBlockComment: closeIdx === -1 }
  }

  return { skip: false, inBlockComment: false }
}

/**
 * Returns true when `matchStart` falls inside a string literal.
 * Heuristic: count unescaped single/double quotes before matchStart.
 */
export function isInsideString(text: string, matchStart: number): boolean {
  let sq = 0
  let dq = 0
  let raw = false
  for (let i = 0; i < matchStart; i++) {
    const ch = text[i]
    const prev = i > 0 ? text[i - 1] : ''
    if (ch === 'r' && i + 1 < matchStart && text[i + 1] === '"') {
      raw = true
      continue
    }
    if (raw && ch === '"') {
      // Find matching raw string end
      const end = text.indexOf('"', i + 1)
      if (end !== -1 && end < matchStart) {
        i = end
        continue
      }
      raw = false
      continue
    }
    if (prev !== '\\') {
      if (ch === "'") sq++
      else if (ch === '"') dq++
    }
  }
  return sq % 2 === 1 || dq % 2 === 1
}

export function isTestFile(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, '/')
  if (normalized.endsWith('.test.rs') || normalized.endsWith('_test.rs')) return true
  if (normalized.endsWith('.rs') && (normalized.includes('/tests/') || normalized.includes('/test/'))) return true
  return false
}

export function isInsideMacroOrString(text: string, matchStart: number): boolean {
  return isInsideString(text, matchStart)
}
