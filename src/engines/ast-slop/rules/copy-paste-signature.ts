// ── Copy-Paste Signature Rule ────────────────────────
// Detects duplicate function signatures with identical parameter types.

import type { Diagnostic, Language } from '../../../types/index.js'
import { diag } from '../shared.js'

interface Signature {
  name: string
  paramTypes: string
  line: number
  col: number
}

function normalizeParamTypes(rawParams: string): string {
  return rawParams
    .split(',')
    .map((p) => {
      const trimmed = p.trim()
      if (!trimmed) return ''
      const typeMatch = trimmed.match(/\??\s*:\s*([^=]+)/)
      if (typeMatch) return typeMatch[1].trim()
      return trimmed.replace(/\?.*$/, '').trim()
    })
    .filter((t) => t.length > 0)
    .join(', ')
}

export function detectCopyPasteSignature(
  content: string,
  lines: { num: number; text: string }[],
  filePath: string,
  language: Language,
): Diagnostic[] {
  const results: Diagnostic[] = []
  if (language === 'python') return results

  const funcSigRe = /(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(([^)]*)\)/g
  const signatures: Signature[] = []
  let m: RegExpExecArray | null

  while ((m = funcSigRe.exec(content)) !== null) {
    const name = m[1]
    const rawParams = m[2]
    const paramTypes = normalizeParamTypes(rawParams)
    const upToMatch = content.slice(0, m.index)
    const lineNum = (upToMatch.match(/\n/g) ?? []).length + 1
    const line = lines.find((l) => l.num === lineNum)
    if (!line) continue
    const col = line.text.indexOf(name) + 1
    signatures.push({ name, paramTypes, line: lineNum, col })
  }

  const byParamTypes = new Map<string, Signature[]>()
  for (const sig of signatures) {
    if (sig.paramTypes.length < 4) continue
    const list = byParamTypes.get(sig.paramTypes) ?? []
    list.push(sig)
    byParamTypes.set(sig.paramTypes, list)
  }

  for (const [, group] of byParamTypes) {
    const uniqueNames = new Set(group.map((s) => s.name))
    if (group.length < 2 || uniqueNames.size < 2) continue

    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const a = group[i]
        const b = group[j]
        if (a.name === b.name) continue

        results.push(
          diag({
            filePath,
            rule: 'ast-slop/copy-paste-signature',
            severity: 'info',
            message: `Functions "${a.name}" and "${b.name}" have identical parameter type signatures — likely copy-paste`,
            help: 'If these functions serve different purposes, differentiate their signatures. If they share logic, extract the common implementation into a shared utility.',
            line: a.line,
            column: a.col,
            fixable: false,
            detail: { functionA: a.name, functionB: b.name, paramTypes: a.paramTypes },
          }),
        )
      }
    }
  }

  return results
}
