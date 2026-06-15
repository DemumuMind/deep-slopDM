// ── Markdown TODO in Docs Rule ─────────────────────────
// TODO/FIXME/HACK comments in documentation.

import type { Diagnostic } from '../../../types/index.js'
import { makeDiagnostic } from '../shared.js'

export function detectMdTodoInDoc(
  content: string,
  lines: { num: number; text: string }[],
  filePath: string,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = []
  const todoPattern = /\b(TODO|FIXME|HACK|XXX|BUG)\b/gi
  let reported = 0

  for (const { num, text } of lines) {
    todoPattern.lastIndex = 0
    const match = todoPattern.exec(text)
    if (match) {
      const marker = match[1].toUpperCase()
      diagnostics.push(
        makeDiagnostic({
          filePath,
          rule: 'md/todo-in-doc',
          message: `${marker} marker found in documentation — resolve or track in issue tracker`,
          line: num,
          column: match.index + 1,
          severity: 'info',
          category: 'dead-code',
          help: 'Create a tracking issue for this TODO/FIXME and reference it in the document, or resolve it',
          fixable: false,
          detail: { marker },
        }),
      )
      reported++
      if (reported >= 10) break
    }
  }

  return diagnostics
}
