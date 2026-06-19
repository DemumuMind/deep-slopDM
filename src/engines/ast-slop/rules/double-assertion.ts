// ── Double Assertion Rule ──────────────────────────
// Detects `as unknown as X` double assertions that bypass type safety.

import type { Diagnostic } from '../../../types/index.js'
import { diag } from '../shared.js'

const RULES_DIR_PATTERN = /\/engines\/[^/]+\/rules\//

export function detectDoubleAssertion(
  lines: { num: number; text: string }[],
  filePath: string,
): Diagnostic[] {
  const results: Diagnostic[] = []

  if (filePath.includes('src/utils/pattern-docs.ts')) return results
  if (RULES_DIR_PATTERN.test(filePath)) return results

  for (const { num, text } of lines) {
    const trimmed = text.trim()
    const doubleMatch = trimmed.match(/\bas\s+unknown\s+as\s+(\w+)/)
    if (doubleMatch) {
      const col = text.indexOf('as unknown') + 1
      results.push(
        diag({
          filePath,
          rule: 'ast-slop/double-assertion',
          severity: 'warning',
          message: `Double type assertion: as unknown as ${doubleMatch[1]} — bypasses type safety`,
          help: 'Use a proper type guard, type predicate, or adjust the source/target types. Double assertions defeat the purpose of TypeScript.',
          line: num,
          column: col,
          fixable: true,
          suggestion: {
            type: 'refactor',
            text: `as ${doubleMatch[1]}`,
            confidence: 0.5,
            reason: 'Prefer a direct cast with a type guard over bypassing the type system with double assertion.',
          },
        }),
      )
    }
  }
  return results
}
