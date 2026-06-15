// ── HTML Inline Event Handler Rule ──────────────────────
// Inline event handlers (onclick=, onload=) mix behavior with structure.

import type { Diagnostic } from '../../../types/index.js'
import { makeDiagnostic } from '../shared.js'

export function detectHtmlInlineEventHandler(
  content: string,
  lines: { num: number; text: string }[],
  filePath: string,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = []
  const eventHandlers = [
    'onclick', 'ondblclick', 'onmousedown', 'onmouseup', 'onmouseover',
    'onmousemove', 'onmouseout', 'onkeydown', 'onkeypress', 'onkeyup',
    'onload', 'onunload', 'onfocus', 'onblur', 'onsubmit', 'onreset',
    'onchange', 'onselect', 'oninput', 'onerror', 'onresize', 'onscroll',
  ]
  const handlerPattern = new RegExp(`\\b(${eventHandlers.join('|')})\\s*=`, 'gi')

  for (const { num, text } of lines) {
    handlerPattern.lastIndex = 0
    const match = handlerPattern.exec(text)
    if (match) {
      const handler = match[1].toLowerCase()
      diagnostics.push(
        makeDiagnostic({
          filePath,
          rule: 'html/inline-event-handler',
          message: `Inline event handler ${handler}= ─ mixes behavior with structure (CSP violation risk)`,
          line: num,
          column: match.index + 1,
          severity: 'warning',
          category: 'security',
          help: `Move ${handler} to an external JavaScript file using addEventListener(). Inline handlers violate Content Security Policy.`,
          fixable: false,
          detail: { handler },
        }),
      )
    }
  }

  return diagnostics
}
