// ── YAML Multi-Document Unseparated Rule ─────────────────
// Multiple documents without --- separator.

import type { Diagnostic } from '../../../types/index.js'
import { makeDiagnostic } from '../shared.js'

export function detectYamlMultiDocUnseparated(
  content: string,
  lines: { num: number; text: string }[],
  filePath: string,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = []

  const hasExplicitSeparator = lines.some((l) => l.text.trim() === '---')
  if (hasExplicitSeparator) return diagnostics

  const topLevelKeyPattern = /^[\w][\w.-]*\s*:/
  const topLevelKeys: { key: string; line: number }[] = []

  for (const { num, text } of lines) {
    const match = topLevelKeyPattern.exec(text)
    if (match) {
      topLevelKeys.push({ key: match[1] ?? match[0], line: num })
    }
  }

  if (topLevelKeys.length >= 4) {
    let gapCount = 0
    for (let i = 1; i < topLevelKeys.length; i++) {
      const gap = topLevelKeys[i].line - topLevelKeys[i - 1].line
      if (gap > 2) gapCount++
    }

    if (gapCount >= 2) {
      diagnostics.push(
        makeDiagnostic({
          filePath,
          rule: 'yaml/multi-doc-unseparated',
          message: 'Possible multiple YAML documents without --- separator',
          line: topLevelKeys[0].line,
          severity: 'warning',
          category: 'syntax',
          help: 'Add --- separators between documents, or merge into a single document with a top-level key',
          fixable: false,
          detail: { topLevelKeyCount: topLevelKeys.length, gapCount },
        }),
      )
    }
  }

  return diagnostics
}
