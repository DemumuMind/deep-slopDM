// ── YAML Tab Indent Rule ───────────────────────────────
// Tabs used for indentation (YAML requires spaces).

import type { Diagnostic } from '../../../types/index.js'
import { makeDiagnostic } from '../shared.js'

export function detectYamlTabIndent(
  content: string,
  lines: { num: number; text: string }[],
  filePath: string,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = []
  let reported = 0

  for (const { num, text } of lines) {
    if (/^\t/.test(text)) {
      diagnostics.push(
        makeDiagnostic({
          filePath,
          rule: 'yaml/tab-indent',
          message: 'Tab character used for indentation — YAML requires spaces',
          line: num,
          severity: 'error',
          category: 'syntax',
          help: 'Replace tabs with spaces. YAML spec requires space indentation for structure.',
          fixable: true,
          suggestion: {
            type: 'replace',
            text: text.replace(/^\t+/, (match) => '  '.repeat(match.length)),
            confidence: 0.9,
            reason: 'YAML parsers reject tab indentation; spaces are required per the specification',
          },
        }),
      )
      reported++
      if (reported >= 10) break
    }
  }

  return diagnostics
}
