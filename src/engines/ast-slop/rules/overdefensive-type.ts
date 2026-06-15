// ── Overdefensive Type Rule ──────────────────────────
// Detects redundant typeof guards on variables that are already typed.

import type { Diagnostic, Language } from '../../../types/index.js'
import { diag } from '../shared.js'

export function detectOverdefensiveType(
  lines: { num: number; text: string }[],
  filePath: string,
  language: Language,
): Diagnostic[] {
  const results: Diagnostic[] = []
  if (language !== 'typescript') return results

  const typedVars = new Map<string, string>()
  const typeAnnotationRe = /(?:const|let|var)\s+(\w+)\s*:\s*([^=;]+)/

  for (const { num, text } of lines) {
    const trimmed = text.trim()
    const typeMatch = trimmed.match(typeAnnotationRe)
    if (typeMatch) {
      const varName = typeMatch[1]
      const typeAnn = typeMatch[2].trim().replace(/\s+/g, ' ')
      typedVars.set(varName, typeAnn)
    }
  }

  for (const { num, text } of lines) {
    const trimmed = text.trim()

    const typeofGuardRe = /typeof\s+(\w+)\s*===?\s*['"](string|number|boolean|object|function|symbol|bigint|undefined)['"]/g
    let m: RegExpExecArray | null
    while ((m = typeofGuardRe.exec(trimmed)) !== null) {
      const varName = m[1]
      const typeCheck = m[2]
      const declaredType = typedVars.get(varName)

      if (declaredType) {
        const isRedundant =
          (typeCheck === 'string' && /string/.test(declaredType) && !/\|/.test(declaredType) && !/any/.test(declaredType)) ||
          (typeCheck === 'number' && /number/.test(declaredType) && !/\|/.test(declaredType) && !/any/.test(declaredType)) ||
          (typeCheck === 'boolean' && /boolean/.test(declaredType) && !/\|/.test(declaredType) && !/any/.test(declaredType))

        if (isRedundant) {
          const col = text.indexOf('typeof') + 1
          results.push(
            diag({
              filePath,
              rule: 'ast-slop/overdefensive-type',
              severity: 'info',
              message: `typeof ${varName} === '${typeCheck}' is redundant — ${varName} is already typed as ${declaredType}`,
              help: 'Remove redundant type guards on already-typed values. TypeScript enforces these types at compile time. Only use typeof checks for union types or unknown values.',
              line: num,
              column: col,
              fixable: true,
              suggestion: {
                type: 'refactor',
                text: `${varName} != null`,
                confidence: 0.6,
                reason: `The variable ${varName} is already typed as ${declaredType}, making the typeof check redundant.`,
              },
            }),
          )
        }
      }
    }
  }
  return results
}
