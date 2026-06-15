// ── CSS Universal Selector Rule ─────────────────────────
// Universal selector * used (performance impact on large DOMs).

import type { Diagnostic } from '../../../types/index.js'
import { makeDiagnostic } from '../shared.js'

export function detectCssUniversalSelector(
  content: string,
  lines: { num: number; text: string }[],
  filePath: string,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = []
  let reported = 0

  for (const { num, text } of lines) {
    const trimmed = text.trim()
    if (/^\*\s*(?:[,:{]|$|::)/.test(trimmed) || /\*\s*:/.test(trimmed)) {
      if (/\*=/.test(trimmed) || trimmed === '*/') continue

      diagnostics.push(
        makeDiagnostic({
          filePath,
          rule: 'css/universal-selector',
          message: 'Universal selector * used — has performance impact on large DOMs',
          line: num,
          severity: 'info',
          category: 'performance',
          help: 'Replace with a more specific selector. Universal selectors force the browser to check every element.',
          fixable: false,
          detail: { selector: '*' },
        }),
      )
      reported++
      if (reported >= 5) break
    }
  }

  return diagnostics
}
