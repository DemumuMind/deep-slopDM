// ── HTML Missing Alt Rule ─────────────────────────────
// <img> tags without alt attribute.

import type { Diagnostic } from '../../../types/index.js'
import { makeDiagnostic } from '../shared.js'

export function detectHtmlMissingAlt(
  content: string,
  lines: { num: number; text: string }[],
  filePath: string,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = []

  for (const { num, text } of lines) {
    const imgPattern = /<img\b[^>]*>/gi
    let match: RegExpExecArray | null
    imgPattern.lastIndex = 0
    while ((match = imgPattern.exec(text)) !== null) {
      const imgTag = match[0]
      if (!/\balt\s*=/i.test(imgTag)) {
        diagnostics.push(
          makeDiagnostic({
            filePath,
            rule: 'html/missing-alt',
            message: '<img> tag missing alt attribute — accessibility violation (WCAG 1.1.1)',
            line: num,
            column: match.index + 1,
            severity: 'error',
            category: 'style',
            help: 'Add alt="description" for meaningful images, or alt="" for decorative images',
            fixable: true,
            suggestion: {
              type: 'insert',
              text: ' alt=""',
              confidence: 0.7,
              reason: 'Missing alt attributes fail WCAG 1.1.1 and are inaccessible to screen readers',
            },
          }),
        )
      }
    }
  }

  return diagnostics
}
