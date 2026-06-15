// ── Decorative Comment Rule ──────────────────────────
// Detects decorative separator comments that add visual noise.

import type { Diagnostic } from '../../../types/index.js'
import { diag } from '../shared.js'

const DECORATIVE_PATTERNS = [
  /\/\/\s*[=]{3,}/,
  /\/\/\s*[─━]{3,}/,
  /\/\/\s*[*]{3,}/,
  /\/\/\s*[~]{3,}/,
  /\/\/\s*[-]{3,}\s*$/,
  /#\s*[=]{3,}/,
  /#\s*[─━]{3,}/,
  /#\s*[*]{3,}/,
  /#\s*[~]{3,}/,
  /#\s*[-]{3,}\s*$/,
]

export function detectDecorativeComment(
  lines: { num: number; text: string }[],
  filePath: string,
): Diagnostic[] {
  const results: Diagnostic[] = []
  for (const { num, text } of lines) {
    const trimmed = text.trim()
    for (const pattern of DECORATIVE_PATTERNS) {
      if (pattern.test(trimmed)) {
        const col = text.indexOf(trimmed.charAt(0)) + 1
        results.push(
          diag({
            filePath,
            rule: 'ast-slop/decorative-comment',
            severity: 'info',
            message: 'Decorative comment block — visual noise typical of AI-generated code',
            help: 'Remove decorative separators. Use blank lines to separate logical sections instead.',
            line: num,
            column: col,
            fixable: true,
            suggestion: {
              type: 'delete',
              text: '',
              range: { startLine: num, startCol: 1, endLine: num, endCol: text.length + 1 },
              confidence: 0.9,
              reason: 'Decorative comment lines add visual clutter without conveying information.',
            },
          }),
        )
        break
      }
    }
  }
  return results
}
