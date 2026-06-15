import type {
  Engine,
  EngineContext,
  EngineResult,
  Diagnostic,
  Severity,
  Suggestion,
  FixResult,
} from '../../types/index.js'
import { readFileContent, toLines } from '../../utils/file-utils.js'
import {
  parsePython,
  isPythonAvailable,
  findNodesOfType,
  findNodesOfTypes,
  findAncestor,
  type ASTNode,
} from '../../utils/tree-sitter/index.js'
import { readFile, writeFile } from 'node:fs/promises'

// ── Engine metadata ─────────────────────────────────────

const ENGINE_NAME = 'python-deep' as const

const SEVERITY: Record<string, Severity> = {
  'bare-except': 'error',
  'no-type-hint': 'warning',
  'no-return-type': 'warning',
  'f-string-in-log': 'warning',
  'mutable-default': 'error',
  'global-variable': 'error',
  'star-import': 'error',
  'pass-stub': 'warning',
  'print-statement': 'info',
  'broad-exception': 'warning',
  'missing-docstring': 'suggestion',
}

const CATEGORY: Record<string, Diagnostic['category']> = {
  'bare-except': 'syntax',
  'no-type-hint': 'types',
  'no-return-type': 'types',
  'f-string-in-log': 'style',
  'mutable-default': 'syntax',
  'global-variable': 'architecture',
  'star-import': 'imports',
  'pass-stub': 'dead-code',
  'print-statement': 'style',
  'broad-exception': 'syntax',
  'missing-docstring': 'style',
}

const HELP: Record<string, string> = {
  'bare-except': 'Avoid bare except clauses; catch specific exceptions or use `except Exception:`.',
  'no-type-hint': 'Add type annotations to function parameters for better maintainability.',
  'no-return-type': 'Add a return type annotation to clarify the function contract.',
  'f-string-in-log': 'Use lazy logging formatting instead of f-strings so interpolation runs only when the message is emitted.',
  'mutable-default': 'Mutable default arguments are shared between calls; use None and initialize inside the function.',
  'global-variable': 'Avoid global variables; pass state explicitly or use a class/module-level constant.',
  'star-import': 'Avoid `from module import *`; import only the names you need.',
  'pass-stub': 'Empty pass/ellipsis bodies are stubs; implement the function or raise NotImplementedError.',
  'print-statement': 'Remove debug print() calls or replace them with a proper logging framework.',
  'broad-exception': 'Avoid catching broad Exception/BaseException; catch specific exceptions.',
  'missing-docstring': 'Public functions and classes should have a docstring describing their purpose.',
}

const FIXABLE = new Set([
  'bare-except',
  'f-string-in-log',
  'mutable-default',
  'pass-stub',
  'print-statement',
])

const LOGGING_PREFIX_RE = /\b(logging|logger|log|app\.logger|self\.logger)\.(debug|info|warning|warn|error|critical|exception|log)\s*\(/i

// ── Helpers ─────────────────────────────────────────────

function makeDiagnostic(
  filePath: string,
  rule: string,
  line: number,
  column: number,
  message: string,
  opts?: {
    fixable?: boolean
    suggestion?: Suggestion
    detail?: Record<string, unknown>
  },
): Diagnostic {
  return {
    filePath,
    engine: ENGINE_NAME,
    rule: `${ENGINE_NAME}/${rule}`,
    severity: SEVERITY[rule],
    message,
    help: HELP[rule],
    line,
    column,
    category: CATEGORY[rule],
    fixable: opts?.fixable ?? FIXABLE.has(rule),
    suggestion: opts?.suggestion,
    detail: opts?.detail,
  }
}

function isTestFile(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, '/')
  return /\.(test|spec)\.(py|pyi)$/.test(normalized) || /\/(test|tests)\//.test(normalized)
}

function getNameNode(node: ASTNode): ASTNode | undefined {
  return node.children.find((c) => c.fieldName === 'name' || c.type === 'identifier')
}

function getBodyNode(node: ASTNode): ASTNode | undefined {
  return node.children.find((c) => c.type === 'block' || c.fieldName === 'body')
}

