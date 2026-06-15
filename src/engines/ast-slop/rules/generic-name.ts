// ── Generic Name Rule ────────────────────────────
// Detects placeholder variable names typical of AI-generated code.

import type { Diagnostic, Language } from '../../../types/index.js'
import { diag } from '../shared.js'

const GENERIC_NAMES = new Set([
  'var1', 'var2', 'var3', 'temp', 'tmp', 'retval',
  'foo', 'bar', 'baz', 'qux', 'quux',
  'x', 'y', 'z', 'a', 'b', 'c',
  'stuff', 'thing', 'something', 'whatever', 'misc',
  'obj', 'itm',
])

function isGenericNameAcceptable(
  name: string,
  fullLine: string,
  prevLine: string | undefined,
  nextLine: string | undefined,
): boolean {
  if (/\b(?:name|id)\s*=\s*["']/.test(fullLine)) return true
  if (/\b(?:function|=>|callback|handler)\b/.test(fullLine) && /\(\s*\w*\s*,?\s*\b/.test(fullLine)) return true
  if (/\b(?:query|params|req|request|ctx|context)\s*[.\[]\s*/.test(fullLine)) return true
  if (/\{\s*[^}]*\b\w+\b[^}]*\}\s*=/.test(fullLine) && fullLine.includes(name)) {
    if (/\b(?:response|res|result|axios|fetch|api)\b/.test(fullLine)) return true
  }
  if (/\b(?:FormData|event|CustomEvent)\b/.test(fullLine)) return true
  if (/\b(?:useQuery|useMutation|useSWR|useFetch)\b/.test(fullLine)) return true
  return false
}

export function detectGenericName(
  lines: { num: number; text: string }[],
  filePath: string,
  language: Language,
): Diagnostic[] {
  const results: Diagnostic[] = []

  for (let i = 0; i < lines.length; i++) {
    const { num, text } = lines[i]
    const trimmed = text.trim()

    const varPattern = language === 'python'
      ? /(?:^|\s)(\w+)\s*=\s*/
      : /(?:const|let|var)\s+(\w+)\s*[=:]?/

    const match = trimmed.match(varPattern)
    if (!match) continue

    const varName = match[1]
    if (!GENERIC_NAMES.has(varName)) continue

    const prevLine = i > 0 ? lines[i - 1].text.trim() : undefined
    const nextLine = i < lines.length - 1 ? lines[i + 1].text.trim() : undefined

    if (isGenericNameAcceptable(varName, trimmed, prevLine, nextLine)) continue

    const col = text.indexOf(varName) + 1
    results.push(
      diag({
        filePath,
        rule: 'ast-slop/generic-name',
        severity: 'suggestion',
        message: `Generic variable name "${varName}" — lacks descriptive intent`,
        help: `Rename "${varName}" to convey its purpose (e.g. "userData", "fetchResult", "configInfo"). Generic names are a hallmark of AI-generated code.`,
        line: num,
        column: col,
        fixable: false,
        detail: { variableName: varName },
      }),
    )
  }
  return results
}
