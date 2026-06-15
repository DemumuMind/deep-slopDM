// ── Suspicious Alias Rule ────────────────────────────────
// Detects import aliases that rename to generic, non-descriptive names.

import type { Diagnostic, Language } from '../../../types/index.js'
import { diag } from '../shared.js'

const GENERIC_ALIAS_NAMES = new Set([
  'data', 'result', 'item', 'value', 'info', 'obj', 'config',
  'handler', 'callback', 'util', 'utils', 'helper', 'helpers',
])

export function detectSuspiciousAlias(
  content: string,
  lines: { num: number; text: string }[],
  filePath: string,
  language: Language,
): Diagnostic[] {
  const results: Diagnostic[] = []
  if (language === 'python') return results

  const aliasRe = /import\s+(?:type\s+)?(?:\{[^}]*\}|\*|\w+)\s+as\s+(\w+)/g
  let m: RegExpExecArray | null
  while ((m = aliasRe.exec(content)) !== null) {
    const aliasName = m[1]
    if (!GENERIC_ALIAS_NAMES.has(aliasName)) continue

    const upToMatch = content.slice(0, m.index)
    const lineNum = (upToMatch.match(/\n/g) ?? []).length + 1
    const line = lines.find((l) => l.num === lineNum)
    if (!line) continue

    const col = line.text.indexOf(`as ${aliasName}`) + 1
    results.push(
      diag({
        filePath,
        rule: 'ast-slop/suspicious-alias',
        severity: 'info',
        message: `Import aliased to generic name "${aliasName}" — obscures the original module intent`,
        help: `Use a more descriptive alias or keep the original name. Generic aliases like "${aliasName}" lose the semantic meaning of the imported module.`,
        line: lineNum,
        column: col,
        fixable: false,
        detail: { aliasName },
      }),
    )
  }
  return results
}
