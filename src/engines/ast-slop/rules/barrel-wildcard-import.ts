// ── Barrel Wildcard Import Rule (AST-only) ──────────────────
// Detects wildcard imports from barrel files.

import type { Diagnostic } from '../../../types/index.js'
import { extractImportFromNode, findNodesOfType } from '../../../utils/tree-sitter/index.js'
import type { ASTNode } from '../../../utils/tree-sitter/index.js'
import { diag, isBarrelSource } from '../shared.js'

export function detectBarrelWildcardImport(
  ast: ASTNode,
  filePath: string,
): Diagnostic[] {
  const results: Diagnostic[] = []
  const importNodes = findNodesOfType(ast, 'import_statement')
  const importDeclNodes = findNodesOfType(ast, 'import_declaration')
  const allImports = [...importNodes, ...importDeclNodes]

  for (const impNode of allImports) {
    const info = extractImportFromNode(impNode)
    if (!info) continue

    if (impNode.text.includes('import *') && isBarrelSource(info.source)) {
      const line = info.line
      results.push(
        diag({
          filePath,
          rule: 'ast-slop/barrel-wildcard-import',
          severity: 'info',
          message: `Wildcard import from barrel file "${info.source}" — imports more than needed`,
          help: 'Use named imports instead of wildcard imports from barrel files. This improves tree-shaking and makes dependencies explicit.',
          line,
          column: 1,
          fixable: false,
          detail: { astConfirmed: true, source: info.source },
        }),
      )
    }
  }
  return results
}
