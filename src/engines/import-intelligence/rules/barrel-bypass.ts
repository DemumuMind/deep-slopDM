// ── Barrel Bypass Rule ────────────────────────────────
// Suggests importing directly from the source module instead of a barrel file.

import type { Diagnostic } from '../../../types/index.js'
import { diag, type ParsedImport, type BarrelFile } from '../shared.js'

export function detectBarrelBypass(
  parsed: ParsedImport,
  filePath: string,
  barrelCache: Map<string, BarrelFile>,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = []

  if (!parsed.source.startsWith('.')) return diagnostics

  const barrel = barrelCache.get(parsed.source)
  if (!barrel) return diagnostics

  const symbolToSource = new Map<string, string>()
  for (const reExport of barrel.reExports) {
    if (reExport.isWildcard) continue
    for (const sym of reExport.symbols) {
      const localName = sym.includes(' as ') ? sym.split(' as ')[1].trim() : sym
      symbolToSource.set(localName, reExport.source)
    }
  }

  const sourceGroups = new Map<string, string[]>()
  for (const sym of parsed.symbols) {
    const source = symbolToSource.get(sym)
    if (source && source !== '.') {
      if (!sourceGroups.has(source)) sourceGroups.set(source, [])
      sourceGroups.get(source)!.push(sym)
    }
  }

  if (sourceGroups.size > 0) {
    const replacementLines: string[] = []
    for (const [source, symbols] of sourceGroups) {
      replacementLines.push(`import { ${symbols.join(', ')} } from '${source}'`)
    }

    const hasTypeOnlyReExports = barrel.reExports.some((r) => r.isTypeOnly)
    const baseConfidence = parsed.viaAST || hasTypeOnlyReExports ? 0.78 : 0.7

    diagnostics.push(
      diag(filePath, 'import-intelligence/barrel-bypass', 'suggestion',
        `Import directly from source instead of barrel file '${parsed.source}'`,
        parsed.line,
        'Direct imports avoid the barrel file indirection, improving tree-shaking and build speed.',
        {
          fixable: true,
          suggestion: {
            type: 'replace',
            text: replacementLines.join('\n'),
            range: {
              startLine: parsed.line,
              startCol: 1,
              endLine: parsed.line,
              endCol: parsed.raw.length + 1,
            },
            confidence: baseConfidence,
            reason: 'Barrel files (index.ts re-exporting from sub-modules) prevent bundlers from tree-shaking effectively. Importing from the source module directly allows the bundler to only include what you actually use, and reduces module resolution overhead during builds.',
          },
          detail: {
            astConfirmed: parsed.viaAST,
            hasTypeOnlyReExports,
          },
        },
      ),
    )
  }

  return diagnostics
}
