// ── CSS !important Overuse Rule ──────────────────────────────
// More than 3 !important declarations in one file.

import type { Diagnostic } from '../../../types/index.js'
import { makeDiagnostic } from '../shared.js'

export function detectCssImportantOveruse(
  content: string,
  lines: { num: number; text: string }[],
  filePath: string,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = []
  const MAX_IMPORTANT = 3
  const importantLines: { num: number }[] = []

  for (const { num, text } of lines) {
    if (/!important\b/i.test(text)) {
      importantLines.push({ num })
    }
  }

  if (importantLines.length > MAX_IMPORTANT) {
    diagnostics.push(
      makeDiagnostic({
        filePath,
        rule: 'css/important-overuse',
        message: `${importantLines.length} !important declarations in file — exceeds max of ${MAX_IMPORTANT}`,
        line: importantLines[0].num,
        severity: 'warning',
        category: 'style',
        help: 'Reduce !important usage by increasing selector specificity instead. Overuse indicates specificity conflicts.',
        fixable: false,
        detail: { count: importantLines.length, max: MAX_IMPORTANT },
      }),
    )
  }

  return diagnostics
}
