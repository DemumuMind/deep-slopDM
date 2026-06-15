import { dirname } from 'node:path'
import type { Diagnostic } from '../../types/index.js'
import { toLines } from '../../utils/file-utils.js'
import {
  BUILTIN_NO_ERROR,
  ERROR_RETURNING_PACKAGES,
  IO_CALL_RE,
  SIDE_EFFECT_RE,
  makeDiagnostic,
  toCodeLines,
  extractPackageName,
  extractImports,
  extractGenericParams,
  getFunctionSignatureStart,
  extractParamList,
  findFunctionBodyRange,
  findTopLevelFunctions,
  splitParams,
  getValueType,
} from './helpers.js'

// ── Rule checks ──────────────────────────────────────────

export function checkUncheckedError(content: string, relPath: string): Diagnostic[] {
  const diagnostics: Diagnostic[] = []
  const lines = toCodeLines(content)
  for (const { num, text } of lines) {
    const trimmed = text.trim()
    if (trimmed === '' || /^\s*(package|import)\b/.test(text)) continue

    const assignMatch = trimmed.match(/^(_|[A-Za-z_]\w*(?:\s*,\s*_)?)\s*(:=|=)\s*(.+)$/)
    if (assignMatch) {
      const lhs = assignMatch[1]
      const rhs = assignMatch[3]
      if (lhs.includes('_') && !lhs.includes('err') && /\w\s*\(/.test(rhs)) {
        const callName = (rhs.match(/^[A-Za-z_]\w*/) ?? [])[0]
        if (callName && !BUILTIN_NO_ERROR.has(callName)) {
          diagnostics.push(
            makeDiagnostic(
              relPath,
              'unchecked-error',
              `Error return value is not checked: ${callName}()`,
              'Assign the result and handle err != nil, or explicitly ignore with a comment',
              num,
              text.indexOf(callName) + 1,
              false,
            ),
          )
        }
      }
    }

    const bareCallMatch = /^\s*([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)?)\s*\(/.exec(trimmed)
    if (bareCallMatch) {
      const call = bareCallMatch[1]
      const pkg = call.split('.')[0]
      const before = trimmed.slice(0, bareCallMatch.index).trim()
      if (
        before === '' &&
        ERROR_RETURNING_PACKAGES.has(pkg) &&
        !/^\s*(defer|go|return|if|for|switch|select|case)\b/.test(trimmed)
      ) {
        diagnostics.push(
          makeDiagnostic(
            relPath,
            'unchecked-error',
            `Error return value is not checked: ${call}()`,
            'Assign the result and handle err != nil, or explicitly ignore with a comment',
            num,
            bareCallMatch.index + 1,
            false,
          ),
        )
      }
    }
  }
  return diagnostics
}

export function checkEmptyInterface(content: string, relPath: string): Diagnostic[] {
  const diagnostics: Diagnostic[] = []
  const lines = toCodeLines(content)
  const re = /\b(?:interface\s*\{\}|any)\b/g
  for (const { num, text } of lines) {
    let m: RegExpExecArray | null
    re.lastIndex = 0
    while ((m = re.exec(text)) !== null) {
      diagnostics.push(
        makeDiagnostic(
          relPath,
          'empty-interface',
          `Use of empty interface (${m[0]})`,
          'Replace with a concrete type or a named interface to preserve type safety',
          num,
          m.index + 1,
          true,
          {
            type: 'refactor',
            text: 'Replace with a concrete type',
            confidence: 0.3,
            reason: 'Empty interface (any) erases type information',
          },
        ),
      )
    }
  }
  return diagnostics
}

export function checkExportedNoDoc(content: string, relPath: string): Diagnostic[] {
  const diagnostics: Diagnostic[] = []
  const rawLines = toLines(content)
  const lines = toCodeLines(content)
  let depth = 0
  for (let i = 0; i < lines.length; i++) {
    const { num, text } = lines[i]
    for (const ch of text) {
      if (ch === '{') depth++
      else if (ch === '}') depth--
    }
    if (depth !== 0) continue
    const trimmed = text.trim()
    if (trimmed === '') continue
    const declMatch = trimmed.match(/^(func|type|var|const)\s+(?:\([^)]*\)\s*)?([A-Z]\w*)/)
    if (!declMatch) continue
    const name = declMatch[2]
    const prevText = rawLines[i - 1]?.text.trim() ?? ''
    if (new RegExp(`^\\/\\/\\s*\\b${name}\\b`).test(prevText)) continue
    diagnostics.push(
      makeDiagnostic(
        relPath,
        'exported-no-doc',
        `Exported ${declMatch[1]} '${name}' has no doc comment`,
        'Add a comment starting with the identifier name, e.g. // ${name} does ...',
        num,
        text.indexOf(name) + 1,
        false,
      ),
    )
  }
  return diagnostics
}

export function checkDeepCopyMissing(content: string, relPath: string): Diagnostic[] {
  const diagnostics: Diagnostic[] = []
  const lines = toCodeLines(content)
  for (let i = 0; i < lines.length; i++) {
    const { num, text } = lines[i]
    if (!text.startsWith('func')) continue
    const sigStart = getFunctionSignatureStart(text)
    if (!sigStart) continue
    const paramList = extractParamList(lines, i)
    if (!paramList) continue
    const genericParams = extractGenericParams(text)
    const params = splitParams(paramList.text)
    for (const param of params) {
      const typeName = getValueType(param, genericParams)
      if (typeName) {
        const col = text.indexOf(typeName)
        diagnostics.push(
          makeDiagnostic(
            relPath,
            'deep-copy-missing',
            `Parameter ${typeName} is passed by value`,
            `Consider passing *${typeName} to avoid copying large structs`,
            num,
            col === -1 ? 1 : col + 1,
            false,
          ),
        )
        break
      }
    }
  }
  return diagnostics
}

export function checkInitSideEffect(content: string, relPath: string): Diagnostic[] {
  const diagnostics: Diagnostic[] = []
  const lines = toCodeLines(content)
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].text.trim().startsWith('func init')) continue
    const range = findFunctionBodyRange(lines, i)
    if (!range) continue
    for (let j = range.start; j <= range.end; j++) {
      if (SIDE_EFFECT_RE.test(lines[j].text)) {
        diagnostics.push(
          makeDiagnostic(
            relPath,
            'init-side-effect',
            `init() contains side effects`,
            'Move I/O, network, or global state mutations into explicit setup functions',
            i + 1,
            1,
            false,
          ),
        )
        return diagnostics
      }
    }
  }
  return diagnostics
}