function getParametersNode(node: ASTNode): ASTNode | undefined {
  return node.children.find((c) => c.type === 'parameters' || c.fieldName === 'parameters')
}

function getReturnTypeNode(node: ASTNode): ASTNode | undefined {
  return node.children.find((c) => c.type === 'type' || c.fieldName === 'return_type')
}

function isPublicName(name: string): boolean {
  if (name.startsWith('__') && name.endsWith('__')) return true
  return !name.startsWith('_')
}

function isDocstring(node: ASTNode): boolean {
  if (node.type.includes('string') || node.type === 'f_string' || node.type === 'concatenated_string') return true
  if (node.type === 'expression_statement') {
    const first = node.children.find((c) => c.type !== 'comment' && c.text.trim() !== '')
    if (first && (first.type.includes('string') || first.type === 'f_string' || first.type === 'concatenated_string')) return true
  }
  return false
}

function hasDocstring(node: ASTNode): boolean {
  const body = getBodyNode(node)
  if (!body) return false
  const first = body.children.find((c) => c.type !== 'comment' && c.text.trim() !== '')
  return first ? isDocstring(first) : false
}

function isPassStub(node: ASTNode): boolean {
  const body = getBodyNode(node)
  if (!body) return true
  const statements = body.children.filter((c) => c.type !== 'comment' && c.text.trim() !== '')
  if (statements.length === 0) return true
  // Allow a leading docstring
  const bodyStatements = hasDocstring(node) ? statements.slice(1) : statements
  if (bodyStatements.length === 0) return true
  if (bodyStatements.length > 1) return false
  const only = bodyStatements[0]
  return only.type === 'pass_statement' || only.type === 'ellipsis' || only.text.trim() === 'pass' || only.text.trim() === '...'
}

function extractParamName(param: ASTNode): string | undefined {
  if (param.type === 'identifier') return param.text
  if (param.type === 'typed_parameter') {
    const name = param.children.find((c) => c.type === 'identifier')
    return name?.text
  }
  if (param.type === 'default_parameter') {
    const first = param.children.find((c) => c.type === 'identifier' || c.type === 'typed_parameter')
    return first?.type === 'identifier' ? first.text : extractParamName(first!)
  }
  return undefined
}

function isParamTyped(param: ASTNode): boolean {
  if (param.type === 'typed_parameter') return true
  if (param.type === 'default_parameter') {
    const first = param.children.find((c) => c.type === 'identifier' || c.type === 'typed_parameter')
    return first?.type === 'typed_parameter'
  }
  return false
}

function getDefaultValue(param: ASTNode): ASTNode | undefined {
  if (param.type === 'default_parameter') {
    return param.children.find((c) => ['list', 'dictionary', 'set'].includes(c.type))
  }
  if (param.type === 'typed_parameter') {
    return param.children.find((c) => ['list', 'dictionary', 'set'].includes(c.type))
  }
  return undefined
}

function findExceptExpression(exceptNode: ASTNode): ASTNode | undefined {
  let afterExcept = false
  for (const child of exceptNode.children) {
    if (child.text === 'except') {
      afterExcept = true
      continue
    }
    if (!afterExcept) continue
    if (child.text === ':' || child.text === 'as') break
    if (child.text.trim() === '') continue
    if (child.type !== 'comment') return child
  }
  return undefined
}

function isLoggingCall(callNode: ASTNode): boolean {
  const func = callNode.children[0]
  if (!func) return false
  return LOGGING_PREFIX_RE.test(func.text) || LOGGING_PREFIX_RE.test(callNode.text)
}

function containsFString(node: ASTNode): boolean {
  let found = false
  function walk(n: ASTNode) {
    if (found) return
    if (n.type === 'f_string' || n.type === 'fstring' || n.type === 'string' && n.text.startsWith('f')) {
      found = true
      return
    }
    for (const child of n.children) walk(child)
  }
  walk(node)
  return found
}

function isInsideFunction(node: ASTNode): boolean {
  return findAncestor(node, (n) => n.type === 'function_definition') !== null
}

