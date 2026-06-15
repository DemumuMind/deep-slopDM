// ── Defensive isinstance Rule ─────────────────────────
// Detects Python isinstance checks that contradict type hints.

import type { Diagnostic, Language } from '../../../types/index.js'
import { diag } from '../shared.js'

export function detectDefensiveIsinstance(
  lines: { num: number; text: string }[],
  filePath: string,
  language: Language,
): Diagnostic[] {
  const results: Diagnostic[] = []
  if (language !== 'python') return results

  for (const { num, text } of lines) {
    const trimmed = text.trim()
    const isinstanceMatch = trimmed.match(/isinstance\s*\(\s*(\w+)\s*,/)
    if (isinstanceMatch && trimmed.includes('type: ignore')) {
      const col = text.indexOf('isinstance') + 1
      results.push(
        diag({
          filePath,
          rule: 'ast-slop/defensive-isinstance',
          severity: 'info',
          message: `Defensive isinstance check for "${isinstanceMatch[1]}" — contradicts type hints`,
          help: 'If the variable has a type annotation, isinstance checks at runtime indicate distrust of the type system. Strengthen the types or use a TypeGuard instead.',
          line: num,
          column: col,
          fixable: false,
        }),
      )
    }
  }
  return results
}
