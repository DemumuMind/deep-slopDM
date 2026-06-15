// ── Barrel Type Import Rule (AST-only) ─────────────────────
// Detects type-only imports from barrel files.

import type { Diagnostic } from '../../../types/index.js'
import { extractImportFromNode, findNodesOfType } from '../../../utils/tree-sitter/index.js'
import type { ASTNode } from '../../../utils/tree-sitter/index.js'
import { diag, isBarrelSource } from '../shared.js'

export function detectBarrelTypeImport(
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

    if (info.isTypeOnly && isBarrelSource(info.source)) {
      const line = info.line
      results.push(
        diag({
          filePath,
          rule: 'ast-slop/barrel-type-import',
          severity: 'info',
          message: `Type-only import from barrel file "${info.source}" — consider importing directly from the source module`,
          help: 'Import types directly from their source module instead of through a barrel (index) file. This reduces coupling and improves tree-shaking.',
          line,
          column: 1,
          fixable: false,
          detail: { astConfirmed: true, source: info.source, symbols: info.symbols, isTypeOnly: info.isTypeOnly },
        }),
      )
    }
  }
  return results
}
