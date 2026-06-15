// ── TODO Stub Rule ─────────────────────────────
// Detects TODO/FIXME/HACK/XXX comments without a ticket or assignee.

import type { Diagnostic, Language } from '../../../types/index.js'
import { diag } from '../shared.js'

const TODO_PATTERNS = [
  /\bTODO\b/i,
  /\bFIXME\b/i,
  /\bHACK\b/i,
  /\bXXX\b/i,
]

export function detectTodoStub(
  lines: { num: number; text: string }[],
  filePath: string,
  language: Language,
): Diagnostic[] {
  const results: Diagnostic[] = []
  const commentPrefix = language === 'python' ? '#' : '//'

  for (const { num, text } of lines) {
    const trimmed = text.trim()
    const isComment = trimmed.startsWith(commentPrefix) || trimmed.startsWith('/*') || trimmed.startsWith('*')
    if (!isComment) continue

    for (const pattern of TODO_PATTERNS) {
      if (pattern.test(trimmed)) {
        const col = text.indexOf(trimmed.charAt(0)) + 1
        const tag = trimmed.match(/\b(TODO|FIXME|HACK|XXX)\b/i)?.[1] ?? 'TODO'
        const hasFollowUp = /(?:#\d+|@[a-zA-Z0-9_-]+|\(\d{4}-\d{2}-\d{2}\)|https?:\/\/)/.test(trimmed)

        if (!hasFollowUp) {
          results.push(
            diag({
              filePath,
              rule: 'ast-slop/todo-stub',
              severity: 'info',
              message: `${tag} comment without ticket reference or assignee — likely a stub`,
              help: 'Add a ticket/issue number (e.g. TODO(#123)) or assignee (e.g. TODO(@dev)), or replace with a concrete implementation stub.',
              line: num,
              column: col,
              fixable: true,
              suggestion: {
                type: 'replace',
                text: `${text.trimStart().replace(/\b(TODO|FIXME|HACK|XXX)\b/i, `${tag}(#123)`)} — implement actual logic here`,
                range: {
                  startLine: num,
                  startCol: 1,
                  endLine: num,
                  endCol: text.length + 1,
                },
                confidence: 0.9,
                reason: 'TODO comments without a ticket reference are unactionable stubs. Adding a reference or a concrete implementation stub makes the debt trackable.',
              },
              detail: { tag },
            }),
          )
        }
        break
      }
    }
  }
  return results
}
