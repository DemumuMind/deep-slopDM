// ── Placeholder Implementation Rule ────────────────────────────────────
// Detects functions marked with TODO/FIXME that only return stub values.

import type { Diagnostic, Language } from '../../../types/index.js'
import { diag } from '../shared.js'

export function detectPlaceholderImpl(
  lines: { num: number; text: string }[],
  filePath: string,
  language: Language,
): Diagnostic[] {
  const results: Diagnostic[] = []

  const funcStartRe = language === 'python'
    ? /^\s*def\s+(\w+)\s*\(/
    : /^\s*(?:(?:export|public|private|protected|static|async)\s+)*(?:function\s+)?(\w+)\s*[^;]*\{\s*$/
  const arrowFuncRe = /(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?(?:\([^)]*\)|[a-zA-Z_]\w*)\s*=>\s*\{\s*$/

  for (let i = 0; i < lines.length; i++) {
    const { num, text } = lines[i]
    const trimmed = text.trim()

    const funcMatch = trimmed.match(funcStartRe)
    const arrowMatch = trimmed.match(arrowFuncRe)
    const funcName = funcMatch?.[1] ?? arrowMatch?.[1]

    if (!funcName) continue
    if (['constructor', 'render', 'mount', 'unmount'].includes(funcName)) continue

    let hasTodo = /\b(?:TODO|FIXME)\b/i.test(trimmed)

    if (language === 'python') {
      for (let j = i + 1; j < Math.min(i + 6, lines.length); j++) {
        const nextTrimmed = lines[j].text.trim()
        const currentIndent = lines[j].text.length - lines[j].text.trimStart().length
        const funcIndent = text.length - text.trimStart().length
        if (currentIndent <= funcIndent && nextTrimmed.length > 0) break
        if (nextTrimmed.startsWith('#')) {
          if (/\b(?:TODO|FIXME)\b/i.test(nextTrimmed)) hasTodo = true
          continue
        }
        if (nextTrimmed === 'pass' || nextTrimmed === '...' ||
            /^return\s+(None|null|0|''|""|False)?\s*$/.test(nextTrimmed)) {
          if (hasTodo) {
            const col = text.indexOf(funcName) + 1
            results.push(
              diag({
                filePath,
                rule: 'ast-slop/placeholder-impl',
                severity: 'warning',
                message: `Placeholder implementation: "${funcName}" has TODO/FIXME but only returns a stub value`,
                help: 'Implement the function or explicitly throw NotImplementedError. Placeholder stubs with TODOs are a hallmark of incomplete AI-generated code.',
                line: num,
                column: col,
                fixable: false,
                detail: { functionName: funcName },
              }),
            )
          }
          break
        }
        break
      }
    } else {
      let hasComment = false
      for (let j = i + 1; j < Math.min(i + 10, lines.length); j++) {
        const nextTrimmed = lines[j].text.trim()
        if (nextTrimmed === '}') {
          if (hasTodo && hasComment) {
            const col = text.indexOf(funcName) + 1
            results.push(
              diag({
                filePath,
                rule: 'ast-slop/placeholder-impl',
                severity: 'warning',
                message: `Placeholder implementation: "${funcName}" has TODO/FIXME but only returns a stub value`,
                help: "Implement the function or explicitly throw new Error('Not implemented'). Placeholder stubs with TODOs are a hallmark of incomplete AI-generated code.",
                line: num,
                column: col,
                fixable: false,
                detail: { functionName: funcName },
              }),
            )
          }
          break
        }
        if (nextTrimmed === '') continue
        if (nextTrimmed.startsWith('//') || nextTrimmed.startsWith('/*')) {
          hasComment = true
          if (/\b(?:TODO|FIXME)\b/i.test(nextTrimmed)) hasTodo = true
          continue
        }
        if (/^return\s+(null|undefined|0|''|""|void\s+0)?\s*;?\s*$/.test(nextTrimmed)) {
          if (hasTodo) {
            const col = text.indexOf(funcName) + 1
            results.push(
              diag({
                filePath,
                rule: 'ast-slop/placeholder-impl',
                severity: 'warning',
                message: `Placeholder implementation: "${funcName}" has TODO/FIXME but only returns a stub value`,
                help: "Implement the function or explicitly throw new Error('Not implemented'). Placeholder stubs with TODOs are a hallmark of incomplete AI-generated code.",
                line: num,
                column: col,
                fixable: false,
                detail: { functionName: funcName },
              }),
            )
          }
          break
        }
        break
      }
    }
  }
  return results
}
