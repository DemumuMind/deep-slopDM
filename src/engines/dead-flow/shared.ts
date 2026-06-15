// ── Dead-Flow Shared Helpers ──────────────────────────────────────────
// Common utilities and diagnostic factory used by all dead-flow rule detectors.

import type { Diagnostic, Suggestion } from '../../types/index.js'

export const TS_JS_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
])

export function isRelevantFile(filePath: string): boolean {
  const ext = filePath.slice(filePath.lastIndexOf('.'))
  return TS_JS_EXTENSIONS.has(ext)
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

export function buildDeleteSuggestion(
  line: number,
  text: string,
  reason: string,
  confidence = 0.9,
): Suggestion {
  return {
    type: 'delete',
    text: '',
    confidence,
    reason,
    range: {
      startLine: line,
      startCol: 1,
      endLine: line,
      endCol: text.length + 1,
    },
  }
}
