// ── Swallowed Exception Rule ─────────────────────────
// Detects empty catch / except blocks that swallow errors silently.

import type { Diagnostic, Language } from '../../../types/index.js'
import { diag } from '../shared.js'

export function detectSwallowedException(
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
        for (let j = i + 1; j < Math.min(i + 3, lines.length); j++) {
          const nextTrimmed = lines[j].text.trim()
          if (nextTrimmed === 'pass' || nextTrimmed === '...') {
            const col = text.indexOf('except') + 1
            results.push(
              diag({
                filePath,
                rule: 'ast-slop/swallowed-exception',
                severity: 'info',
                message: 'Swallowed exception: except block contains only pass/ellipsis',
                help: "At minimum, log the error. Silently swallowing exceptions hides bugs. Consider: logger.error(f'...: {e}', exc_info=True)",
                line: num,
                column: col,
                fixable: true,
                suggestion: {
                  type: 'insert',
                  text: "    logger.error(f'Unexpected error: {e}', exc_info=True)",
                  range: { startLine: lines[j].num, startCol: 1, endLine: lines[j].num, endCol: lines[j].text.length + 1 },
                  confidence: 0.7,
                  reason: 'Replace bare pass with error logging to avoid silently hiding failures.',
                },
              }),
            )
            break
          }
          if (nextTrimmed && !nextTrimmed.startsWith('#') && nextTrimmed !== 'pass' && nextTrimmed !== '...') {
            break
          }
        }
      }
    } else {
      const catchMatch = trimmed.match(/catch\s*(?:\(\s*\w+\s*\))?\s*\{\s*\}\s*$/)
      if (catchMatch) {
        const col = text.indexOf('catch') + 1
        results.push(
          diag({
            filePath,
            rule: 'ast-slop/swallowed-exception',
            severity: 'info',
            message: 'Swallowed exception: empty catch block',
            help: 'Handle the error (log, rethrow, or recover). Empty catch blocks silently swallow errors, making bugs invisible.',
            line: num,
            column: col,
            fixable: true,
            suggestion: {
              type: 'refactor',
              text: 'catch (error) { console.error(error); }',
              confidence: 0.6,
              reason: 'Add at least error logging to avoid silently swallowing exceptions.',
            },
          }),
        )
      } else {
        const catchStartMatch = trimmed.match(/catch\s*(?:\(\s*(\w+)\s*\))?\s*\{\s*$/)
        if (catchStartMatch) {
          const catchVar = catchStartMatch[1] ?? 'error'
          for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
            const nextTrimmed = lines[j].text.trim()
            if (nextTrimmed === '}') {
              const col = text.indexOf('catch') + 1
              results.push(
                diag({
                  filePath,
                  rule: 'ast-slop/swallowed-exception',
                  severity: 'info',
                  message: 'Swallowed exception: empty catch block',
                  help: 'Handle the error (log, rethrow, or recover). Empty catch blocks silently swallow errors, making bugs invisible.',
                  line: num,
                  column: col,
                  fixable: true,
                  suggestion: {
                    type: 'insert',
                    text: `  console.error(${catchVar});`,
                    range: { startLine: lines[j].num, startCol: 1, endLine: lines[j].num, endCol: 1 },
                    confidence: 0.65,
                    reason: 'Add at least error logging to the empty catch block.',
                  },
                }),
              )
              break
            }
            if (nextTrimmed && nextTrimmed !== '' && nextTrimmed !== '}' && !nextTrimmed.startsWith('//')) {
              break
            }
          }
        }
      }
    }
  }
  return results
}