export function checkDeferInLoop(content: string, relPath: string): Diagnostic[] {
  const diagnostics: Diagnostic[] = []
  const lines = toCodeLines(content)
  const funcs = findTopLevelFunctions(lines)
  for (const fn of funcs) {
    const loopStack: number[] = []
    let loopDepth = 0
    let braceDepth = 0
    for (let i = fn.start; i <= fn.end; i++) {
      const { num, text } = lines[i]
      const forMatches = [...text.matchAll(/\bfor\b/g)]
      for (const _ of forMatches) {
        loopStack.push(braceDepth)
        loopDepth++
      }
      for (let j = 0; j < text.length; j++) {
        const ch = text[j]
        if (ch === '{') {
          braceDepth++
        } else if (ch === '}') {
          braceDepth--
          while (loopStack.length > 0 && braceDepth <= loopStack[loopStack.length - 1]) {
            loopStack.pop()
            loopDepth--
          }
        }
      }
      if (loopDepth > 0 && /\bdefer\b/.test(text)) {
        const col = text.indexOf('defer') + 1
        diagnostics.push(
          makeDiagnostic(
            relPath,
            'defer-in-loop',
            'defer inside loop leaks resources',
            'Move defer outside the loop or extract the loop body into a helper function',
            num,
            col,
            false,
          ),
        )
      }
    }
  }
  return diagnostics
}

