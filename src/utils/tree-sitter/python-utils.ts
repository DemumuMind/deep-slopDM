// ── Python-Specific Node Utilities ────────────────────────

import type { ASTNode } from './types.js'
import { findNodesOfType, findNodesOfTypes } from './query-execution.js'

/**
 * Find all Python function definitions in an AST.
 */
export function findPythonFunctions(root: ASTNode): {
  name: string
  decorators: string[]
  parameters: string[]
  isAsync: boolean
  line: number
  endLine: number
  text: string
}[] {
  const funcNodes = findNodesOfTypes(root, [
    'function_definition',
    'decorated_definition',
  ])

  const results: {
    name: string
    decorators: string[]
    parameters: string[]
    isAsync: boolean
    line: number
    endLine: number
    text: string
  }[] = []

  for (const node of funcNodes) {
    // decorated_definition wraps a function_definition
    if (node.type === 'decorated_definition') {
      const inner = node.children.find(
        (c) => c.type === 'function_definition'
      )
      if (inner) {
        results.push(extractPythonFunctionInfo(inner, node))
      }
    } else {
      results.push(extractPythonFunctionInfo(node))
    }
  }

  return results
}

/**
 * Find all Python class definitions in an AST.
 */
export function findPythonClasses(root: ASTNode): {
  name: string
  bases: string[]
  decorators: string[]
  methods: {
    name: string
    decorators: string[]
    parameters: string[]
    isAsync: boolean
    line: number
    endLine: number
    text: string
  }[]
  line: number
  endLine: number
  text: string
}[] {
  const classNodes = findNodesOfTypes(root, [
    'class_definition',
    'decorated_definition',
  ])

  const results: {
    name: string
    bases: string[]
    decorators: string[]
    methods: {
      name: string
      decorators: string[]
      parameters: string[]
      isAsync: boolean
      line: number
      endLine: number
      text: string
    }[]
    line: number
    endLine: number
    text: string
  }[] = []

  for (const node of classNodes) {
    if (node.type === 'decorated_definition') {
      const inner = node.children.find(
        (c) => c.type === 'class_definition'
      )
      if (inner) {
        results.push(extractPythonClassInfo(inner, node))
      }
    } else {
      results.push(extractPythonClassInfo(node))
    }
  }

  return results
}

/**
 * Find all Python import statements in an AST.
 */
export function findPythonImports(root: ASTNode): {
  module: string
  symbols: string[]
  isFromImport: boolean
  line: number
  text: string
}[] {
  const importNodes = findNodesOfTypes(root, [
    'import_statement',
    'import_from_statement',
  ])

  return importNodes.map(extractPythonImportInfo)
}

/**
 * Check if a Python function body is essentially empty
 * (only contains pass, ..., or docstrings).
 */
export function isPythonFunctionStub(funcInfo: {
  text: string
}): boolean {
  const text = funcInfo.text
  // Remove the def line
  const bodyLines = text.split('\n').slice(1).join('\n').trim()

  // Only pass or ellipsis
  if (/^(\s*(pass|\.\.\.)\s*)$/.test(bodyLines)) return true

  // Only a docstring
  const docstringOnly = bodyLines
    .replace(/"""[\s\S]*?"""/g, '')
    .replace(/'''[\s\S]*?'''/g, '')
    .trim()

  if (docstringOnly === '' || docstringOnly === 'pass' || docstringOnly === '...') {
    return true
  }

  return false
}

/**
 * Detect Python AI patterns in an AST.
 * Returns diagnostic-like findings for the ast-slop engine.
 */
export function detectPythonAIPatterns(root: ASTNode): Array<{
  type: string
  message: string
  line: number
}> {
  const findings: Array<{ type: string; message: string; line: number }> = []

  // Find stub functions (pass / ...)
  const functions = findPythonFunctions(root)
  for (const fn of functions) {
    if (isPythonFunctionStub(fn)) {
      findings.push({
        type: 'python-stub-function',
        message: `Function '${fn.name}' is a stub (only pass/ellipsis)`,
        line: fn.line,
      })
    }
  }

  // Find overly broad except handlers
  const tryNodes = findNodesOfType(root, 'try_statement')
  for (const tryNode of tryNodes) {
    const exceptNodes = tryNode.children.filter(
      (c) => c.type === 'except_clause'
    )
    for (const exceptNode of exceptNodes) {
      const hasSpecificType = exceptNode.children.some(
        (c) => c.type === 'identifier' || c.type === 'tuple'
      )
      if (!hasSpecificType) {
        findings.push({
          type: 'python-bare-except',
          message: 'Bare except clause catches all exceptions',
          line: exceptNode.startRow + 1,
        })
      }
    }
  }

  // Find TODO/FIXME stubs in comments
  const commentNodes = findNodesOfType(root, 'comment')
  for (const comment of commentNodes) {
    const text = comment.text.toLowerCase()
    if (/todo|fixme|hack|xxx/.test(text)) {
      findings.push({
        type: 'python-todo-stub',
        message: `TODO/FIXME comment: ${comment.text.trim()}`,
        line: comment.startRow + 1,
      })
    }
  }

  // Find print statements (AI debug leftovers)
  const callNodes = findNodesOfType(root, 'call')
  for (const call of callNodes) {
    const func = call.children[0]
    if (func && func.text === 'print') {
      findings.push({
        type: 'python-print-leftover',
        message: 'print() statement — likely debug leftover',
        line: call.startRow + 1,
      })
    }
  }

  return findings
}

