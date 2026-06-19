import {
  type ASTNode,
  findNodesOfType,
  findNodesOfTypes,
  findAncestorOfType,
} from '../../utils/tree-sitter/index.js'
import type { Diagnostic } from '../../types/index.js'
import {
  makeDiagnostic,
  nodeLine,
  isInCatchOrFinally,
  isInArrowFunction,
  isGuardReturn,
  getSiblingsAfter,
  evaluateCondition,
  collectDeclarations,
  collectReferences,
  collectImports,
  collectExports,
  buildUnusedExportFix,
} from './helpers.js'

// ── AST-only: dead-after-throw ────────────────────────────

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
// ── AST-only: dead-after-return ───────────────────────────

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
// ── AST-only: dead-after-break ────────────────────────────

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
// ── AST-enhanced: unreachable-code (composite) ─────────────

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
  const declarations = collectDeclarations(ast)
  const references = collectReferences(ast)

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
// ── AST-enhanced: unused-export ──────────────────────────

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
    for (const [name, entries] of collectExports(ast, filePath)) {
      if (!exportMap.has(name)) exportMap.set(name, [])
      exportMap.get(name)!.push(...entries)
    }
    for (const sym of collectImports(ast)) {
      importedSymbols.add(sym)
    }
  }

  // Check each export
  for (const [name, entries] of exportMap) {
    // Skip PascalCase (React components)
    if (/^[A-Z]/.test(name)) continue
    // Skip Engine-named exports
    if (/Engine$/.test(name)) continue

    // Skip test utility files — their exports are used by .test.ts files
    // which may be excluded via .deep-slopignore
    if (entries.every((e) => /test-utils|test-helpers|test-setup|__tests__/i.test(e.filePath))) continue

    // Skip re-exports (export { X } from './mod.js') — these are barrel files
    // The original export is already checked
    if (entries.length === 1 && entries[0].filePath !== undefined) {
      const content = contents.get(entries[0].filePath)
      if (content) {
        const lines = content.split('\n')
        const exportLine = lines[entries[0].line - 1]
        if (exportLine && /\bexport\s*\{[^}]*\}\s*from\s*['"]/.test(exportLine)) continue
      }
    }

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
