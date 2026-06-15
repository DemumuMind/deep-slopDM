import { dirname, join, relative, isAbsolute } from 'node:path'
import type {
  Engine,
  EngineContext,
  EngineResult,
  Diagnostic,
  Severity,
  Category,
} from '../../types/index.js'
import { readFileContent, toLines } from '../../utils/file-utils.js'

// ── Engine metadata ─────────────────────────────────────

const ENGINE_NAME = 'go-deep' as const

const RULE_CATEGORIES: Record<string, Category> = {
  'unchecked-error': 'syntax',
  'empty-interface': 'types',
  'exported-no-doc': 'style',
  'deep-copy-missing': 'performance',
  'init-side-effect': 'architecture',
  'defer-in-loop': 'syntax',
  'context-missing': 'style',
  'goto-usage': 'syntax',
  'package-cycle': 'architecture',
}

const RULE_SEVERITIES: Record<string, Severity> = {
  'unchecked-error': 'error',
  'empty-interface': 'error',
  'exported-no-doc': 'warning',
  'deep-copy-missing': 'warning',
  'init-side-effect': 'warning',
  'defer-in-loop': 'error',
  'context-missing': 'warning',
  'goto-usage': 'error',
  'package-cycle': 'error',
}

const BASIC_TYPES = new Set([
  'bool', 'string', 'int', 'int8', 'int16', 'int32', 'int64',
  'uint', 'uint8', 'uint16', 'uint32', 'uint64', 'uintptr',
  'float32', 'float64', 'complex64', 'complex128', 'byte', 'rune', 'error',
])

const BUILTIN_NO_ERROR = new Set([
  'len', 'cap', 'make', 'append', 'copy', 'delete', 'complex', 'real', 'imag',
  'new', 'close', 'panic', 'recover', 'print', 'println',
])

const ERROR_RETURNING_PACKAGES = new Set([
  'os', 'io', 'ioutil', 'net', 'http', 'sql', 'database', 'bufio', 'exec', 'crypto',
  'tls', 'grpc', 'rpc', 'smtp', 'ftp', 'ssh', 'redis', 'mongo', 's3', 'gcs', 'aws',
  'fmt', 'log', 'errors', 'context', 'strconv', 'strings', 'bytes', 'time', 'path',
  'filepath', 'syscall', 'regexp', 'json', 'xml', 'csv', 'html', 'encoding', 'archive',
  'compress', 'fs', 'url', 'mime', 'plugin', 'runtime', 'sync', 'db', 'file',
])

const IO_CALL_RE = new RegExp(
  `\\b(?:${[...ERROR_RETURNING_PACKAGES].join('|')})\\s*\\.`,
)

const SIDE_EFFECT_RE = new RegExp(
  `\\b(?:${[...ERROR_RETURNING_PACKAGES].join('|')})\\s*\\.|\\bpanic\\(|\\bgo\\s`,
)

// ── Types ─────────────────────────────────────────────────

interface CodeLine {
  num: number
  text: string
}

// ── Helpers ───────────────────────────────────────────────

function makeDiagnostic(
  filePath: string,
  rule: string,
  message: string,
  help: string,
  line: number,
  column: number,
  fixable: boolean,
  suggestion?: Diagnostic['suggestion'],
): Diagnostic {
  return {
    filePath,
    engine: ENGINE_NAME,
    rule: `${ENGINE_NAME}/${rule}`,
    severity: RULE_SEVERITIES[rule],
    message,
    help,
    line,
    column,
    category: RULE_CATEGORIES[rule],
    fixable,
    suggestion,
  }
}

function toCodeLines(content: string): CodeLine[] {
  const lines = toLines(content)
  const out: CodeLine[] = []
  let inBlock = false
  for (const { num, text } of lines) {
    let stripped = ''
    let i = 0
    while (i < text.length) {
      if (inBlock) {
        const end = text.indexOf('*/', i)
        if (end === -1) {
          i = text.length
          break
        }
        inBlock = false
        i = end + 2
      } else {
        const blockStart = text.indexOf('/*', i)
        const lineStart = text.indexOf('//', i)
        if (blockStart !== -1 && (lineStart === -1 || blockStart < lineStart)) {
          stripped += text.slice(i, blockStart)
          inBlock = true
          i = blockStart + 2
        } else if (lineStart !== -1) {
          stripped += text.slice(i, lineStart)
          i = text.length
        } else {
          stripped += text.slice(i)
          i = text.length
        }
      }
    }
    out.push({ num, text: stripped })
  }
  return out
}

function extractPackageName(content: string): string | null {
  const m = /^\s*package\s+([A-Za-z_]\w*)/m.exec(content)
  return m?.[1] ?? null
}

