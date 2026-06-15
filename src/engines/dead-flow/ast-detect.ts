import type { ASTNode } from '../../utils/tree-sitter.js'
import {
  parseFile,
  findNodesOfType,
  findNodesOfTypes,
  walkAST,
  isInsideFunction,
  findAncestor,
  findAncestorOfType,
  isInsideCatch,
  extractImportFromNode,
} from '../../utils/tree-sitter.js'
import type { Diagnostic } from '../../types/index.js'
import { toLines } from '../../utils/file-utils.js'

// ── Helpers ──────────────────────────────────────────────

function makeDiagnostic(
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

/** Get 1-indexed line from an AST node */
function nodeLine(node: ASTNode): number {
  return node.startRow + 1
}

/** Check if a node is inside a catch or finally clause */
function isInCatchOrFinally(node: ASTNode): boolean {
  return findAncestor(node, (n) =>
    n.type === 'catch_clause' || n.type === 'finally_clause',
  ) !== null
}

/** Check if a node is inside an arrow function body */
function isInArrowFunction(node: ASTNode): boolean {
  return findAncestor(node, (n) => n.type === 'arrow_function') !== null
}

/** Check if a return/throw is a guard return (inside an if without else, body is only terminators) */
function isGuardReturn(node: ASTNode): boolean {
  const ifAncestor = findAncestorOfType(node, 'if_statement')
  if (!ifAncestor) return false

  // Check there's no else clause
  const elseClause = ifAncestor.children.find((c) =>
    c.type === 'else' || c.type === 'else_clause',
  )
  if (elseClause) return false

  // Check the consequence body contains only terminators/comments
  const consequence = ifAncestor.children.find((c) =>
    c.type === 'statement_block' || c.type === 'consequence',
  )
  if (!consequence) {
    // Braceless if: if (cond) return;
    // The terminator IS the consequence
    return true
  }

  const nonTrivial = consequence.children.filter((c) =>
    c.type !== 'comment' &&
    c.type !== '{' &&
    c.type !== '}' &&
    c.text.trim() !== '' &&
    c.text.trim() !== ';',
  )

  // Filter out only terminators
  const terminators = nonTrivial.filter((c) =>
    c.type === 'return_statement' ||
    c.type === 'throw_statement',
  )

  return nonTrivial.length > 0 && nonTrivial.length === terminators.length
}

/** Get subsequent sibling statements after a terminator in the same block */
function getSiblingsAfter(node: ASTNode): ASTNode[] {
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

/** Evaluate whether an if condition is statically always truthy/falsy */
function evaluateCondition(conditionNode: ASTNode): 'always-truthy' | 'always-falsy' | 'unknown' {
  const text = conditionNode.text.trim()

  // Handle parenthesized expressions
  if (text.startsWith('(') && text.endsWith(')')) {
    const inner = conditionNode.children.find((c) =>
      c.type !== '(' && c.type !== ')',
    )
    if (inner) return evaluateCondition(inner)
  }

  // Unary NOT expressions
  if (conditionNode.type === 'unary_expression' && text.startsWith('!')) {
    const operand = conditionNode.children.find((c) => c.type !== '!')
    if (operand) {
      const inner = evaluateCondition(operand)
      if (inner === 'always-truthy') return 'always-falsy'
      if (inner === 'always-falsy') return 'always-truthy'
    }
  }

  // Literal boolean
  if (conditionNode.type === 'true') return 'always-truthy'
  if (conditionNode.type === 'false') return 'always-falsy'

  // Number literals
  if (conditionNode.type === 'number') {
    const num = parseFloat(text)
    return num === 0 ? 'always-falsy' : 'always-truthy'
  }

  // String literals
  if (conditionNode.type === 'string' || conditionNode.type === 'template_string') {
    // Empty string is falsy, non-empty is truthy
    const inner = text.replace(/^['"`]|['"`]$/g, '')
    return inner.length === 0 ? 'always-falsy' : 'unknown'
  }

  // null / undefined identifiers
  if (conditionNode.type === 'null' || text === 'undefined') {
    return 'always-falsy'
  }

  return 'unknown'
}

// ── Parse a file with tree-sitter ────────────────────────

export async function parseWithTreeSitter(
  content: string,
  filePath: string,
): Promise<ASTNode | null> {
  const isTsx = filePath.endsWith('.tsx')
  return parseFile(content, isTsx)
}

// ── AST-only: dead-after-throw ───────────────────────────

export function detectDeadAfterThrow(
  ast: ASTNode,
  filePath: string,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = []
  const throws = findNodesOfType(ast, 'throw_statement')

  for (const throwNode of throws) {
    // Skip if inside catch/finally
    if (isInCatchOrFinally(throwNode)) continue
    // Skip guard returns
    if (isGuardReturn(throwNode)) continue

    const after = getSiblingsAfter(throwNode)
    for (const dead of after) {
      diagnostics.push(
        makeDiagnostic({
          filePath,
          rule: 'dead-flow/dead-after-throw',
          message: `Unreachable code after throw on line ${nodeLine(throwNode)}`,
          line: nodeLine(dead),
          severity: 'error',
          help: `Remove the unreachable code after the throw statement on line ${nodeLine(throwNode)}`,
          suggestion: {
            type: 'delete',
            text: '',
            confidence: 0.95,
            reason: 'Code after throw in same block can never execute',
            range: {
              startLine: nodeLine(dead),
              startCol: dead.startCol + 1,
              endLine: dead.endRow + 1,
              endCol: dead.endCol + 1,
            },
          },
          detail: { terminatorKind: 'throw', terminatorLine: nodeLine(throwNode) },
        }),
      )
      break // Only flag first unreachable statement
    }
  }

  return diagnostics
}

// ── AST-only: dead-after-return ──────────────────────────

export function detectDeadAfterReturn(
  ast: ASTNode,
  filePath: string,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = []
  const returns = findNodesOfType(ast, 'return_statement')

  for (const returnNode of returns) {
    // Skip if inside catch/finally
    if (isInCatchOrFinally(returnNode)) continue
    // Skip arrow functions (return is from their own scope)
    if (isInArrowFunction(returnNode)) {
      // But still flag if there are siblings after the return in the same block
      // Only skip if the return is the entire arrow function body
      const arrowAncestor = findAncestorOfType(returnNode, 'arrow_function')
      if (arrowAncestor) {
        const body = arrowAncestor.children.find((c) =>
          c.type === 'statement_block',
        )
        if (body && body.children.includes(returnNode)) {
          // Return is inside an arrow function block body —
          // check if the return's parent statement_block is the arrow body
          if (returnNode.parent === body) {
            // Siblings after return in arrow body are unreachable
            const after = getSiblingsAfter(returnNode)
            for (const dead of after) {
              diagnostics.push(
                makeDiagnostic({
                  filePath,
                  rule: 'dead-flow/dead-after-return',
                  message: `Unreachable code after return on line ${nodeLine(returnNode)}`,
                  line: nodeLine(dead),
                  severity: 'warning',
                  help: `Remove the unreachable code after the return statement on line ${nodeLine(returnNode)}`,
                  suggestion: {
                    type: 'delete',
                    text: '',
                    confidence: 0.9,
                    reason: 'Code after return in same block can never execute',
                  },
                  detail: { terminatorKind: 'return', terminatorLine: nodeLine(returnNode) },
                }),
              )
              break
            }
          }
        }
      }
      continue
    }
    // Skip guard returns
    if (isGuardReturn(returnNode)) continue

    const after = getSiblingsAfter(returnNode)
    for (const dead of after) {
      diagnostics.push(
        makeDiagnostic({
          filePath,
          rule: 'dead-flow/dead-after-return',
          message: `Unreachable code after return on line ${nodeLine(returnNode)}`,
          line: nodeLine(dead),
          severity: 'warning',
          help: `Remove the unreachable code after the return statement on line ${nodeLine(returnNode)}`,
          suggestion: {
            type: 'delete',
            text: '',
            confidence: 0.9,
            reason: 'Code after return in same block can never execute',
          },
          detail: { terminatorKind: 'return', terminatorLine: nodeLine(returnNode) },
        }),
      )
      break
    }
  }

  return diagnostics
}

// ── AST-only: dead-after-break ───────────────────────────

export function detectDeadAfterBreak(
  ast: ASTNode,
  filePath: string,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = []
  const breaks = findNodesOfTypes(ast, ['break_statement', 'continue_statement'])

  for (const breakNode of breaks) {
    const after = getSiblingsAfter(breakNode)
    for (const dead of after) {
      const kind = breakNode.type === 'break_statement' ? 'break' : 'continue'
      diagnostics.push(
        makeDiagnostic({
          filePath,
          rule: 'dead-flow/dead-after-break',
          message: `Unreachable code after ${kind} on line ${nodeLine(breakNode)}`,
          line: nodeLine(dead),
          severity: 'error',
          help: `Remove the unreachable code after the ${kind} statement on line ${nodeLine(breakNode)}`,
          suggestion: {
            type: 'delete',
            text: '',
            confidence: 0.95,
            reason: `Code after ${kind} in same block can never execute`,
          },
          detail: { terminatorKind: kind, terminatorLine: nodeLine(breakNode) },
        }),
      )
      break
    }
  }

  return diagnostics
}

// ── AST-enhanced: unreachable-code (composite) ───────────

export function detectUnreachableAfterTerminatorAST(
  ast: ASTNode,
  filePath: string,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = []

  // Collect all terminator statements
  const terminators = findNodesOfTypes(ast, [
    'return_statement',
    'throw_statement',
    'break_statement',
    'continue_statement',
  ])

  for (const term of terminators) {
    // Skip inside catch/finally
    if (isInCatchOrFinally(term)) continue
    // Skip guard returns
    if (
      (term.type === 'return_statement' || term.type === 'throw_statement') &&
      isGuardReturn(term)
    ) continue

    const after = getSiblingsAfter(term)
    if (after.length === 0) continue

    const kind = term.type === 'return_statement' ? 'return'
      : term.type === 'throw_statement' ? 'throw'
      : term.type === 'break_statement' ? 'break'
      : 'continue'

    const severity: 'warning' | 'error' =
      kind === 'return' ? 'warning' : 'error'

    diagnostics.push(
      makeDiagnostic({
        filePath,
        rule: 'dead-flow/unreachable-after-terminator',
        message: `Unreachable code after ${kind} on line ${nodeLine(term)}`,
        line: nodeLine(after[0]),
        severity,
        help: `Remove or move the unreachable code after the ${kind} statement on line ${nodeLine(term)}`,
        suggestion: {
          type: 'delete',
          text: '',
          confidence: 0.9,
          reason: `Code after ${kind} can never execute`,
          range: {
            startLine: nodeLine(after[0]),
            startCol: after[0].startCol + 1,
            endLine: after[0].endRow + 1,
            endCol: after[0].endCol + 1,
          },
        },
        detail: { terminatorKind: kind, terminatorLine: nodeLine(term) },
      }),
    )
  }

  return diagnostics
}

// ── AST-enhanced: unused-variable ────────────────────────

export function detectUnusedVariablesAST(
  ast: ASTNode,
  filePath: string,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = []

  // Track declarations: name -> { node, line, isExported, isParameter, isType }
  const declarations = new Map<string, {
    node: ASTNode
    line: number
    isExported: boolean
    isParameter: boolean
    isType: boolean
    isFunction: boolean
  }>()

  // Collect variable declarations
  const lexicalDecls = findNodesOfTypes(ast, ['lexical_declaration', 'variable_declaration'])
  for (const decl of lexicalDecls) {
    const isExported = findAncestor(decl, (n) =>
      n.type === 'export_statement',
    ) !== null

    for (const child of decl.children) {
      if (child.type !== 'variable_declarator') continue
      const nameNode = child.children.find((c) =>
        c.type === 'identifier' && c.fieldName === 'name',
      ) || child.children.find((c) => c.type === 'identifier')
      if (!nameNode) continue

      const name = nameNode.text
      // Skip destructured patterns — too complex for simple analysis
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

  // Collect function declarations
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

    const isExported = findAncestor(fn, (n) =>
      n.type === 'export_statement',
    ) !== null

    declarations.set(nameNode.text, {
      node: fn,
      line: nodeLine(nameNode),
      isExported,
      isParameter: false,
      isType: false,
      isFunction: true,
    })
  }

  // Collect type/interface declarations
  const typeDecls = findNodesOfTypes(ast, ['type_alias_declaration', 'interface_declaration'])
  for (const td of typeDecls) {
    const nameNode = td.children.find((c) =>
      c.type === 'type_identifier',
    )
    if (!nameNode) continue

    const isExported = findAncestor(td, (n) =>
      n.type === 'export_statement',
    ) !== null

    declarations.set(nameNode.text, {
      node: td,
      line: nodeLine(nameNode),
      isExported,
      isParameter: false,
      isType: true,
      isFunction: false,
    })
  }

  // Collect function parameters
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

  // Collect all reference identifiers (not in declaration position)
  const references = new Set<string>()
  walkAST(ast, (node) => {
    if (node.type !== 'identifier') return

    // Skip if this identifier IS the declaration name
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

  // Check each declaration
  for (const [name, info] of declarations) {
    // Skip underscore-prefixed (intentionally unused)
    if (name.startsWith('_')) continue
    // Skip exported items
    if (info.isExported) continue
    // Skip type declarations
    if (info.isType) continue
    // Skip function parameters (hard to track scoping accurately)
    if (info.isParameter) continue
    // Skip React components (PascalCase convention)
    if (/^[A-Z]/.test(name) && info.isFunction) continue

    if (!references.has(name)) {
      diagnostics.push(
        makeDiagnostic({
          filePath,
          rule: 'dead-flow/unused-variable',
          message: `Variable \`${name}\` is declared but never used`,
          line: info.line,
          severity: 'suggestion',
          fixable: true,
          help: `Remove the unused variable \`${name}\` or prefix with _ if intentionally unused`,
          suggestion: {
            type: 'delete',
            text: '',
            confidence: 0.8,
            reason: `Variable \`${name}\` is never referenced after its declaration (AST-verified)`,
          },
          detail: { variableName: name, source: 'ast' },
        }),
      )
    }
  }

  return diagnostics
}

// ── AST-enhanced: unused-export ───────────────────────

const DECLARATION_EXPORT_RE = /^\s*(?:export\s+)?(?:async\s+)?(?:function|const|let|var|class|interface|type|enum)\b/

function buildUnusedExportFix(
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

export function detectUnusedExportsAST(
  astMap: Map<string, ASTNode>,
  contents: Map<string, string>,
  rootDir: string,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = []

  // Build export map: symbol name -> { filePath, line }
  const exportMap = new Map<string, Array<{ filePath: string; line: number }>>()

  // Build import set: all imported symbol names
  const importedSymbols = new Set<string>()

  for (const [filePath, ast] of astMap) {
    // Collect exports from AST
    const exportStmts = findNodesOfType(ast, 'export_statement')
    for (const exp of exportStmts) {
      // Named exports: export function foo, export const bar, etc.
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
        // Skip default exports
        if (exp.text.includes('export default')) continue
        // Skip type exports
        if (decl.type === 'type_alias_declaration' || decl.type === 'interface_declaration') continue

        if (!exportMap.has(name)) exportMap.set(name, [])
        exportMap.get(name)!.push({ filePath, line: nodeLine(nameNode) })
      }

      // export { foo, bar }
      const exportSpecifiers = findNodesOfType(exp, 'export_specifier')
      for (const spec of exportSpecifiers) {
        const nameNode = spec.children.find((c) => c.type === 'identifier')
        if (!nameNode) continue
        const name = nameNode.text
        if (!exportMap.has(name)) exportMap.set(name, [])
        exportMap.get(name)!.push({ filePath, line: nodeLine(spec) })
      }
    }

    // Collect imports from AST
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
      }
    }

    // Also scan for dynamic import patterns in call expressions
    const callExprs = findNodesOfType(ast, 'call_expression')
    for (const call of callExprs) {
      const func = call.children[0]
      if (func && func.type === 'import') {
        // Dynamic import — try to extract property accesses from .then()
        const thenMatch = call.text.match(/\.then\s*\(\s*\((\w+)\)\s*=>\s*\1\.(\w+)/)
        if (thenMatch) importedSymbols.add(thenMatch[2])
        const thenMatch2 = call.text.match(/\.then\s*\(\s*(\w+)\s*=>\s*\1\.(\w+)/)
        if (thenMatch2) importedSymbols.add(thenMatch2[2])
      }
    }
  }

  // Check each export
  for (const [name, entries] of exportMap) {
    // Skip PascalCase (React components)
    if (/^[A-Z]/.test(name)) continue
    // Skip Engine-named exports
    if (/Engine$/.test(name)) continue

    if (!importedSymbols.has(name)) {
      for (const entry of entries) {
        const { fixable, suggestion } = buildUnusedExportFix(entry.filePath, entry.line, contents, name)
        diagnostics.push(
          makeDiagnostic({
            filePath: entry.filePath,
            rule: 'dead-flow/unused-export',
            message: `Exported \`${name}\` is never imported by any other file`,
            line: entry.line,
            severity: 'info',
            fixable,
            help: `Consider removing the unused export \`${name}\` or adding it to the public API explicitly`,
            suggestion,
            detail: { symbolName: name, source: 'ast' },
          }),
        )
      }
    }
  }

  return diagnostics
}

// ── AST-enhanced: dead-branch (if(false)/if(0)/if('')) ─────────

export function detectDeadBranchesAST(
  ast: ASTNode,
  filePath: string,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = []
  const ifStmts = findNodesOfType(ast, 'if_statement')

  for (const ifStmt of ifStmts) {
    // Find the condition node
    const conditionNode = ifStmt.children.find((c) =>
      c.type === 'parenthesized_expression',
    )
    if (!conditionNode) continue

    // Get the inner expression (skip parens)
    const innerExpr = conditionNode.children.find((c) =>
      c.type !== '(' && c.type !== ')',
    )
    if (!innerExpr) continue

    const eval_ = evaluateCondition(innerExpr)
    if (eval_ === 'unknown') continue

    const deadBranch = eval_ === 'always-falsy' ? 'then' : 'else'
    const branchDesc = deadBranch === 'then' ? 'if-block' : 'else-block'
    const conditionText = conditionNode.text.replace(/^\(|\)$/g, '').trim()

    diagnostics.push(
      makeDiagnostic({
        filePath,
        rule: 'dead-flow/dead-conditional',
        message: `Condition \`${conditionText}\` is always ${eval_ === 'always-falsy' ? 'falsy' : 'truthy'}, making the ${branchDesc} unreachable`,
        line: nodeLine(ifStmt),
        severity: 'warning',
        help: `Simplify the conditional — the ${branchDesc} can never execute`,
        suggestion: {
          type: 'refactor',
          text: deadBranch === 'else'
            ? '// remove else branch, keep if-body'
            : '// remove if block, keep else body as direct code',
          confidence: 0.85,
          reason: `Condition is statically determined to always be ${eval_ === 'always-falsy' ? 'falsy' : 'truthy'} (AST-verified)`,
        },
        detail: { condition: conditionText, deadBranch, source: 'ast' },
      }),
    )
  }

  return diagnostics
}

// ── All AST detections combined ──────────────────────────

export interface ASTDetectionResult {
  diagnostics: Diagnostic[]
  /** Rules that were successfully run via AST */
  astRules: Set<string>
  /** Whether AST parsing succeeded */
  astAvailable: boolean
}

/**
 * Run all AST-enhanced detections on a single file.
 * Returns null if tree-sitter is unavailable.
 */
export async function detectAllAST(
  content: string,
  filePath: string,
): Promise<ASTDetectionResult | null> {
  const ast = await parseWithTreeSitter(content, filePath)
  if (!ast) return null

  const diagnostics: Diagnostic[] = []
  const astRules = new Set<string>()

  // AST-only rules
  const deadThrow = detectDeadAfterThrow(ast, filePath)
  diagnostics.push(...deadThrow)
  if (deadThrow.length > 0) astRules.add('dead-after-throw')

  const deadReturn = detectDeadAfterReturn(ast, filePath)
  diagnostics.push(...deadReturn)
  if (deadReturn.length > 0) astRules.add('dead-after-return')

  const deadBreak = detectDeadAfterBreak(ast, filePath)
  diagnostics.push(...deadBreak)
  if (deadBreak.length > 0) astRules.add('dead-after-break')

  // AST-enhanced rules (supersede regex versions)
  const unreachable = detectUnreachableAfterTerminatorAST(ast, filePath)
  diagnostics.push(...unreachable)
  astRules.add('unreachable-after-terminator')

  const unusedVars = detectUnusedVariablesAST(ast, filePath)
  diagnostics.push(...unusedVars)
  astRules.add('unused-variable')

  const deadBranches = detectDeadBranchesAST(ast, filePath)
  diagnostics.push(...deadBranches)
  astRules.add('dead-conditional')

  return { diagnostics, astRules, astAvailable: true }
}

/**
 * Run AST cross-file detections (unused exports).
 * Returns null if tree-sitter is unavailable.
 */
export async function detectUnusedExportsASTWrapper(
  astMap: Map<string, ASTNode>,
  contents: Map<string, string>,
  rootDir: string,
): Promise<Diagnostic[] | null> {
  if (astMap.size === 0) return null
  return detectUnusedExportsAST(astMap, contents, rootDir)
}

