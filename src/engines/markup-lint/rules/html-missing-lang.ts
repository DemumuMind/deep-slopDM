// ── HTML Missing Lang Rule ───────────────────────────────
// <html> tag without lang attribute.

import type { Diagnostic } from '../../../types/index.js'
import { makeDiagnostic } from '../shared.js'

export function detectHtmlMissingLang(
  content: string,
  lines: { num: number; text: string }[],
  filePath: string,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = []

  for (const { num, text } of lines) {
    const htmlPattern = /<html\b[^>]*>/gi
    let match: RegExpExecArray | null
    htmlPattern.lastIndex = 0
    while ((match = htmlPattern.exec(text)) !== null) {
      const htmlTag = match[0]
      if (!/\blang\s*=/i.test(htmlTag)) {
        diagnostics.push(
          makeDiagnostic({
            filePath,
            rule: 'html/missing-lang',
            message: '<html> tag missing lang attribute — accessibility issue (WCAG 3.1.1)',
            line: num,
            column: match.index + 1,
            severity: 'warning',
            category: 'style',
            help: 'Add lang="en" (or appropriate language code) to the <html> tag',
            fixable: true,
            suggestion: {
              type: 'insert',
              text: ' lang="en"',
              confidence: 0.7,
              reason: 'Missing lang attribute fails WCAG 3.1.1 and hinders screen readers and search engines',
            },
          }),
        )
      }
    }
  }

  return diagnostics
}
