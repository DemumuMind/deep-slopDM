// ── JSON Duplicate Keys Rule ─────────────────────────────
// Duplicate keys in the same JSON object.

import type { Diagnostic } from '../../../types/index.js'
import { makeDiagnostic } from '../shared.js'

export function detectJsonDuplicateKeys(
  content: string,
  lines: { num: number; text: string }[],
  filePath: string,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = []

  const keyPattern = /^\s*"([^"]+)"\s*:/
  const objectStack: Map<string, number>[] = [new Map()]
  let braceDepth = 0

  for (const { num, text } of lines) {
    for (const ch of text) {
      if (ch === '{') {
        braceDepth++
        objectStack.push(new Map())
      } else if (ch === '}') {
        objectStack.pop()
        braceDepth--
      }
    }

    const match = keyPattern.exec(text)
    if (match) {
      const key = match[1]
      const currentObj = objectStack[objectStack.length - 1]
      if (!currentObj) continue

      if (currentObj.has(key)) {
        diagnostics.push(
          makeDiagnostic({
            filePath,
            rule: 'json/duplicate-keys',
            message: `Duplicate key "${key}" in same object — last occurrence wins silently`,
            line: num,
            severity: 'error',
            category: 'syntax',
            help: `Rename or remove the duplicate key. The first occurrence was on line ${currentObj.get(key)}.`,
            fixable: false,
            detail: { key, firstOccurrence: currentObj.get(key) },
          }),
        )
      } else {
        currentObj.set(key, num)
      }
    }
  }

  return diagnostics
}
