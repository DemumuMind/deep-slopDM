import {
  type ASTNode,
  findNodesOfType,
  findNodesOfTypes,
  walkAST,
  findAncestor,
  findAncestorOfType,
  extractImportFromNode,
} from '../../utils/tree-sitter/index.js'
import type { Diagnostic } from '../../types/index.js'
import { toLines } from '../../utils/file-utils.js'

// ── Basic helpers ────────────────────────────────────────

export function makeDiagnostic(
  overrides: Partial<Diagnostic> & Pick<Diagnostic, 'filePath' | 'rule' | 'message' | 'line'>,
): Diagnostic {
  return {
    engine: 'dead-flow',
    severity: 'warning',
    column: 1,
    category: 'dead-code',
    fixable: true,
    help: '',
    ...overrides,
  }
}

export function nodeLine(node: ASTNode): number {
  return node.startRow + 1
}

export function isInCatchOrFinally(node: ASTNode): boolean {
  return findAncestor(node, (n) =>
    n.type === 'catch_clause' || n.type === 'finally_clause',
  ) !== null
}

export function isInArrowFunction(node: ASTNode): boolean {
  return findAncestor(node, (n) => n.type === 'arrow_function') !== null
}

export function isGuardReturn(node: ASTNode): boolean {
  const ifAncestor = findAncestorOfType(node, 'if_statement')
  if (!ifAncestor) return false

  const elseClause = ifAncestor.children.find((c) =>
    c.type === 'else' || c.type === 'else_clause',
  )
  if (elseClause) return false

  const consequence = ifAncestor.children.find((c) =>
    c.type === 'statement_block' || c.type === 'consequence',
  )
  if (!consequence) return true

  const nonTrivial = consequence.children.filter((c) =>
    c.type !== 'comment' &&
    c.type !== '{' &&
    c.type !== '}' &&
    c.text.trim() !== '' &&
    c.text.trim() !== ';',
  )

  const terminators = nonTrivial.filter((c) =>
    c.type === 'return_statement' ||
    c.type === 'throw_statement',
  )

  return nonTrivial.length > 0 && nonTrivial.length === terminators.length
}

export function getSiblingsAfter(node: ASTNode): ASTNode[] {
  const parent = node.parent
  if (!parent) return []

  const siblings = parent.children
  const idx = siblings.indexOf(node)
  if (idx < 0) return []

  return siblings.slice(idx + 1).filter((s) =>
    s.type !== 'comment' &&
    s.type !== '{' &&
    s.type !== '}' &&
    s.text.trim() !== '' &&
    s.text.trim() !== ';',
  )
}