function extractImports(content: string): string[] {
  const imports: string[] = []
  const lines = toLines(content)
  let inBlock = false
  for (const { text } of lines) {
    const stripped = text.replace(/\/\/.*$/, '')
    if (inBlock) {
      const end = stripped.indexOf(')')
      if (end !== -1) {
        inBlock = false
        const inner = stripped.slice(0, end)
        for (const quote of inner.match(/"([^"]+)"/g) ?? []) {
          imports.push(quote.slice(1, -1))
        }
      } else {
        for (const quote of stripped.match(/"([^"]+)"/g) ?? []) {
          imports.push(quote.slice(1, -1))
        }
      }
    } else {
      const importMatch = /^\s*import\s+(\(|"([^"]+)")/.exec(stripped)
      if (importMatch) {
        if (importMatch[1] === '(') {
          inBlock = true
          const rest = stripped.slice(stripped.indexOf('(') + 1)
          const end = rest.indexOf(')')
          if (end !== -1) {
            inBlock = false
            for (const quote of rest.slice(0, end).match(/"([^"]+)"/g) ?? []) {
              imports.push(quote.slice(1, -1))
            }
          } else {
            for (const quote of rest.match(/"([^"]+)"/g) ?? []) {
              imports.push(quote.slice(1, -1))
            }
          }
        } else {
          imports.push(importMatch[2])
        }
      }
    }
  }
  return imports
}

function extractGenericParams(text: string): Set<string> {
  const params = new Set<string>()
  const m = /\bfunc\s+(?:\([^)]*\)\s*)?[A-Za-z_]\w*\s*\[([^\]]*)\]/.exec(text)
  if (!m) return params
  for (const part of m[1].split(',')) {
    const token = part.trim().split(/\s+/)[0]
    if (token) params.add(token)
  }
  return params
}

function getFunctionSignatureStart(text: string): { name: string; index: number } | null {
  const re = /\bfunc\s+(?:\([^)]*\)\s*)?([A-Za-z_]\w*)\s*(?:\[[^\]]*\])?\s*\(/
  const m = re.exec(text)
  if (!m) return null
  const open = text.indexOf('(', m.index + m[0].length - 1)
  if (open === -1) return null
  return { name: m[1], index: open }
}

function extractParamList(lines: CodeLine[], startIdx: number): { text: string; startLine: number } | null {
  const startText = lines[startIdx].text
  const sigStart = getFunctionSignatureStart(startText)
  if (!sigStart) return null
  let depth = 1
  let lineIdx = startIdx
  let col = sigStart.index + 1
  let content = ''
  while (lineIdx < lines.length && depth > 0) {
    const line = lines[lineIdx].text
    for (let i = col; i < line.length; i++) {
      const ch = line[i]
      if (ch === '(' || ch === '[' || ch === '{') {
        depth++
      } else if (ch === ')' || ch === ']' || ch === '}') {
        depth--
        if (depth === 0) {
          content += line.slice(col, i)
          return { text: content, startLine: startIdx }
        }
      }
    }
    content += line.slice(col) + ' '
    lineIdx++
    col = 0
  }
  return null
}

function findFunctionBodyRange(lines: CodeLine[], startIdx: number): { start: number; end: number } | null {
  let bodyStartLine = -1
  let bodyStartCol = -1
  for (let i = startIdx; i < lines.length; i++) {
    const line = lines[i].text
    const idx = line.indexOf('{')
    if (idx !== -1) {
      bodyStartLine = i
      bodyStartCol = idx
      break
    }
  }
  if (bodyStartLine === -1) return null
  let depth = 1
  for (let i = bodyStartLine; i < lines.length; i++) {
    const line = lines[i].text
    let start = i === bodyStartLine ? bodyStartCol + 1 : 0
    for (let j = start; j < line.length; j++) {
      const ch = line[j]
      if (ch === '{') {
        depth++
      } else if (ch === '}') {
        depth--
        if (depth === 0) {
          return { start: bodyStartLine, end: i }
        }
      }
    }
  }
  return null
}

function findTopLevelFunctions(lines: CodeLine[]): { start: number; end: number; bodyStart: number }[] {
  const funcs: { start: number; end: number; bodyStart: number }[] = []
  for (let i = 0; i < lines.length; i++) {
    const text = lines[i].text
    const leading = text.match(/^\s*/)?.[0].length ?? 0
    if (leading !== 0) continue
    if (!text.startsWith('func')) continue
    const range = findFunctionBodyRange(lines, i)
    if (!range) continue
    funcs.push({ start: i, end: range.end, bodyStart: range.start })
  }
  return funcs
}