function isInsideClass(node: ASTNode): boolean {
  return findAncestor(node, (n) => n.type === 'class_definition') !== null
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function getIndent(line: string): string {
  const match = line.match(/^(\s*)/)
  return match ? match[1] : ''
}

// ── AST-based detection ───────────────────────────────────

function analyzeWithAST(filePath: string, root: ASTNode): Diagnostic[] {
  const diagnostics: Diagnostic[] = []

  // ── Functions & classes ───────────────────────────────
  const funcs = findNodesOfTypes(root, ['function_definition', 'class_definition'])

  for (const node of funcs) {
    const nameNode = getNameNode(node)
    const name = nameNode?.text ?? '(anonymous)'
    const line = (nameNode ?? node).startRow + 1
    const column = (nameNode ?? node).startCol + 1

    // pass-stub
    if (isPassStub(node)) {
      diagnostics.push(makeDiagnostic(filePath, 'pass-stub', line, column,
        `${node.type === 'class_definition' ? 'Class' : 'Function'} '${name}' is a stub (only pass/ellipsis)`,
        {
          suggestion: {
            type: 'replace',
            text: 'raise NotImplementedError',
            confidence: 0.8,
            reason: 'A stub should raise NotImplementedError or be implemented.',
          },
        }
      ))
    }

    // missing-docstring
    if (isPublicName(name) && !hasDocstring(node)) {
      diagnostics.push(makeDiagnostic(filePath, 'missing-docstring', line, column,
        `${node.type === 'class_definition' ? 'Public class' : 'Public function'} '${name}' is missing a docstring`
      ))
    }

    // Functions only below
    if (node.type === 'function_definition') {
      // no-return-type
      if (!getReturnTypeNode(node)) {
        diagnostics.push(makeDiagnostic(filePath, 'no-return-type', line, column,
          `Function '${name}' is missing a return type annotation`,
          {
            suggestion: {
              type: 'insert',
              text: `def ${name}(...) -> None:`,
              confidence: 0.6,
              reason: 'Add a return type annotation to clarify the function contract.',
            },
          }
        ))
      }

      // parameters
      const params = getParametersNode(node)
      if (params) {
        for (const param of params.children) {
          const paramName = extractParamName(param)
          if (!paramName) continue
          if (paramName === 'self' || paramName === 'cls') continue
          if (paramName.startsWith('*') || paramName.startsWith('**')) continue

          // no-type-hint
          if (!isParamTyped(param)) {
            diagnostics.push(makeDiagnostic(filePath, 'no-type-hint', param.startRow + 1, param.startCol + 1,
              `Parameter '${paramName}' has no type annotation`,
              {
                suggestion: {
                  type: 'replace',
                  text: `${paramName}: <type>`,
                  confidence: 0.6,
                  reason: 'Add a type annotation to improve readability and catch bugs.',
                },
              }
            ))
          }

          // mutable-default
          const defaultValue = getDefaultValue(param)
          if (defaultValue) {
            diagnostics.push(makeDiagnostic(filePath, 'mutable-default', param.startRow + 1, param.startCol + 1,
              `Parameter '${paramName}' has a mutable default value`,
              {
                fixable: true,
                suggestion: {
                  type: 'replace',
                  text: `${paramName}=None`,
                  confidence: 0.85,
                  reason: 'Mutable defaults are shared across calls; use None and initialize inside the function.',
                },
                detail: { paramName, defaultValue: defaultValue.text },
              }
            ))
          }
        }
      }
    }
  }

  // ── global statements ───────────────────────────────────
  const globals = findNodesOfType(root, 'global_statement')
  for (const node of globals) {
    diagnostics.push(makeDiagnostic(filePath, 'global-variable', node.startRow + 1, node.startCol + 1,
      'Use of the global keyword',
      {
        suggestion: {
          type: 'refactor',
          text: 'Pass state as an argument or encapsulate it in a class.',
          confidence: 0.7,
          reason: 'global variables make code harder to test and reason about.',
        },
      }
    ))
  }

  // ── star imports ────────────────────────────────────────
  const fromImports = findNodesOfType(root, 'import_from_statement')
  for (const node of fromImports) {
    if (node.text.includes(' import *') || node.children.some((c) => c.text === '*' || c.type === 'wildcard_import')) {
      diagnostics.push(makeDiagnostic(filePath, 'star-import', node.startRow + 1, node.startCol + 1,
        'Wildcard import pollutes the namespace',
        {
          suggestion: {
            type: 'replace',
            text: 'from module import name1, name2',
            confidence: 0.8,
            reason: 'Explicit imports make dependencies clear and avoid name collisions.',
          },
        }
      ))
    }
  }

  // ── except clauses ──────────────────────────────────────
  const excepts = findNodesOfType(root, 'except_clause')
  for (const node of excepts) {
    const expr = findExceptExpression(node)
    const line = node.startRow + 1
    const col = node.startCol + 1
    if (!expr) {
      diagnostics.push(makeDiagnostic(filePath, 'bare-except', line, col,
        'Bare except clause catches all exceptions',
        {
          fixable: true,
          suggestion: {
            type: 'replace',
            text: 'except Exception:',
            confidence: 0.95,
            reason: 'Bare except catches KeyboardInterrupt and SystemExit; use a specific exception type.',
          },
        }
      ))
    } else if (expr.text === 'Exception' || expr.text === 'BaseException' || /\b(Exception|BaseException)\b/.test(expr.text)) {
      diagnostics.push(makeDiagnostic(filePath, 'broad-exception', line, col,
        `Catching broad exception type '${expr.text}'`,
        {
          suggestion: {
            type: 'refactor',
            text: 'except SpecificError:',
            confidence: 0.7,
            reason: 'Catching broad exceptions can mask bugs; catch specific types you can handle.',
          },
        }
      ))
    }
  }

  // ── calls: print and logging ────────────────────────────
  const calls = findNodesOfType(root, 'call')
  for (const call of calls) {
    const func = call.children[0]
    const line = call.startRow + 1
    const col = call.startCol + 1

    if (func && func.text === 'print') {
      diagnostics.push(makeDiagnostic(filePath, 'print-statement', line, col,
        'print() in non-test code',
        {
          fixable: true,
          suggestion: {
            type: 'delete',
            text: '',
            confidence: 0.9,
            reason: 'Debug print statements should be removed or replaced with logging.',
          },
        }
      ))
      continue
    }

    if (isLoggingCall(call) && containsFString(call)) {
      diagnostics.push(makeDiagnostic(filePath, 'f-string-in-log', line, col,
        'Logging call uses f-string instead of lazy formatting',
        {
          fixable: true,
          suggestion: {
            type: 'replace',
            text: 'logger.info("value %s", value)',
            confidence: 0.7,
            reason: 'Lazy formatting avoids work when the log level filters the message out.',
          },
        }
      ))
    }
  }

  return diagnostics
}

// ── Regex-based fallback ──────────────────────────────────

function splitParams(text: string): string[] {
  const parts: string[] = []
  let depth = 0
  let current = ''
  for (const ch of text) {
    if (ch === '(' || ch === '[' || ch === '{') depth++
    if (ch === ')' || ch === ']' || ch === '}') depth--
    if (ch === ',' && depth === 0) {
      parts.push(current)
      current = ''
    } else {
      current += ch
    }
  }
  if (current !== '' || parts.length > 0) parts.push(current)
  return parts
}

function analyzeWithRegex(filePath: string, content: string): Diagnostic[] {
  const diagnostics: Diagnostic[] = []
  const lines = toLines(content)
  const isTest = isTestFile(filePath)

  for (let i = 0; i < lines.length; i++) {
    const { num, text } = lines[i]

    // bare-except
    if (/^\s*except\s*:\s*(?:#.*)?$/.test(text)) {
      diagnostics.push(makeDiagnostic(filePath, 'bare-except', num, text.indexOf('except') + 1,
        'Bare except clause catches all exceptions',
        {
          fixable: true,
          suggestion: {
            type: 'replace',
            text: 'except Exception:',
            confidence: 0.95,
            reason: 'Bare except catches KeyboardInterrupt and SystemExit; use a specific exception type.',
          },
        }
      ))
    }

    // broad-exception
    const broadMatch = text.match(/^\s*except\s+(Exception|BaseException)\s*:/)
    if (broadMatch) {
      diagnostics.push(makeDiagnostic(filePath, 'broad-exception', num, text.indexOf('except') + 1,
        `Catching broad exception type '${broadMatch[1]}'`,
        {
          suggestion: {
            type: 'refactor',
            text: 'except SpecificError:',
            confidence: 0.7,
            reason: 'Catching broad exceptions can mask bugs; catch specific types you can handle.',
          },
        }
      ))
    }

    // global
    if (/^\s*global\s+\w+/.test(text)) {
      diagnostics.push(makeDiagnostic(filePath, 'global-variable', num, text.search(/\bglobal\b/) + 1,
        'Use of the global keyword'
      ))
    }

    // star-import
    if (/^\s*from\s+\S+\s+import\s+\*/.test(text)) {
      diagnostics.push(makeDiagnostic(filePath, 'star-import', num, text.search(/\*/) + 1,
        'Wildcard import pollutes the namespace'
      ))
    }

    // print
    if (!isTest && /^\s*print\s*\(/.test(text)) {
      diagnostics.push(makeDiagnostic(filePath, 'print-statement', num, text.search(/\bprint\b/) + 1,
        'print() in non-test code',
        {
          fixable: true,
          suggestion: {
            type: 'delete',
            text: '',
            confidence: 0.9,
            reason: 'Debug print statements should be removed or replaced with logging.',
          },
        }
      ))
    }

    // f-string in log
    if (LOGGING_PREFIX_RE.test(text) && /f['"]/.test(text)) {
      diagnostics.push(makeDiagnostic(filePath, 'f-string-in-log', num, text.search(/\b(logging|logger|log)\b/) + 1,
        'Logging call uses f-string instead of lazy formatting',
        {
          fixable: true,
          suggestion: {
            type: 'replace',
            text: 'logger.info("value %s", value)',
            confidence: 0.7,
            reason: 'Lazy formatting avoids work when the log level filters the message out.',
          },
        }
      ))
    }

    // mutable default
    const defMatch = text.match(/^(\s*)def\s+([a-zA-Z_]\w*)\s*\(([^)]*)\)\s*(?:->\s*\S+\s*)?:\s*(?:#.*)?$/)
    if (defMatch) {
      const indent = defMatch[1]
      const name = defMatch[2]
      const params = splitParams(defMatch[3])
      for (const raw of params) {
        const param = raw.trim()
        if (!param) continue
        const eqIdx = param.indexOf('=')
        const namePart = eqIdx === -1 ? param : param.slice(0, eqIdx).trim()
        const valuePart = eqIdx === -1 ? '' : param.slice(eqIdx + 1).trim()
        const paramName = namePart.split(':')[0].trim()
        if (paramName === 'self' || paramName === 'cls' || paramName.startsWith('*')) continue
        if (valuePart && /^(\[\s*\]|\{\s*\})$/.test(valuePart)) {
          const col = text.indexOf(raw) + 1
          diagnostics.push(makeDiagnostic(filePath, 'mutable-default', num, col > 0 ? col : 1,
            `Parameter '${paramName}' has a mutable default value`,
            {
              fixable: true,
              suggestion: {
                type: 'replace',
                text: `${paramName}=None`,
                confidence: 0.85,
                reason: 'Mutable defaults are shared across calls; use None and initialize inside the function.',
              },
              detail: { paramName, defaultValue: valuePart },
            }
          ))
        }
        if (!param.includes(':')) {
          // no type hint
          const col = text.indexOf(paramName) + 1
          diagnostics.push(makeDiagnostic(filePath, 'no-type-hint', num, col > 0 ? col : 1,
            `Parameter '${paramName}' has no type annotation`,
            {
              suggestion: {
                type: 'replace',
                text: `${paramName}: <type>`,
                confidence: 0.6,
                reason: 'Add a type annotation to improve readability and catch bugs.',
              },
            }
          ))
        }
      }
      // no return type
      if (!text.includes('->')) {
        diagnostics.push(makeDiagnostic(filePath, 'no-return-type', num, text.indexOf('def') + 1,
          `Function '${name}' is missing a return type annotation`,
          {
            suggestion: {
              type: 'insert',
              text: `def ${name}(...) -> None:`,
              confidence: 0.6,
              reason: 'Add a return type annotation to clarify the function contract.',
            },
          }
        ))
      }

      // pass-stub: first body line is pass/ellipsis
      const firstBodyLine = findFirstBodyLine(lines, i, indent)
      if (firstBodyLine && /^\s*(?:pass|\.\.\.)\s*(?:#.*)?$/.test(firstBodyLine.text)) {
        diagnostics.push(makeDiagnostic(filePath, 'pass-stub', num, text.indexOf(name) + 1,
          `Function '${name}' is a stub (only pass/ellipsis)`,
          {
            fixable: true,
            suggestion: {
              type: 'replace',
              text: 'raise NotImplementedError',
              confidence: 0.8,
              reason: 'A stub should raise NotImplementedError or be implemented.',
            },
          }
        ))
      }

      // missing-docstring
      if (isPublicName(name) && firstBodyLine && !/^\s*(?:r|u|b|br|rb)?(?:"""|'''|"|')/.test(firstBodyLine.text)) {
        diagnostics.push(makeDiagnostic(filePath, 'missing-docstring', num, text.indexOf(name) + 1,
          `Public function '${name}' is missing a docstring`
        ))
      }
    }

    // class pass-stub / missing docstring
    const classMatch = text.match(/^(\s*)class\s+([a-zA-Z_]\w*)\s*(?:\([^)]*\))?\s*:\s*(?:#.*)?$/)
    if (classMatch) {
      const indent = classMatch[1]
      const name = classMatch[2]
      const firstBodyLine = findFirstBodyLine(lines, i, indent)
      if (firstBodyLine && /^\s*(?:pass|\.\.\.)\s*(?:#.*)?$/.test(firstBodyLine.text)) {
        diagnostics.push(makeDiagnostic(filePath, 'pass-stub', num, text.indexOf(name) + 1,
          `Class '${name}' is a stub (only pass/ellipsis)`,
          {
            fixable: true,
            suggestion: {
              type: 'replace',
              text: 'raise NotImplementedError',
              confidence: 0.8,
              reason: 'A stub should raise NotImplementedError or be implemented.',
            },
          }
        ))
      }
      if (isPublicName(name) && firstBodyLine && !/^\s*(?:r|u|b|br|rb)?(?:"""|'''|"|')/.test(firstBodyLine.text)) {
        diagnostics.push(makeDiagnostic(filePath, 'missing-docstring', num, text.indexOf(name) + 1,
          `Public class '${name}' is missing a docstring`
        ))
      }
    }
  }

  return diagnostics
}

function findFirstBodyLine(
  lines: { num: number; text: string }[],
  signatureIndex: number,
  signatureIndent: string,
): { num: number; text: string } | undefined {
  const bodyIndent = signatureIndent + ' '
  for (let j = signatureIndex + 1; j < lines.length; j++) {
    const line = lines[j].text
    if (line.trim() === '' || line.trim().startsWith('#')) continue
    // The body must be indented more than the signature
    if (line.startsWith(bodyIndent) && line.length > signatureIndent.length) return lines[j]
    // If we hit a line at the same or lower indentation, the block is empty
    if (!line.startsWith(signatureIndent) && line.trim() !== '') break
    if (line.startsWith(signatureIndent) && line.trim() !== '') break
  }
  return undefined
}

// ── Engine ───────────────────────────────────────────────

/**
 * Python-specific deep analysis engine.
 *
 * Detects: bare/broad exception handling, missing type hints, mutable defaults,
 * global variables, star imports, pass/ellipsis stubs, debug prints, f-string
 * logging, and missing docstrings.
 */
export const pythonDeepEngine: Engine = {
  name: ENGINE_NAME,
  description:
    'Python-specific deep analysis: bare/broad exceptions, missing type hints and return types, f-string logging, mutable defaults, global variables, star imports, pass stubs, print statements, and missing docstrings',
  supportedLanguages: ['python'],

  async run(context: EngineContext): Promise<EngineResult> {
    const start = performance.now()
    const diagnostics: Diagnostic[] = []
    const files = (context.files ?? []).filter((f) => f.endsWith('.py'))

    for (const filePath of files) {
      try {
        const content = await readFileContent(filePath)
        const ast = await parsePython(content, filePath)
        if (ast && isPythonAvailable()) {
          diagnostics.push(...analyzeWithAST(filePath, ast))
        } else {
          diagnostics.push(...analyzeWithRegex(filePath, content))
        }
      } catch {
        // skip unreadable files
      }
    }

    return {
      engine: this.name,
      diagnostics,
      elapsed: performance.now() - start,
      skipped: false,
    }
  },

  async fix(diagnostics: Diagnostic[], _context: EngineContext): Promise<FixResult> {
    const fixable = diagnostics.filter((d) => d.engine === ENGINE_NAME && d.fixable)
    const remaining = diagnostics.filter((d) => d.engine !== ENGINE_NAME || !d.fixable)
    const modifiedFiles = new Set<string>()
    const filesMap = new Map<string, Diagnostic[]>()

    for (const d of fixable) {
      const list = filesMap.get(d.filePath)
      if (list) {
        list.push(d)
      } else {
        filesMap.set(d.filePath, [d])
      }
    }

    for (const [filePath, diags] of filesMap.entries()) {
      try {
        let content = await readFile(filePath, 'utf-8')
        content = applyFixes(content, diags)
        await writeFile(filePath, content, 'utf-8')
        modifiedFiles.add(filePath)
      } catch {
        // Fix failed for this file — keep diagnostics as remaining
        for (const d of diags) remaining.push(d)
      }
    }

    return {
      fixed: fixable.length - remaining.length,
      remaining,
      modifiedFiles: [...modifiedFiles],
    }
  },
}

// ── Auto-fix helpers ─────────────────────────────────────

function applyFixes(content: string, diagnostics: Diagnostic[]): string {
  const lines = content.split('\n')
  const sorted = [...diagnostics].sort((a, b) => b.line - a.line)

  for (const d of sorted) {
    const idx = d.line - 1
    if (idx < 0 || idx >= lines.length) continue

    switch (d.rule) {
      case 'python-deep/bare-except': {
        lines[idx] = lines[idx].replace(/\bexcept\s*:/, 'except Exception:')
        break
      }
      case 'python-deep/print-statement': {
        lines.splice(idx, 1)
        break
      }
      case 'python-deep/pass-stub': {
        lines[idx] = lines[idx].replace(/\bpass\b/, 'raise NotImplementedError')
        break
      }
      case 'python-deep/mutable-default': {
        const paramName = d.detail?.paramName as string | undefined
        const defaultValue = d.detail?.defaultValue as string | undefined
        if (paramName && defaultValue) {
          const original = lines[idx]
          lines[idx] = original.replace(new RegExp(`=\\s*${escapeRegExp(defaultValue)}`), '= None')
          const indent = getIndent(original)
          lines.splice(idx + 1, 0,
            `${indent}    if ${paramName} is None:`,
            `${indent}        ${paramName} = ${defaultValue}`
          )
        }
        break
      }
      case 'python-deep/f-string-in-log': {
        lines[idx] = convertFstringLine(lines[idx])
        break
      }
    }
  }

  return lines.join('\n')
}

function convertFstringLine(line: string): string {
  const exprs: string[] = []
  let converted = line.replace(/f(['"])([\s\S]*?)\1/g, (_match, quote, inner) => {
    const text = inner.replace(/\{([^}]+)\}/g, (_m: string, expr: string) => {
      exprs.push(expr.trim())
      return '%s'
    })
    return `${quote}${text}${quote}`
  })
  if (exprs.length > 0) {
    const lastParen = converted.lastIndexOf(')')
    if (lastParen !== -1) {
      converted = converted.slice(0, lastParen) + ', ' + exprs.join(', ') + converted.slice(lastParen)
    }
  }
  return converted
}
