// ── Dead-Flow Shared Helpers ──────────────────────────────────────────
// Common utilities and diagnostic factory used by all dead-flow rule detectors.

import type { Diagnostic } from '../../types/index.js'
import micromatch from 'micromatch'

export const TS_JS_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
])

export function isRelevantFile(filePath: string): boolean {
  const ext = filePath.slice(filePath.lastIndexOf('.'))
  return TS_JS_EXTENSIONS.has(ext)
}

/** Check if a file path matches any of the ignore patterns. */
export function isIgnoredFile(filePath: string, ignorePatterns: string[] = []): boolean {
  if (ignorePatterns.length === 0) return false
  return micromatch.isMatch(filePath, ignorePatterns)
}

/** Check if a trimmed line is just a closing brace (with optional trailing punctuation) */
export function isClosingBraceLine(trimmed: string): boolean {
  return /^\}[;,)\s]*$/.test(trimmed)
}

/** Escape string for use in RegExp */
export function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Make a diagnostic with sensible defaults */
export function makeDiagnostic(
  overrides: Partial<Diagnostic> & Pick<Diagnostic, 'filePath' | 'rule' | 'message' | 'line'>,
): Diagnostic {
  return {
    engine: 'dead-flow',
    severity: 'warning',
    column: 1,
    category: 'dead-code',
    fixable: true,
    help: '',
    ...overrides,
  }
}
