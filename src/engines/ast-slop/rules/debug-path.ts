// ── Debug Path Rule ─────────────────────────────────
// Detects debugger statements and process.env.DEBUG in production code.

import type { Diagnostic, Language } from '../../../types/index.js'
import { diag } from '../shared.js'

export function detectDebugPath(
  lines: { num: number; text: string }[],
  filePath: string,
  language: Language,
): Diagnostic[] {
  const results: Diagnostic[] = []

  if (/[/\\](?:test|tests|__tests__|spec)[/\\]/i.test(filePath)) return results
  if (/\.(?:test|spec)\.(?:ts|tsx|js|jsx|py)$/.test(filePath)) return results
  if (/[/\\]engines[/\\][^/\\]+[/\\]rules[/\\]/i.test(filePath)) return results
  if (filePath.toLowerCase().includes('debug-path')) return results

  for (const { num, text } of lines) {
    const trimmed = text.trim()

    if (language !== 'python') {
      if (/\bdebugger\b/.test(trimmed) && !trimmed.startsWith('//')) {
        const col = text.indexOf('debugger') + 1
        results.push(
          diag({
            filePath,
            rule: 'ast-slop/debug-path',
            severity: 'warning',
            message: 'debugger statement in production code — will pause execution in devtools',
            help: 'Remove debugger statements before committing. They cause unexpected breakpoints in production.',
            line: num,
            column: col,
            fixable: true,
            suggestion: {
              type: 'delete',
              text: '',
              range: { startLine: num, startCol: 1, endLine: num, endCol: text.length + 1 },
              confidence: 0.95,
              reason: 'debugger statements should never be in committed code.',
            },
          }),
        )
      }

      if (/process\.env\.DEBUG/.test(trimmed) && !trimmed.startsWith('//')) {
        const col = text.indexOf('process.env.DEBUG') + 1
        results.push(
          diag({
            filePath,
            rule: 'ast-slop/debug-path',
            severity: 'info',
            message: 'process.env.DEBUG reference in production code — likely a debug path leak',
            help: 'Use a proper logging library with level configuration instead of raw process.env.DEBUG checks.',
            line: num,
            column: col,
            fixable: false,
          }),
        )
      }
    }
  }
  return results
}
