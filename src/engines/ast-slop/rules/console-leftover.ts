// ── Console Leftover Rule ───────────────────────────
// Detects console.log/debug and print() statements left over from debugging.

import type { Diagnostic, Language } from '../../../types/index.js'
import { diag } from '../shared.js'

function isInCatchBlock(lines: { num: number; text: string }[], lineNum: number): boolean {
  let depth = 0
  for (let i = lineNum - 1; i >= 1; i--) {
    const line = lines.find((l) => l.num === i)
    if (!line) continue
    const t = line.text.trim()
    for (const ch of t) {
      if (ch === '}') depth--
      if (ch === '{') depth++
    }
    if (t.includes('catch') && depth >= 0) return true
    if (depth < 0) return false
  }
  return false
}

export function detectConsoleLeftover(
  lines: { num: number; text: string }[],
  filePath: string,
  language: Language,
): Diagnostic[] {
  const results: Diagnostic[] = []

  if (/[/__]tests?[/__]/i.test(filePath)) return results
  if (/\.test\.(?:ts|tsx|js|jsx)$/.test(filePath)) return results
  if (/\.spec\.(?:ts|tsx|js|jsx)$/.test(filePath)) return results

  for (const { num, text } of lines) {
    const trimmed = text.trim()

    if (language !== 'python') {
      const isTest = filePath.includes('.test.') || filePath.includes('.spec.') || filePath.includes('__tests__')
      if (isTest) continue
      const logMatch = trimmed.match(/console\.(log|debug)\s*\(/)
      if (logMatch) {
        const isInCatch = isInCatchBlock(lines, num)
        if (isInCatch) continue

        const col = text.indexOf('console') + 1
        results.push(
          diag({
            filePath,
            rule: 'ast-slop/console-leftover',
            severity: 'suggestion',
            message: `console.${logMatch[1]}() leftover — likely debugging artifact`,
            help: 'Remove debug logging before committing. Use a proper logging library for production, or guard with environment checks.',
            line: num,
            column: col,
            fixable: true,
            suggestion: {
              type: 'delete',
              text: '',
              range: { startLine: num, startCol: 1, endLine: num, endCol: text.length + 1 },
              confidence: 0.85,
              reason: 'console.log/console.debug statements are typically debugging artifacts that should not be in committed code.',
            },
          }),
        )
      }
    }

    if (language === 'python') {
      const printMatch = trimmed.match(/^print\s*\(/)
      if (printMatch) {
        const prevLines = lines.filter((l) => l.num < num && l.num >= num - 5)
        const isMainGuard = prevLines.some((l) => l.text.includes('if __name__'))
        if (isMainGuard) continue

        const col = text.indexOf('print') + 1
        results.push(
          diag({
            filePath,
            rule: 'ast-slop/console-leftover',
            severity: 'suggestion',
            message: 'print() leftover — likely debugging artifact',
            help: 'Replace print() with proper logging (logging.debug, logger.debug) or remove entirely.',
            line: num,
            column: col,
            fixable: true,
            suggestion: {
              type: 'replace',
              text: trimmed.replace(/^print\s*\((.+)\)/, 'logger.debug($1)'),
              range: { startLine: num, startCol: 1, endLine: num, endCol: text.length + 1 },
              confidence: 0.6,
              reason: 'Replace bare print() with structured logging for maintainability.',
            },
          }),
        )
      }
    }
  }
  return results
}
