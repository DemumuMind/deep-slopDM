// ── JSON Inconsistent Spacing Rule ───────────────────
// Mixed compact and expanded object/array formatting.

import type { Diagnostic } from '../../../types/index.js'
import { makeDiagnostic } from '../shared.js'

export function detectJsonInconsistentSpacing(
  content: string,
  lines: { num: number; text: string }[],
  filePath: string,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = []

  let compactLines = 0
  let expandedLines = 0

  for (const { num, text } of lines) {
    const trimmed = text.trim()
    if (/^\s*"[^"]+"\s*:\s*[^,]+,\s*"[^"]+"\s*:/.test(trimmed)) {
      compactLines++
    }
    if (/^\s*"[^"]+"\s*:\s*[^,]+\s*,?\s*$/.test(trimmed) && !trimmed.includes('},')) {
      expandedLines++
    }
  }

  if (compactLines > 0 && expandedLines > 0 && compactLines >= 2 && expandedLines >= 2) {
    for (const { num, text } of lines) {
      if (/^\s*"[^"]+"\s*:\s*[^,]+,\s*"[^"]+"\s*:/.test(text.trim())) {
        diagnostics.push(
          makeDiagnostic({
            filePath,
            rule: 'json/inconsistent-spacing',
            message: 'Mixed compact and expanded object formatting in same file',
            line: num,
            severity: 'info',
            category: 'style',
            help: 'Pick one style: either compact single-line objects or expanded multi-line formatting',
            fixable: false,
            detail: { compactLines, expandedLines },
          }),
        )
        break
      }
    }
  }

  return diagnostics
}
