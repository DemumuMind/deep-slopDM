// ── JSON Deep Nesting Rule ──────────────────────────────
// Objects nested more than 5 levels.

import type { Diagnostic } from '../../../types/index.js'
import { makeDiagnostic } from '../shared.js'

export function detectJsonDeepNesting(
  content: string,
  lines: { num: number; text: string }[],
  filePath: string,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = []
  const MAX_DEPTH = 5
  let depth = 0

  for (const { num, text } of lines) {
    for (const ch of text) {
      if (ch === '{' || ch === '[') {
        depth++
        if (depth > MAX_DEPTH) {
          diagnostics.push(
            makeDiagnostic({
              filePath,
              rule: 'json/deep-nesting',
              message: `JSON nested ${depth} levels deep — exceeds max of ${MAX_DEPTH}`,
              line: num,
              severity: 'warning',
              category: 'architecture',
              help: 'Flatten the structure or extract nested objects into separate files/sections',
              fixable: false,
              detail: { depth, maxDepth: MAX_DEPTH },
            }),
          )
          break
        }
      } else if (ch === '}' || ch === ']') {
        depth--
      }
    }
  }

  return diagnostics
}
