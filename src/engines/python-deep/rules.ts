import type { Diagnostic } from '../../types/index.js'
import { findNodesOfType, findNodesOfTypes, type ASTNode } from '../../utils/tree-sitter/index.js'
import {
  getNameNode,
  getBodyNode,
  getParametersNode,
  getReturnTypeNode,
  isPublicName,
  isDocstring,
  hasDocstring,
  isPassStub,
  extractParamName,
  isParamTyped,
  getDefaultValue,
  findExceptExpression,
  isLoggingCall,
  containsFString,
  makeDiagnostic,
  LOGGING_PREFIX_RE,
} from './helpers.js'

export const ENGINE_NAME = 'python-deep' as const

export function analyzeWithAST(filePath: string, root: ASTNode): Diagnostic[] {
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

    if (isLoggingCall(call, LOGGING_PREFIX_RE) && containsFString(call)) {
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
