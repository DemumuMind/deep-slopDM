// ── Duplicate Import Rule ──────────────────────────
// Flags multiple import statements from the same module.

import type { Diagnostic } from '../../../types/index.js'
import { diag, type ParsedImport } from '../shared.js'

export function detectDuplicateImport(
  allImports: ParsedImport[],
  filePath: string,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = []
  const bySource = new Map<string, ParsedImport[]>()

  for (const imp of allImports) {
    const key = imp.source
    if (!bySource.has(key)) bySource.set(key, [])
    bySource.get(key)!.push(imp)
  }

  for (const [source, imports] of bySource) {
    if (imports.length < 2) continue

    const allSymbols: string[] = []
    const hasDefault = imports.some((imp) => imp.isDefault)

    for (const imp of imports) {
      for (const sym of imp.symbols) {
        if (!allSymbols.includes(sym)) allSymbols.push(sym)
      }
    }

    const namedSymbols = allSymbols.filter((s) => {
      if (hasDefault) {
        const defImp = imports.find((imp) => imp.isDefault)
        if (defImp && defImp.symbols[0] === s && s !== 'React') return false
      }
      return true
    })

    let merged: string
    if (hasDefault && namedSymbols.length > 0) {
      const defSym = imports.find((imp) => imp.isDefault)!.symbols[0]
      merged = `import ${defSym}, { ${namedSymbols.join(', ')} } from '${source}'`
    } else if (hasDefault) {
      const defSym = imports.find((imp) => imp.isDefault)!.symbols[0]
      merged = `import ${defSym} from '${source}'`
    } else {
      merged = `import { ${allSymbols.join(', ')} } from '${source}'`
    }

    const firstLine = Math.min(...imports.map((imp) => imp.line))
    const lastLine = Math.max(...imports.map((imp) => imp.line))
    const lastLineRaw = imports.find((imp) => imp.line === lastLine)!.raw
    const anyAST = imports.some((imp) => imp.viaAST)

    diagnostics.push(
      diag(filePath, 'import-intelligence/duplicate-import', 'suggestion',
        `Multiple import statements from '${source}' — merge into one`,
        firstLine,
        'Combine imports from the same module into a single statement.',
        {
          fixable: true,
          suggestion: {
            type: 'replace',
            text: merged,
            range: {
              startLine: firstLine,
              startCol: 1,
              endLine: lastLine,
              endCol: lastLineRaw.length + 1,
            },
            confidence: anyAST ? 0.93 : 0.9,
            reason: 'Multiple import statements from the same module are redundant and add visual noise. Merging them into a single line makes the dependency on that module clearer and is the conventional style.',
          },
          detail: {
            duplicateLines: imports.map((imp) => imp.line),
            mergedImport: merged,
            astConfirmed: anyAST,
          },
        },
      ),
    )
  }

  return diagnostics
}
