// ── Defensive typeof Rule ──────────────────────────
// Detects unnecessary typeof === 'undefined' checks in TypeScript.

import type { Diagnostic, Language } from '../../../types/index.js'
import { diag } from '../shared.js'

export function detectDefensiveTypeof(
  lines: { num: number; text: string }[],
  filePath: string,
  language: Language,
): Diagnostic[] {
  const results: Diagnostic[] = []
  if (language !== 'typescript') return results

  for (const { num, text } of lines) {
    const trimmed = text.trim()
    const typeofMatch = trimmed.match(/typeof\s+(\w+)\s*===?\s*['"]undefined['"]/)
    if (typeofMatch) {
      const col = text.indexOf('typeof') + 1
      results.push(
        diag({
          filePath,
          rule: 'ast-slop/defensive-typeof',
          severity: 'info',
          message: `typeof ${typeofMatch[1]} === 'undefined' — unnecessary in TypeScript; use optional chaining or type guards instead`,
          help: 'In TypeScript, variables are type-checked at compile time. Use optional chaining (?.), type narrowing, or explicit null checks instead of runtime typeof guards for declared variables.',
          line: num,
          column: col,
          fixable: true,
          suggestion: {
            type: 'refactor',
            text: `${typeofMatch[1]} != null`,
            confidence: 0.6,
            reason: 'Replace typeof undefined check with a simpler null check when the variable is already typed.',
          },
        }),
      )
    }
  }
  return results
}