function splitParams(params: string): string[] {
  const parts: string[] = []
  let depth = 0
  let start = 0
  for (let i = 0; i < params.length; i++) {
    const ch = params[i]
    if (ch === '(' || ch === '[' || ch === '{') {
      depth++
    } else if (ch === ')' || ch === ']' || ch === '}') {
      depth--
    } else if (ch === ',' && depth === 0) {
      parts.push(params.slice(start, i))
      start = i + 1
    }
  }
  parts.push(params.slice(start))
  return parts.map((p) => p.trim()).filter(Boolean)
}

function getValueType(param: string, genericParams: Set<string>): string | null {
  if (
    param.includes('context.Context') ||
    param.includes('error') ||
    param.includes('interface{}') ||
    param.includes('any') ||
    param.includes('[]') ||
    param.includes('map[') ||
    param.includes('chan') ||
    param.includes('func')
  ) {
    return null
  }
  const tokens = param.split(/\s+/).filter(Boolean)
  const last = tokens[tokens.length - 1]
  if (!last) return null
  if (last.startsWith('*')) return null
  if (genericParams.has(last)) return null
  if (BASIC_TYPES.has(last)) return null
  if (/^[A-Z]/.test(last)) return last
  return null
}

function collectFiles(context: EngineContext): Promise<string[]> {
  if (context.files && context.files.length > 0) {
    return Promise.resolve(context.files.filter((f) => f.endsWith('.go')))
  }

  const root = context.rootDirectory
  const exclude = context.config.exclude ?? []
  const files: string[] = []

  async function walk(dir: string): Promise<void> {
    const { readdir } = await import('node:fs/promises')
    let entries: import('node:fs').Dirent[]
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      return
    }

    for (const entry of entries) {
      const full = join(dir, entry.name)
      const rel = relative(root, full)
      if (exclude.some((p) => rel.startsWith(p) || entry.name === p)) {
        continue
      }
      if (entry.isDirectory()) {
        await walk(full)
      } else if (entry.isFile() && entry.name.endsWith('.go')) {
        files.push(rel)
      }
    }
  }

  return walk(root).then(() => files)
}

// ── Rule checks ───────────────────────────────────────────

function checkUncheckedError(content: string, relPath: string): Diagnostic[] {
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

function checkEmptyInterface(content: string, relPath: string): Diagnostic[] {
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

function checkExportedNoDoc(content: string, relPath: string): Diagnostic[] {
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

function checkDeepCopyMissing(content: string, relPath: string): Diagnostic[] {
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

function checkInitSideEffect(content: string, relPath: string): Diagnostic[] {
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

function checkDeferInLoop(content: string, relPath: string): Diagnostic[] {
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

function checkContextMissing(content: string, relPath: string): Diagnostic[] {
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

function checkGotoUsage(content: string, relPath: string): Diagnostic[] {
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

function checkPackageCycle(files: string[], contents: string[]): Diagnostic[] {
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

// ── Engine export ─────────────────────────────────────────

export const goDeepEngine: Engine = {
  name: ENGINE_NAME,
  description:
    'Deep Go-specific analysis: unchecked errors, empty interfaces, missing docs, value copies, init side effects, defer-in-loop, missing context, goto usage, and package cycles.',
  supportedLanguages: ['go'],

  async run(context: EngineContext): Promise<EngineResult> {
    const start = performance.now()
    const diagnostics: Diagnostic[] = []
    const files = await collectFiles(context)
    const contents: string[] = []

    for (const relOrAbs of files) {
      const absPath = isAbsolute(relOrAbs) ? relOrAbs : join(context.rootDirectory, relOrAbs)
      const relPath = isAbsolute(relOrAbs) ? relative(context.rootDirectory, absPath) : relOrAbs
      let content: string
      try {
        content = await readFileContent(absPath)
      } catch {
        continue
      }
      contents.push(content)
      diagnostics.push(...checkUncheckedError(content, relPath))
      diagnostics.push(...checkEmptyInterface(content, relPath))
      diagnostics.push(...checkExportedNoDoc(content, relPath))
      diagnostics.push(...checkDeepCopyMissing(content, relPath))
      diagnostics.push(...checkInitSideEffect(content, relPath))
      diagnostics.push(...checkDeferInLoop(content, relPath))
      diagnostics.push(...checkContextMissing(content, relPath))
      diagnostics.push(...checkGotoUsage(content, relPath))
    }

    if (files.length > 0) {
      diagnostics.push(...checkPackageCycle(files, contents))
    }

    return {
      engine: ENGINE_NAME,
      diagnostics,
      elapsed: performance.now() - start,
      skipped: false,
    }
  },
}
