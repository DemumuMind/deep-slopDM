// ── As Any Rule ──────────────────────────────
// Detects unsafe `as any` casts that opt out of type checking.

import type { Diagnostic } from '../../../types/index.js'
import { diag } from '../shared.js'

export function detectAsAny(
  lines: { num: number; text: string }[],
  filePath: string,
): Diagnostic[] {
  const results: Diagnostic[] = []

  for (const { num, text } of lines) {
    const trimmed = text.trim()
    const asAnyMatch = trimmed.match(/\bas\s+any\b/)
    const doubleMatch = trimmed.match(/\bas\s+unknown\s+as\s+(\w+)/)
    if (asAnyMatch && !doubleMatch) {
      const col = text.indexOf('as any') + 1
      results.push(
        diag({
          filePath,
          rule: 'ast-slop/as-any',
          severity: 'warning',
          message: 'Unsafe cast: as any — opts out of type checking entirely',
          help: 'Replace `as any` with a more specific type, a type guard, or `as unknown as SpecificType` if truly needed (though that has its own issues).',
          line: num,
          column: col,
          fixable: true,
          suggestion: {
            type: 'refactor',
            text: '/* replace with specific type */',
            confidence: 0.4,
            reason: '`as any` disables type checking. Replace with the actual expected type.',
          },
        }),
      )
    }
  }
  return results
}
