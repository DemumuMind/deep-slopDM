// ── YAML Duplicate Keys Rule ───────────────────────────────
// Duplicate keys in the same YAML mapping.

import type { Diagnostic } from '../../../types/index.js'
import { makeDiagnostic } from '../shared.js'

export function detectYamlDuplicateKeys(
  content: string,
  lines: { num: number; text: string }[],
  filePath: string,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = []

  const keyPattern = /^(\s*)([\w][\w.-]*)\s*:/
  const scopeStack: { indent: number; keys: Map<string, number> }[] = [{ indent: -1, keys: new Map() }]

  for (const { num, text } of lines) {
    const match = keyPattern.exec(text)
    if (!match) continue

    const indent = match[1].length
    const key = match[2]

    while (scopeStack.length > 1 && scopeStack[scopeStack.length - 1].indent >= indent) {
      scopeStack.pop()
    }

    const currentScope = scopeStack[scopeStack.length - 1]
    if (currentScope.keys.has(key)) {
      diagnostics.push(
        makeDiagnostic({
          filePath,
          rule: 'yaml/duplicate-keys',
          message: `Duplicate key "${key}" in same mapping — last occurrence wins silently`,
          line: num,
          severity: 'error',
          category: 'syntax',
          help: `Rename or remove the duplicate key. First occurrence was on line ${currentScope.keys.get(key)}.`,
          fixable: false,
          detail: { key, firstOccurrence: currentScope.keys.get(key) },
        }),
      )
    } else {
      currentScope.keys.set(key, num)
    }

    scopeStack.push({ indent, keys: new Map() })
  }

  return diagnostics
}
