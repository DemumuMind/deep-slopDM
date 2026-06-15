// ── Silent Recovery Rule ───────────────────────────────────────────────
// Detects catch/except blocks that contain only comments, logging nothing.

import type { Diagnostic, Language } from '../../../types/index.js'
import { diag } from '../shared.js'

export function detectSilentRecovery(
  lines: { num: number; text: string }[],
  filePath: string,
  language: Language,
): Diagnostic[] {
  const results: Diagnostic[] = []

  for (let i = 0; i < lines.length; i++) {
    const { num, text } = lines[i]
    const trimmed = text.trim()

    if (language === 'python') {
      const exceptMatch = trimmed.match(/^except\s*(?:\w+(?:\s+as\s+\w+)?)?\s*:/)
      if (exceptMatch) {
        let hasCode = false
        let hasComment = false
        for (let j = i + 1; j < Math.min(i + 8, lines.length); j++) {
          const nextTrimmed = lines[j].text.trim()
          if (nextTrimmed === '') continue
          const currentIndent = lines[j].text.length - lines[j].text.trimStart().length
          const exceptIndent = text.length - text.trimStart().length
          if (currentIndent <= exceptIndent && nextTrimmed.length > 0) break
          if (nextTrimmed.startsWith('#')) {
            hasComment = true
          } else if (nextTrimmed !== 'pass' && nextTrimmed !== '...') {
            hasCode = true
            break
          }
        }
        if (hasComment && !hasCode) {
          const col = text.indexOf('except') + 1
          results.push(
            diag({
              filePath,
              rule: 'ast-slop/silent-recovery',
              severity: 'info',
              message: 'Silent recovery: except block contains only comments — errors are neither logged nor rethrown',
              help: 'At minimum, log the error or rethrow. Comment-only catch blocks silently swallow errors while appearing to handle them.',
              line: num,
              column: col,
              fixable: true,
              suggestion: {
                type: 'insert',
                text: "    logger.error(f'Unexpected error: {e}', exc_info=True)",
                range: { startLine: num + 1, startCol: 1, endLine: num + 1, endCol: 1 },
                confidence: 0.7,
                reason: 'Replace comment-only catch body with error logging to avoid silently hiding failures.',
              },
            }),
          )
        }
      }
    } else {
      const catchStartMatch = trimmed.match(/catch\s*(?:\(\s*(\w+)\s*\))?\s*\{\s*$/)
      if (catchStartMatch) {
        let hasCode = false
        let hasCommentOnly = false
        for (let j = i + 1; j < Math.min(i + 8, lines.length); j++) {
          const nextTrimmed = lines[j].text.trim()
          if (nextTrimmed === '}') {
            if (hasCommentOnly && !hasCode) {
              const col = text.indexOf('catch') + 1
              results.push(
                diag({
                  filePath,
                  rule: 'ast-slop/silent-recovery',
                  severity: 'info',
                  message: 'Silent recovery: catch block contains only comments — errors are neither logged nor rethrown',
                  help: 'At minimum, log the error or rethrow. Comment-only catch blocks silently swallow errors while appearing to handle them.',
                  line: num,
                  column: col,
                  fixable: true,
                  suggestion: {
                    type: 'refactor',
                    text: `catch (${catchStartMatch[1] ?? 'error'}) { console.error(${catchStartMatch[1] ?? 'error'}); }`,
                    confidence: 0.7,
                    reason: 'Replace comment-only catch body with error logging to avoid silently hiding failures.',
                  },
                }),
              )
            }
            break
          }
          if (nextTrimmed === '') continue
          if (nextTrimmed.startsWith('//') || nextTrimmed.startsWith('/*') || nextTrimmed.startsWith('*')) {
            hasCommentOnly = true
          } else {
            hasCode = true
            break
          }
        }
      }
    }
  }
  return results
}
