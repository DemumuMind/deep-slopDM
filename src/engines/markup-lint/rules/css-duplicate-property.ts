// ── CSS Duplicate Property Rule ─────────────────────────
// Same CSS property defined twice in one rule.

import type { Diagnostic } from '../../../types/index.js'
import { makeDiagnostic } from '../shared.js'

export function detectCssDuplicateProperty(
  content: string,
  lines: { num: number; text: string }[],
  filePath: string,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = []
  const propertyPattern = /^\s*([\w-]+)\s*:/

  const currentProps = new Map<string, number>()

  for (const { num, text } of lines) {
    const trimmed = text.trim()

    if (trimmed.endsWith('{')) {
      currentProps.clear()
      continue
    }

    if (trimmed.startsWith('}')) {
      currentProps.clear()
      continue
    }

    const match = propertyPattern.exec(text)
    if (match) {
      const prop = match[1].toLowerCase()
      if (currentProps.has(prop)) {
        diagnostics.push(
          makeDiagnostic({
            filePath,
            rule: 'css/duplicate-property',
            message: `Duplicate property "${prop}" in same rule block — first defined on line ${currentProps.get(prop)}`,
            line: num,
            severity: 'warning',
            category: 'syntax',
            help: 'Remove the duplicate property. The last definition wins, which may not be intended.',
            fixable: true,
            suggestion: {
              type: 'delete',
              text: '',
              confidence: 0.8,
              reason: 'Duplicate properties are usually accidental; the last one wins silently',
            },
            detail: { property: prop, firstLine: currentProps.get(prop) },
          }),
        )
      } else {
        currentProps.set(prop, num)
      }
    }
  }

  return diagnostics
}
