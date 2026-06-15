// ── HTML Deprecated Tag Rule ───────────────────────────
// Deprecated HTML tags (font, center, marquee, blink, etc.).

import type { Diagnostic } from '../../../types/index.js'
import { makeDiagnostic } from '../shared.js'

export function detectHtmlDeprecatedTag(
  content: string,
  lines: { num: number; text: string }[],
  filePath: string,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = []
  const deprecatedTags = ['font', 'center', 'marquee', 'blink', 'big', 'strike', 'tt', 'frame', 'frameset', 'noframes']
  const tagPattern = new RegExp(`<(${deprecatedTags.join('|')})\\b`, 'gi')

  for (const { num, text } of lines) {
    tagPattern.lastIndex = 0
    const match = tagPattern.exec(text)
    if (match) {
      const tag = match[1].toLowerCase()
      diagnostics.push(
        makeDiagnostic({
          filePath,
          rule: 'html/deprecated-tag',
          message: `Deprecated HTML tag <${tag}> — removed from HTML5 spec`,
          line: num,
          column: match.index + 1,
          severity: 'warning',
          category: 'syntax',
          help: `Replace <${tag}> with CSS or semantic HTML. Use <span> with CSS for styling, <div> with text-align for centering.`,
          fixable: false,
          detail: { tag },
        }),
      )
    }
  }

  return diagnostics
}
