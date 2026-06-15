// ── Markdown Broken Link Rule ─────────────────────────────
// Links with empty or # URLs.

import type { Diagnostic } from '../../../types/index.js'
import { makeDiagnostic } from '../shared.js'

export function detectMdBrokenLink(
  content: string,
  lines: { num: number; text: string }[],
  filePath: string,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = []
  const linkPattern = /\[([^\]]*)\]\(([^)]*)\)/g

  for (const { num, text } of lines) {
    linkPattern.lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = linkPattern.exec(text)) !== null) {
      const linkText = match[1]
      const url = match[2].trim()

      if (url === '' || url === '#') {
        diagnostics.push(
          makeDiagnostic({
            filePath,
            rule: 'md/broken-link',
            message: `Link "${linkText}" has ${url === '' ? 'empty' : 'placeholder (#)'} URL`,
            line: num,
            column: match.index + 1,
            severity: 'warning',
            category: 'syntax',
            help: 'Add the correct URL for this link, or remove the link if not needed',
            fixable: false,
            detail: { linkText, url },
          }),
        )
      }
    }
  }

  return diagnostics
}