export function evaluateCondition(conditionNode: ASTNode): 'always-truthy' | 'always-falsy' | 'unknown' {
  const text = conditionNode.text.trim()

  if (text.startsWith('(') && text.endsWith(')')) {
    const inner = conditionNode.children.find((c) =>
      c.type !== '(' && c.type !== ')',
    )
    if (inner) return evaluateCondition(inner)
  }

  if (conditionNode.type === 'unary_expression' && text.startsWith('!')) {
    const operand = conditionNode.children.find((c) => c.type !== '!')
    if (operand) {
      const inner = evaluateCondition(operand)
      if (inner === 'always-truthy') return 'always-falsy'
      if (inner === 'always-falsy') return 'always-truthy'
    }
  }

  if (conditionNode.type === 'true') return 'always-truthy'
  if (conditionNode.type === 'false') return 'always-falsy'

  if (conditionNode.type === 'number') {
    const num = parseFloat(text)
    return num === 0 ? 'always-falsy' : 'always-truthy'
  }

  if (conditionNode.type === 'string' || conditionNode.type === 'template_string') {
    const inner = text.replace(/^['"`]|['"`]$/g, '')
    return inner.length === 0 ? 'always-falsy' : 'unknown'
  }

  if (conditionNode.type === 'null' || text === 'undefined') {
    return 'always-falsy'
  }

  return 'unknown'
}

// ── Declaration/reference collection for unused-variable rule ──

export function collectDeclarations(ast: ASTNode) {
  const declarations = new Map<string, {
    node: ASTNode
    line: number
    isExported: boolean
    isParameter: boolean
    isType: boolean
    isFunction: boolean
  }>()

  const lexicalDecls = findNodesOfTypes(ast, ['lexical_declaration', 'variable_declaration'])
  for (const decl of lexicalDecls) {
    const isExported = findAncestor(decl, (n) => n.type === 'export_statement') !== null
    for (const child of decl.children) {
      if (child.type !== 'variable_declarator') continue
      const nameNode = child.children.find((c) =>
        c.type === 'identifier' && c.fieldName === 'name',
      ) || child.children.find((c) => c.type === 'identifier')
      if (!nameNode) continue

      const name = nameNode.text
      if (name.includes(',') || name.includes('{') || name.includes('[')) continue

      declarations.set(name, {
        node: child,
        line: nodeLine(nameNode),
        isExported,
        isParameter: false,
        isType: false,
        isFunction: false,
      })
    }
  }

  const funcDecls = findNodesOfTypes(ast, [
    'function_declaration',
    'generator_function_declaration',
    'method_definition',
  ])
  for (const fn of funcDecls) {
    const nameNode = fn.children.find((c) =>
      c.type === 'identifier' || c.type === 'property_identifier',
    )
    if (!nameNode) continue

    const isExported = findAncestor(fn, (n) => n.type === 'export_statement') !== null
    declarations.set(nameNode.text, {
      node: fn,
      line: nodeLine(nameNode),
      isExported,
      isParameter: false,
      isType: false,
      isFunction: true,
    })
  }

  const typeDecls = findNodesOfTypes(ast, ['type_alias_declaration', 'interface_declaration'])
  for (const td of typeDecls) {
    const nameNode = td.children.find((c) => c.type === 'type_identifier')
    if (!nameNode) continue

    const isExported = findAncestor(td, (n) => n.type === 'export_statement') !== null
    declarations.set(nameNode.text, {
      node: td,
      line: nodeLine(nameNode),
      isExported,
      isParameter: false,
      isType: true,
      isFunction: false,
    })
  }

  const params = findNodesOfTypes(ast, [
    'required_parameter',
    'optional_parameter',
    'rest_parameter',
  ])
  for (const param of params) {
    const nameNode = param.children.find((c) =>
      c.type === 'identifier' && c.fieldName === 'name',
    ) || param.children.find((c) => c.type === 'identifier')
    if (!nameNode) continue

    declarations.set(nameNode.text, {
      node: param,
      line: nodeLine(nameNode),
      isExported: false,
      isParameter: true,
      isType: false,
      isFunction: false,
    })
  }

  return declarations
}

export function collectReferences(ast: ASTNode): Set<string> {
  const references = new Set<string>()
  walkAST(ast, (node) => {
    if (node.type !== 'identifier') return

    const isDeclName = node.fieldName === 'name' &&
      node.parent &&
      (
        node.parent.type === 'variable_declarator' ||
        node.parent.type === 'function_declaration' ||
        node.parent.type === 'generator_function_declaration' ||
        node.parent.type === 'method_definition' ||
        node.parent.type === 'required_parameter' ||
        node.parent.type === 'optional_parameter' ||
        node.parent.type === 'rest_parameter' ||
        node.parent.type === 'type_alias_declaration' ||
        node.parent.type === 'interface_declaration' ||
        node.parent.type === 'class_declaration' ||
        node.parent.type === 'import_specifier' ||
        node.parent.type === 'export_specifier'
      )

    if (!isDeclName) {
      references.add(node.text)
    }
  })
  return references
}

// ── Import/export collection for unused-export rule ────

export function collectImports(ast: ASTNode): Set<string> {
  const importedSymbols = new Set<string>()

  const importStmts = findNodesOfTypes(ast, [
    'import_statement',
    'import_declaration',
  ])
  for (const imp of importStmts) {
    const info = extractImportFromNode(imp)
    if (info) {
      for (const sym of info.symbols) {
        importedSymbols.add(sym)
      }
      // Also collect original exported names for aliased imports
      // `import { X as Y }` -> add both X (original) and Y (local alias)
      const specifiers = findNodesOfType(imp, 'import_specifier')
      for (const spec of specifiers) {
        const ids = spec.children.filter(
          (c) => c.type === 'identifier' || c.type === 'type_identifier',
        )
        if (ids.length >= 2) {
          // `import { X as Y }` — X is the original exported name
          importedSymbols.add(ids[0].text)
        }
      }
    }
  }

  // Collect re-export symbols: `export { X } from './mod.js'`
  // These act as imports — X is imported from ./mod.js and re-exported
  const exportStmts = findNodesOfType(ast, 'export_statement')
  for (const exp of exportStmts) {
    // Check if this is a re-export (has a 'from' clause)
    const sourceNode = exp.children.find(
      (c) => c.type === 'string' || c.fieldName === 'source',
    )
    if (!sourceNode) continue

    const exportSpecifiers = findNodesOfType(exp, 'export_specifier')
    for (const spec of exportSpecifiers) {
      const ids = spec.children.filter(
        (c) => c.type === 'identifier' || c.type === 'type_identifier',
      )
      // For `export { X as Y } from '...'`, X is the original imported name
      // For `export { X } from '...'`, X is both imported and exported
      const name = ids[0]?.text
      if (name) importedSymbols.add(name)
    }
  }

  const callExprs = findNodesOfType(ast, 'call_expression')
  for (const call of callExprs) {
    const func = call.children[0]
    if (func && func.type === 'import') {
      // .then((mod) => mod.func) — check text up the tree
      const fullText = call.text
      const thenMatch = fullText.match(/\.then\s*\(\s*\((\w+)\)\s*=>\s*\1\.(\w+)/)
      if (thenMatch) importedSymbols.add(thenMatch[2])
      const thenMatch2 = fullText.match(/\.then\s*\(\s*(\w+)\s*=>\s*\1\.(\w+)/)
      if (thenMatch2) importedSymbols.add(thenMatch2[2])
    }
    // Broader: check any call_expression containing import() + .then() with destructuring
    // This catches: import('...').then(({ X }) => ...)
    if (call.text.includes('import(') && call.text.includes('.then(')) {
      const thenDestructureMatch = call.text.match(/\.then\s*\(\s*\(\s*\{([^}]+)\}\s*\)/)
      if (thenDestructureMatch) {
        const names = thenDestructureMatch[1].split(',').map((s) => s.trim().split(/\s+as\s+/)[0].trim()).filter(Boolean)
        for (const name of names) importedSymbols.add(name)
      }
      // .then(mod => mod.func)
      const thenModMatch = call.text.match(/\.then\s*\(\s*(\w+)\s*=>\s*\1\.(\w+)/)
      if (thenModMatch) importedSymbols.add(thenModMatch[2])
    }
  }

  // Handle: const { X, Y } = await import('...')
  // Walk for lexical_declaration containing await import() with destructuring
  const lexicalDecls = findNodesOfTypes(ast, ['lexical_declaration', 'variable_declaration'])
  for (const decl of lexicalDecls) {
    const text = decl.text
    // Check if this declaration contains `await import(...)` or `import(...)`
    if (/\bawait\s+import\s*\(/.test(text) || /\bimport\s*\(/.test(text)) {
      // Extract destructured names: const { X, Y } = ...
      const destructureMatch = text.match(/\{\s*([^}]+)\s*\}\s*=\s*(?:await\s+)?import\s*\(/)
      if (destructureMatch) {
        const names = destructureMatch[1].split(',').map((s) => s.trim().split(/\s+as\s+/)[0].trim()).filter(Boolean)
        for (const name of names) importedSymbols.add(name)
      }
    }
  }

  return importedSymbols
}

export function collectExports(
  ast: ASTNode,
  filePath: string,
): Map<string, Array<{ filePath: string; line: number }>> {
  const exportMap = new Map<string, Array<{ filePath: string; line: number }>>()

  const exportStmts = findNodesOfType(ast, 'export_statement')
  for (const exp of exportStmts) {
    const declChildren = exp.children.filter((c) =>
      c.type === 'lexical_declaration' ||
      c.type === 'variable_declaration' ||
      c.type === 'function_declaration' ||
      c.type === 'class_declaration' ||
      c.type === 'generator_function_declaration' ||
      c.type === 'type_alias_declaration' ||
      c.type === 'interface_declaration',
    )

    for (const decl of declChildren) {
      const nameNode = decl.children.find((c) =>
        c.type === 'identifier' || c.type === 'type_identifier',
      )
      if (!nameNode) continue

      const name = nameNode.text
      if (exp.text.includes('export default')) continue
      if (decl.type === 'type_alias_declaration' || decl.type === 'interface_declaration') continue

      if (!exportMap.has(name)) exportMap.set(name, [])
      exportMap.get(name)!.push({ filePath, line: nodeLine(nameNode) })
    }

    const exportSpecifiers = findNodesOfType(exp, 'export_specifier')
    for (const spec of exportSpecifiers) {
      const nameNode = spec.children.find((c) => c.type === 'identifier')
      if (!nameNode) continue
      const name = nameNode.text
      if (!exportMap.has(name)) exportMap.set(name, [])
      exportMap.get(name)!.push({ filePath, line: nodeLine(spec) })
    }
  }

  return exportMap
}

// ── Unused-export fix helper ─────────────────────────────

export const DECLARATION_EXPORT_RE = /^\s*(?:export\s+)?(?:async\s+)?(?:function|const|let|var|class|interface|type|enum)\b/

export function buildUnusedExportFix(
  filePath: string,
  line: number,
  contents: Map<string, string>,
  symbolName: string,
): { fixable: boolean; suggestion?: Diagnostic['suggestion'] } {
  const content = contents.get(filePath)
  if (!content) {
    return {
      fixable: false,
      suggestion: {
        type: 'refactor',
        text: `// deep-slop-suppress: unused-export ${symbolName}`,
        confidence: 0.5,
        reason: 'Could not read the original source line; suppress instead of auto-removing export.',
      },
    }
  }

  const lines = toLines(content)
  const originalLine = lines.find((l) => l.num === line)?.text
  if (!originalLine || !DECLARATION_EXPORT_RE.test(originalLine)) {
    return {
      fixable: false,
      suggestion: {
        type: 'refactor',
        text: `// deep-slop-suppress: unused-export ${symbolName}`,
        confidence: 0.5,
        reason: 'The export is not a simple declaration (e.g., export { ... }); remove or suppress manually.',
      },
    }
  }

  const fixedLine = originalLine.replace(/^(\s*)export\s+/, '$1')
  return {
    fixable: true,
    suggestion: {
      type: 'replace',
      text: fixedLine,
      range: {
        startLine: line,
        startCol: 1,
        endLine: line,
        endCol: originalLine.length + 1,
      },
      confidence: 0.8,
      reason: `Exported ${symbolName} is unused; removing the export keyword makes it module-private.`,
    },
  }
}
