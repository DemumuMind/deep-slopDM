// ── AST-Slop AST-Enhanced Detectors ──────────────────────────
// Tree-sitter based detectors that produce higher-confidence diagnostics and
// suppress false positives from the regex-only detectors.

import {
  findNodesOfType,
  isInsideCatch,
  getAsExpressionType,
  getAsExpressionContext,
  isCatchBodyEmpty,
  detectPythonAIPatterns,
  findPythonClasses,
  findPythonImports,
} from '../../utils/tree-sitter.js'
import type { ASTNode } from '../../utils/tree-sitter.js'
import type { Diagnostic, Severity } from '../../types/index.js'
import { diag } from './shared.js'

/** AST-enhanced empty catch detection. */
export function detectEmptyCatchAST(root: ASTNode, filePath: string): Diagnostic[] {
  const results: Diagnostic[] = []
  const catchNodes = findNodesOfType(root, 'catch_clause')

  for (const catchNode of catchNodes) {
    if (isCatchBodyEmpty(catchNode)) {
      const line = catchNode.startRow + 1
      const col = catchNode.startCol + 1
      const catchParam = catchNode.children.find((c) => c.type === 'identifier' || c.fieldName === 'parameter')
      const catchVar = catchParam?.text ?? 'error'

      results.push(
        diag({
          filePath,
          rule: 'ast-slop/swallowed-exception',
          severity: 'info',
          message: 'Swallowed exception: empty catch block (AST-confirmed)',
          help: 'Handle the error (log, rethrow, or recover). Empty catch blocks silently swallow errors, making bugs invisible.',
          line,
          column: col,
          fixable: true,
          suggestion: {
            type: 'insert',
            text: `  console.error(${catchVar});`,
            range: { startLine: line + 1, startCol: 1, endLine: line + 1, endCol: 1 },
            confidence: 0.85,
            reason: 'AST analysis confirms this catch block is empty. Add at least error logging.',
          },
          detail: { astConfirmed: true, catchVariable: catchVar },
        }),
      )
    }
  }
  return results
}

/** AST-enhanced `as any` detection. */
export function detectAsAnyAST(root: ASTNode, filePath: string): Diagnostic[] {
  const results: Diagnostic[] = []
  const asExpressions = findNodesOfType(root, 'as_expression')

  for (const asNode of asExpressions) {
    const type = getAsExpressionType(asNode)
    if (type !== 'any') continue

    const context = getAsExpressionContext(asNode)
    if (context === 'catch' || context === 'orm' || context === 'json') continue

    const line = asNode.startRow + 1
    const col = asNode.startCol + 1

    results.push(
      diag({
        filePath,
        rule: 'ast-slop/as-any',
        severity: 'warning',
        message: 'Unsafe cast: as any — opts out of type checking entirely (AST-confirmed, not in catch/ORM/JSON context)',
        help: 'Replace `as any` with a more specific type, a type guard, or `as unknown as SpecificType` if truly needed.',
        line,
        column: col,
        fixable: true,
        suggestion: {
          type: 'refactor',
          text: '/* replace with specific type */',
          confidence: 0.6,
          reason: 'AST analysis confirms `as any` outside acceptable catch/ORM/JSON contexts.',
        },
        detail: { astConfirmed: true, expressionContext: context },
      }),
    )
  }
  return results
}

