// ── Copy-Paste Function Detection ───────────────────────
// Functions with identical bodies but different names, excluding common
// boilerplate method names.

import { relative } from 'node:path'
import type { Diagnostic, Language } from '../../../types/index.js'
import {
  diag,
  COPY_PASTE_MIN_BODY_LINES,
  COPY_PASTE_NAME_WHITELIST,
  normalizeLine,
  type FunctionDef,
} from '../shared.js'
import { toLines } from '../../../utils/file-utils.js'

/** Extract function definitions using regex (JS/TS/Python) */
export function extractFunctions(
  content: string,
  filePath: string,
  lang: Language | null,
): FunctionDef[] {
  const lines = toLines(content)
  const functions: FunctionDef[] = []

  if (lang === 'typescript' || lang === 'javascript') {
    const funcStartRe = /^\s*(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(/
    const arrowFuncRe = /^\s*(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?(?:\([^)]*\)|[a-zA-Z_]\w*)\s*=>/
    const methodRe = /^\s*(?:(?:public|private|protected|static|async|abstract)\s+)*(\w+)\s*\([^)]*\)\s*(?::\s*[^{]+)?\{/

    for (let i = 0; i < lines.length; i++) {
      const { num, text } = lines[i]
      const trimmed = text.trim()

      let funcName: string | null = null
      const funcMatch = trimmed.match(funcStartRe)
      const arrowMatch = trimmed.match(arrowFuncRe)
      const methodMatch = trimmed.match(methodRe)

      if (funcMatch) {
        funcName = funcMatch[1]
      } else if (arrowMatch) {
        funcName = arrowMatch[1]
      } else if (methodMatch && !trimmed.startsWith('if') && !trimmed.startsWith('for') && !trimmed.startsWith('while') && !trimmed.startsWith('switch') && !trimmed.startsWith('catch') && !trimmed.startsWith('class') && !trimmed.startsWith('constructor')) {
        funcName = methodMatch[1]
      }

      if (funcName) {
        const { endLine, bodyLines } = extractBraceBody(lines, i)
        const bodyLineCount = bodyLines.filter((l) => l.trim().length > 0).length
        const bodyNormalized = bodyLines
          .map((l) => normalizeLine(l, lang))
          .filter((l) => l.length > 0)
          .join('\n')

        if (bodyNormalized.length > 20) {
          functions.push({
            filePath,
            name: funcName,
            startLine: num,
            endLine,
            bodyLineCount,
            bodyNormalized,
          })
        }
      }
    }
  }

  if (lang === 'python') {
    const defRe = /^\s*def\s+(\w+)\s*\(/
    for (let i = 0; i < lines.length; i++) {
      const { num, text } = lines[i]
      const match = text.match(defRe)
      if (match) {
        const funcName = match[1]
        const { endLine, bodyLines } = extractPythonBody(lines, i)
        const bodyLineCount = bodyLines.filter((l) => l.trim().length > 0).length
        const bodyNormalized = bodyLines
          .map((l) => normalizeLine(l, lang))
          .filter((l) => l.length > 0)
          .join('\n')

        if (bodyNormalized.length > 20) {
          functions.push({
            filePath,
            name: funcName,
            startLine: num,
            endLine,
            bodyLineCount,
            bodyNormalized,
          })
        }
      }
    }
  }

  return functions
}

/** Extract brace-delimited body from JS/TS starting at given line index */
function extractBraceBody(
  lines: { num: number; text: string }[],
  startIdx: number,
): { endLine: number; bodyLines: string[] } {
  let depth = 0
  let started = false
  const bodyLines: string[] = []
  let endLine = lines[startIdx].num

  for (let i = startIdx; i < lines.length; i++) {
    const text = lines[i].text
    for (const ch of text) {
      if (ch === '{') {
        depth++
        started = true
      } else if (ch === '}') {
        depth--
        if (started && depth === 0) {
          endLine = lines[i].num
          return { endLine, bodyLines }
        }
      }
    }
    if (started && i > startIdx) {
      bodyLines.push(text)
    }
    endLine = lines[i].num
  }

  return { endLine, bodyLines }
}

/** Extract indented body from Python starting at given line index */
function extractPythonBody(
  lines: { num: number; text: string }[],
  startIdx: number,
): { endLine: number; bodyLines: string[] } {
  const defLine = lines[startIdx].text
  const defIndent = defLine.length - defLine.trimStart().length
  const bodyLines: string[] = []
  let endLine = lines[startIdx].num

  for (let i = startIdx + 1; i < lines.length; i++) {
    const text = lines[i].text
    const trimmed = text.trim()
    if (trimmed.length === 0) {
      bodyLines.push(text)
      continue
    }
    const currentIndent = text.length - text.trimStart().length
    if (currentIndent <= defIndent && trimmed.length > 0) {
      break
    }
    bodyLines.push(text)
    endLine = lines[i].num
  }

  return { endLine, bodyLines }
}

export function detectCopyPasteFunctions(
  allFunctions: FunctionDef[],
  rootDir: string,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = []

  const filtered = allFunctions.filter(
    (fn) => !COPY_PASTE_NAME_WHITELIST.has(fn.name) && fn.bodyLineCount > COPY_PASTE_MIN_BODY_LINES,
  )

  const bodyGroups = new Map<string, FunctionDef[]>()
  for (const fn of filtered) {
    let arr = bodyGroups.get(fn.bodyNormalized)
    if (!arr) {
      arr = []
      bodyGroups.set(fn.bodyNormalized, arr)
    }
    arr.push(fn)
  }

  for (const [, group] of bodyGroups) {
    const uniqueNames = new Set(group.map((f) => f.name))
    if (group.length < 2 || uniqueNames.size < 2) continue

    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const a = group[i]
        const b = group[j]

        if (a.name === b.name) continue

        const relA = relative(rootDir, a.filePath)
        const relB = relative(rootDir, b.filePath)

        diagnostics.push(
          diag({
            filePath: relA,
            rule: 'dup-detect/copy-paste-function',
            severity: 'warning',
            message: `Function "${a.name}" (${relA}:${a.startLine}) has identical body to "${b.name}" (${relB}:${b.startLine})`,
            help: 'Extract the shared logic into a single utility function and call it from both locations, parameterizing any differences.',
            line: a.startLine,
            column: 1,
            fixable: false,
            suggestion: {
              type: 'refactor',
              text: `Extract shared logic from "${a.name}" and "${b.name}" into a single utility function, parameterizing any behavioral differences.`,
              confidence: 0.9,
              reason: 'Functions with identical bodies but different names are classic copy-paste duplication. This creates maintenance risk — fixes must be applied in multiple places.',
            },
            detail: {
              duplicateLocations: [
                { file: relA, name: a.name, startLine: a.startLine, endLine: a.endLine },
                { file: relB, name: b.name, startLine: b.startLine, endLine: b.endLine },
              ],
            },
          }),
        )
      }
    }
  }

  return diagnostics
}
