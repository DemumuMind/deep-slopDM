// ── Markdown Missing Fenced Language Rule ────────────────
// Fenced code blocks without language specification.

import type { Diagnostic } from '../../../types/index.js'
import { makeDiagnostic } from '../shared.js'

export function detectMdMissingFencedLang(
  content: string,
  lines: { num: number; text: string }[],
  filePath: string,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = []

  for (const { num, text } of lines) {
    const trimmed = text.trim()
    if (/^```+\s*$/.test(trimmed) || /^~~~+\s*$/.test(trimmed)) {
      diagnostics.push(
        makeDiagnostic({
          filePath,
          rule: 'md/missing-fenced-lang',
          message: 'Fenced code block without language specification ─ disables syntax highlighting',
          line: num,
          severity: 'suggestion',
          category: 'style',
          help: 'Add a language identifier after the fence: ```typescript, ```python, ```bash, etc.',
          fixable: true,
          suggestion: {
            type: 'replace',
            text: trimmed.replace(/^(```+|~~~+)/, '$1text'),
            confidence: 0.6,
            reason: 'Language-specific syntax highlighting improves readability of code blocks',
          },
        }),
      )
    }
  }

  return diagnostics
}
