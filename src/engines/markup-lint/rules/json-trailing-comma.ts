// ── JSON Trailing Comma Rule ───────────────────────
// Trailing commas in JSON objects/arrays are invalid per RFC 8259.

import type { Diagnostic } from '../../../types/index.js'
import { makeDiagnostic } from '../shared.js'

export function detectJsonTrailingComma(
  content: string,
  lines: { num: number; text: string }[],
  filePath: string,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = []

  for (const { num, text } of lines) {
    const trimmed = text.trimEnd()
    if (/,\s*$/.test(trimmed)) {
      const idx = lines.findIndex((l) => l.num === num)
      for (let i = idx + 1; i < lines.length; i++) {
        const nextTrimmed = lines[i].text.trim()
        if (nextTrimmed.length === 0) continue
        if (/^[}\]]/.test(nextTrimmed)) {
          diagnostics.push(
            makeDiagnostic({
              filePath,
              rule: 'json/trailing-comma',
              message: 'Trailing comma before closing bracket — invalid JSON (RFC 8259)',
              line: num,
              column: trimmed.lastIndexOf(',') + 1,
              severity: 'error',
              category: 'syntax',
              help: 'Remove the trailing comma. JSON does not allow trailing commas per the specification.',
              fixable: true,
              suggestion: {
                type: 'replace',
                text: trimmed.replace(/,\s*$/, ''),
                confidence: 0.95,
                reason: 'Trailing commas make JSON invalid and cause parse errors in strict parsers',
              },
            }),
          )
        }
        break
      }
    }
  }

  return diagnostics
}