export function checkContextMissing(content: string, relPath: string): Diagnostic[] {
  const diagnostics: Diagnostic[] = []
  const lines = toCodeLines(content)
  const funcs = findTopLevelFunctions(lines)
  for (const fn of funcs) {
    const name = getFunctionSignatureStart(lines[fn.start].text)?.name ?? ''
    if (name === 'init' || name === 'main') continue
    const header = lines
      .slice(fn.start, fn.bodyStart + 1)
      .map((l) => l.text)
      .join('\n')
    if (header.includes('context.Context')) continue
    const range = findFunctionBodyRange(lines, fn.start)
    if (!range) continue
    let hasIO = false
    for (let i = range.start; i <= range.end; i++) {
      if (IO_CALL_RE.test(lines[i].text)) {
        hasIO = true
        break
      }
    }
    if (hasIO) {
      diagnostics.push(
        makeDiagnostic(
          relPath,
          'context-missing',
          `Function '${name}' does I/O without context.Context`,
          'Add a context.Context parameter so callers can enforce deadlines and cancellation',
          fn.start + 1,
          1,
          false,
        ),
      )
    }
  }
  return diagnostics
}

export function checkGotoUsage(content: string, relPath: string): Diagnostic[] {
  const diagnostics: Diagnostic[] = []
  const lines = toCodeLines(content)
  for (const { num, text } of lines) {
    const m = /\bgoto\s+[A-Za-z_]\w*/.exec(text)
    if (m) {
      diagnostics.push(
        makeDiagnostic(
          relPath,
          'goto-usage',
          'Use of goto statement',
          'Use structured control flow (if/for/switch) instead of goto',
          num,
          m.index + 1,
          false,
        ),
      )
    }
  }
  return diagnostics
}

export function checkPackageCycle(files: string[], contents: string[]): Diagnostic[] {
  const diagnostics: Diagnostic[] = []
  const pkgNameToDirs = new Map<string, Set<string>>()
  const dirToPkg = new Map<string, string>()
  for (let i = 0; i < files.length; i++) {
    const dir = dirname(files[i])
    const pkg = extractPackageName(contents[i])
    if (!pkg) continue
    dirToPkg.set(dir, pkg)
    const dirs = pkgNameToDirs.get(pkg) ?? new Set<string>()
    dirs.add(dir)
    pkgNameToDirs.set(pkg, dirs)
  }

  const localPackages = new Set<string>(pkgNameToDirs.keys())
  const pkgNameToImports = new Map<string, Set<string>>()
  for (let i = 0; i < files.length; i++) {
    const dir = dirname(files[i])
    const pkg = dirToPkg.get(dir)
    if (!pkg) continue
    const imports = extractImports(contents[i])
    const set = pkgNameToImports.get(pkg) ?? new Set<string>()
    for (const imp of imports) {
      const seg = imp.split('/').pop() ?? imp
      if (localPackages.has(seg)) {
        set.add(seg)
      }
    }
    pkgNameToImports.set(pkg, set)
  }

  const color = new Map<string, 'white' | 'gray' | 'black'>()
  for (const pkg of localPackages) color.set(pkg, 'white')
  const cycles = new Set<string>()
  function dfs(node: string, path: string[]) {
    color.set(node, 'gray')
    path.push(node)
    for (const neighbor of pkgNameToImports.get(node) ?? []) {
      if (color.get(neighbor) === 'gray') {
        const idx = path.indexOf(neighbor)
        const cycle = path.slice(idx).sort()
        cycles.add(JSON.stringify(cycle))
      } else if (color.get(neighbor) === 'white') {
        dfs(neighbor, path)
      }
    }
    path.pop()
    color.set(node, 'black')
  }
  for (const pkg of localPackages) {
    if (color.get(pkg) === 'white') dfs(pkg, [])
  }

  for (const cycleStr of cycles) {
    const cycle = JSON.parse(cycleStr) as string[]
    for (const pkg of cycle) {
      const dirs = pkgNameToDirs.get(pkg)
      if (!dirs) continue
      for (const dir of dirs) {
        const relPath = files.find((r) => dirname(r) === dir)
        if (!relPath) continue
        diagnostics.push(
          makeDiagnostic(
            relPath,
            'package-cycle',
            `Circular package import involving ${cycle.join(' -> ')}`,
            'Break the import cycle by moving shared code into a separate package',
            1,
            1,
            false,
          ),
        )
      }
    }
  }
  return diagnostics
}