// ── Internal helpers for Python AST ────────────────────

function extractPythonFunctionInfo(
  funcNode: ASTNode,
  decoratedParent?: ASTNode,
): {
  name: string
  decorators: string[]
  parameters: string[]
  isAsync: boolean
  line: number
  endLine: number
  text: string
} {
  const nameNode = funcNode.children.find((c) => c.fieldName === 'name')
    ?? funcNode.children.find((c) => c.type === 'identifier')
  const name = nameNode?.text ?? '(anonymous)'

  const params = funcNode.children.find(
    (c) => c.type === 'parameters'
  )
  const parameters = params
    ? params.children
        .filter((c) => c.type === 'identifier' || c.type === 'typed_parameter' || c.type === 'default_parameter')
        .map((c) => c.children[0]?.text ?? c.text)
    : []

  const isAsync = funcNode.children.some(
    (c) => c.type === 'async'
  )

  const decorators: string[] = []
  if (decoratedParent) {
    for (const child of decoratedParent.children) {
      if (child.type === 'decorator') {
        decorators.push(child.text.replace('@', ''))
      }
    }
  }

  return {
    name,
    decorators,
    parameters,
    isAsync,
    line: funcNode.startRow + 1,
    endLine: funcNode.endRow + 1,
    text: funcNode.text,
  }
}

function extractPythonClassInfo(
  classNode: ASTNode,
  decoratedParent?: ASTNode,
): {
  name: string
  bases: string[]
  decorators: string[]
  methods: {
    name: string
    decorators: string[]
    parameters: string[]
    isAsync: boolean
    line: number
    endLine: number
    text: string
  }[]
  line: number
  endLine: number
  text: string
} {
  const nameNode = classNode.children.find((c) => c.fieldName === 'name')
    ?? classNode.children.find((c) => c.type === 'identifier')
  const name = nameNode?.text ?? '(anonymous)'

  const argList = classNode.children.find(
    (c) => c.type === 'argument_list'
  )
  const bases = argList
    ? argList.children
        .filter((c) => c.type === 'identifier' || c.type === 'attribute')
        .map((c) => c.text)
    : []

  const decorators: string[] = []
  if (decoratedParent) {
    for (const child of decoratedParent.children) {
      if (child.type === 'decorator') {
        decorators.push(child.text.replace('@', ''))
      }
    }
  }

  // Find methods inside the class body
  const body = classNode.children.find(
    (c) => c.type === 'block'
  )
  const methods: {
    name: string
    decorators: string[]
    parameters: string[]
    isAsync: boolean
    line: number
    endLine: number
    text: string
  }[] = []
  if (body) {
    for (const child of body.children) {
      if (child.type === 'function_definition') {
        methods.push(extractPythonFunctionInfo(child))
      } else if (child.type === 'decorated_definition') {
        const inner = child.children.find(
          (c) => c.type === 'function_definition'
        )
        if (inner) {
          methods.push(extractPythonFunctionInfo(inner, child))
        }
      }
    }
  }

  return {
    name,
    bases,
    decorators,
    methods,
    line: classNode.startRow + 1,
    endLine: classNode.endRow + 1,
    text: classNode.text,
  }
}

function extractPythonImportInfo(importNode: ASTNode): {
  module: string
  symbols: string[]
  isFromImport: boolean
  line: number
  text: string
} {
  const isFromImport = importNode.type === 'import_from_statement'

  let module = ''
  const symbols: string[] = []

  if (isFromImport) {
    // from X import Y, Z
    const moduleNode = importNode.children.find(
      (c) => c.fieldName === 'module_name'
        || (c.type === 'dotted_name' && c.fieldName !== 'name')
        || (c.type === 'identifier' && c.fieldName !== 'name')
    )
    module = moduleNode?.text ?? ''

    const nameList = importNode.children.find(
      (c) => c.type === 'dotted_name' && c !== moduleNode
    )
    const identifierChildren = importNode.children.filter(
      (c) => c.type === 'identifier' && c !== moduleNode
    )

    if (nameList) {
      symbols.push(nameList.text)
    }
    for (const id of identifierChildren) {
      if (id.text !== 'from' && id.text !== 'import' && id.text !== module) {
        symbols.push(id.text)
      }
    }
  } else {
    // import X, Y
    const dottedNames = importNode.children.filter(
      (c) => c.type === 'dotted_name'
    )
    const identifiers = importNode.children.filter(
      (c) => c.type === 'identifier'
    )
    for (const dn of dottedNames) {
      symbols.push(dn.text)
    }
    for (const id of identifiers) {
      if (id.text !== 'import') {
        symbols.push(id.text)
      }
    }
    module = symbols[0] ?? ''
  }

  return {
    module,
    symbols,
    isFromImport,
    line: importNode.startRow + 1,
    text: importNode.text,
  }
}
