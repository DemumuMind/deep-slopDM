// ── Markdown Inconsistent Heading Rule ──────────────────
// Mixed heading styles (ATX # vs Setext ===/---).

import type { Diagnostic } from '../../../types/index.js'
import { makeDiagnostic } from '../shared.js'

export function detectMdInconsistentHeading(
  content: string,
  lines: { num: number; text: string }[],
  filePath: string,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = []

  let atxHeadings = 0
  let setextHeadings = 0

  for (let i = 0; i < lines.length; i++) {
    const { num, text } = lines[i]
    const trimmed = text.trim()

    if (/^#{1,6}\s/.test(trimmed)) {
      atxHeadings++
    }

    if (i + 1 < lines.length) {
      const nextTrimmed = lines[i + 1].text.trim()
      if (/^=+\s*$/.test(nextTrimmed) || /^-+\s*$/.test(nextTrimmed)) {
        setextHeadings++
      }
    }
  }

  if (atxHeadings > 0 && setextHeadings > 0) {
    for (let i = 0; i < lines.length; i++) {
      const { num, text } = lines[i]
      if (i + 1 < lines.length) {
        const nextTrimmed = lines[i + 1].text.trim()
        if (/^=+\s*$/.test(nextTrimmed) || /^-+\s*$/.test(nextTrimmed)) {
          diagnostics.push(
            makeDiagnostic({
              filePath,
              rule: 'md/inconsistent-heading',
              message: 'Mixed heading styles (ATX # and Setext ===/---) ─ use one style consistently',
              line: num,
              severity: 'info',
              category: 'style',
              help: 'Pick one heading style: ATX (# ) is more common and supports all heading levels',
              fixable: false,
              detail: { atxHeadings, setextHeadings },
            }),
          )
          break
        }
      }
    }
  }

  return diagnostics
}
