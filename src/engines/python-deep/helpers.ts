import type { Diagnostic, Severity, Suggestion } from '../../types/index.js'
import { toLines } from '../../utils/file-utils.js'
import { findAncestor, type ASTNode } from '../../utils/tree-sitter/index.js'

export const ENGINE_NAME = 'python-deep' as const

export const SEVERITY: Record<string, Severity> = {
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

export const CATEGORY: Record<string, Diagnostic['category']> = {
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

export const HELP: Record<string, string> = {
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

export const FIXABLE = new Set([
  'bare-except',
  'f-string-in-log',
  'mutable-default',
  'pass-stub',
  'print-statement',
])

export const LOGGING_PREFIX_RE = /\b(logging|logger|log|app\.logger|self\.logger)\.(debug|info|warning|warn|error|critical|exception|log)\s*\(/i

export function makeDiagnostic(
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

export function isTestFile(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, '/')
  return /\.(test|spec)\.(py|pyi)$/.test(normalized) || /\/(test|tests)\//.test(normalized)
}

export function getNameNode(node: ASTNode): ASTNode | undefined {
  return node.children.find((c) => c.fieldName === 'name' || c.type === 'identifier')
}

export function getBodyNode(node: ASTNode): ASTNode | undefined {
  return node.children.find((c) => c.type === 'block' || c.fieldName === 'body')
}

export function getParametersNode(node: ASTNode): ASTNode | undefined {
  return node.children.find((c) => c.type === 'parameters' || c.fieldName === 'parameters')
}

export function getReturnTypeNode(node: ASTNode): ASTNode | undefined {
  return node.children.find((c) => c.type === 'type' || c.fieldName === 'return_type')
}

export function isPublicName(name: string): boolean {
  if (name.startsWith('__') && name.endsWith('__')) return true
  return !name.startsWith('_')
}

export function isDocstring(node: ASTNode): boolean {
  if (node.type.includes('string') || node.type === 'f_string' || node.type === 'concatenated_string') return true
  if (node.type === 'expression_statement') {
    const first = node.children.find((c) => c.type !== 'comment' && c.text.trim() !== '')
    if (first && (first.type.includes('string') || first.type === 'f_string' || first.type === 'concatenated_string')) return true
  }
  return false
}

export function hasDocstring(node: ASTNode): boolean {
  const body = getBodyNode(node)
  if (!body) return false
  const first = body.children.find((c) => c.type !== 'comment' && c.text.trim() !== '')
  return first ? isDocstring(first) : false
}

export function isPassStub(node: ASTNode): boolean {
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

export function extractParamName(param: ASTNode): string | undefined {
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

export function isParamTyped(param: ASTNode): boolean {
  if (param.type === 'typed_parameter') return true
  if (param.type === 'default_parameter') {
    const first = param.children.find((c) => c.type === 'identifier' || c.type === 'typed_parameter')
    return first?.type === 'typed_parameter'
  }
  return false
}

export function getDefaultValue(param: ASTNode): ASTNode | undefined {
  if (param.type === 'default_parameter') {
    return param.children.find((c) => ['list', 'dictionary', 'set'].includes(c.type))
  }
  if (param.type === 'typed_parameter') {
    return param.children.find((c) => ['list', 'dictionary', 'set'].includes(c.type))
  }
  return undefined
}

export function findExceptExpression(exceptNode: ASTNode): ASTNode | undefined {
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

export function isLoggingCall(callNode: ASTNode, loggingPrefixRe: RegExp): boolean {
  const func = callNode.children[0]
  if (!func) return false
  return loggingPrefixRe.test(func.text) || loggingPrefixRe.test(callNode.text)
}

export function containsFString(node: ASTNode): boolean {
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

export function isInsideFunction(node: ASTNode): boolean {
  return findAncestor(node, (n) => n.type === 'function_definition') !== null
}

export function isInsideClass(node: ASTNode): boolean {
  return findAncestor(node, (n) => n.type === 'class_definition') !== null
}

export function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function getIndent(line: string): string {
  const match = line.match(/^(\s*)/)
  return match ? match[1] : ''
}

export function splitParams(text: string): string[] {
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

export function findFirstBodyLine(
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

export function applyFixes(content: string, diagnostics: Diagnostic[]): string {
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

export function convertFstringLine(line: string): string {
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