/** AST-enhanced console.log leftover detection. */
export function detectConsoleLeftoversAST(root: ASTNode, filePath: string): Diagnostic[] {
  const results: Diagnostic[] = []
  if (/[/__]tests?[/__]/i.test(filePath)) return results
  if (/\.test\.(?:ts|tsx|js|jsx)$/.test(filePath)) return results
  if (/\.spec\.(?:ts|tsx|js|jsx)$/.test(filePath)) return results

  const callExprs = findNodesOfType(root, 'call_expression')

  for (const callNode of callExprs) {
    const text = callNode.text
    const logMatch = text.match(/^console\.(log|debug)\s*\(/)
    if (!logMatch) continue
    if (isInsideCatch(callNode)) continue

    const line = callNode.startRow + 1
    const col = callNode.startCol + 1

    results.push(
      diag({
        filePath,
        rule: 'ast-slop/console-leftover',
        severity: 'suggestion',
        message: `console.${logMatch[1]}() leftover — likely debugging artifact (AST-confirmed, not in catch block)`,
        help: 'Remove debug logging before committing. Use a proper logging library for production, or guard with environment checks.',
        line,
        column: col,
        fixable: true,
        suggestion: {
          type: 'delete',
          text: '',
          range: { startLine: line, startCol: 1, endLine: line, endCol: text.length + 1 },
          confidence: 0.9,
          reason: 'AST analysis confirms this console.log is not inside a catch block — it is a debugging artifact.',
        },
        detail: { astConfirmed: true },
      }),
    )
  }
  return results
}

/** AST-enhanced double assertion detection. */
export function detectDoubleAssertionAST(root: ASTNode, filePath: string): Diagnostic[] {
  const results: Diagnostic[] = []
  const asExpressions = findNodesOfType(root, 'as_expression')

  for (const asNode of asExpressions) {
    const type = getAsExpressionType(asNode)
    const innerAs = asNode.children.find((c) => c.type === 'as_expression')
    if (!innerAs) continue

    const innerType = getAsExpressionType(innerAs)
    if (innerType !== 'unknown') continue

    const line = asNode.startRow + 1
    const col = asNode.startCol + 1

    results.push(
      diag({
        filePath,
        rule: 'ast-slop/double-assertion',
        severity: 'warning',
        message: `Double type assertion: as unknown as ${type ?? 'unknown'} — bypasses type safety (AST-confirmed)`,
        help: 'Use a proper type guard, type predicate, or adjust the source/target types. Double assertions defeat the purpose of TypeScript.',
        line,
        column: col,
        fixable: true,
        suggestion: {
          type: 'refactor',
          text: `as ${type ?? 'SpecificType'}`,
          confidence: 0.5,
          reason: 'AST analysis confirms this is a double assertion bypassing the type system.',
        },
        detail: { astConfirmed: true, targetType: type },
      }),
    )
  }
  return results
}

/** Detect Python AI patterns using tree-sitter AST. */
export function detectPythonAIPatternsAST(root: ASTNode, filePath: string): Diagnostic[] {
  const diagnostics: Diagnostic[] = []
  const patterns = detectPythonAIPatterns(root)

  for (const p of patterns) {
    const rule = p.type === 'python-stub-function'
      ? 'ast-slop/placeholder-impl'
      : p.type === 'python-bare-except'
      ? 'ast-slop/swallowed-exception'
      : p.type === 'python-todo-stub'
      ? 'ast-slop/todo-stub'
      : p.type === 'python-print-leftover'
      ? 'ast-slop/console-leftover'
      : 'ast-slop/placeholder-impl'

    const severity: Severity = p.type === 'python-bare-except'
      ? 'warning'
      : p.type === 'python-print-leftover'
      ? 'warning'
      : p.type === 'python-stub-function'
      ? 'warning'
      : 'info'

    diagnostics.push(diag({
      filePath,
      rule,
      severity,
      message: p.message,
      help: p.type === 'python-stub-function'
        ? 'Replace stub with actual implementation or use abc.ABC for abstract methods.'
        : p.type === 'python-bare-except'
        ? 'Catch specific exceptions instead of bare except. Use `except Exception as e:` at minimum.'
        : p.type === 'python-todo-stub'
        ? 'Resolve the TODO/FIXME or remove the comment.'
        : 'Remove debug print() statements before committing.',
      line: p.line,
      column: 1,
      fixable: p.type === 'python-print-leftover' || p.type === 'python-stub-function',
      detail: { astConfirmed: true, patternType: p.type },
    }))
  }

  const classes = findPythonClasses(root)
  for (const cls of classes) {
    if (cls.methods.length === 0 && cls.bases.length === 0) {
      diagnostics.push(diag({
        filePath,
        rule: 'ast-slop/placeholder-impl',
        severity: 'info',
        message: `Class '${cls.name}' has no methods or base classes — likely a placeholder`,
        help: 'Implement the class, inherit from a base, or mark it as abstract with abc.ABC.',
        line: cls.line,
        column: 1,
        fixable: false,
        detail: { astConfirmed: true, patternType: 'python-empty-class' },
      }))
    }
  }

  const imports = findPythonImports(root)
  for (const imp of imports) {
    if (imp.symbols.includes('*')) {
      diagnostics.push(diag({
        filePath,
        rule: 'ast-slop/placeholder-impl',
        severity: 'info',
        message: `Wildcard import from '${imp.module}' — pollutes namespace`,
        help: 'Import only the specific symbols you need: `from module import symbol1, symbol2`',
        line: imp.line,
        column: 1,
        fixable: false,
        detail: { astConfirmed: true, patternType: 'python-wildcard-import' },
      }))
    }
  }

  return diagnostics
}
