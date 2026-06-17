// ── Unused Import Rule ─────────────────────────────
// Flags import statements where every symbol is unused.

import type { Diagnostic } from '../../../types/index.js'
import {
  diag,
  isSymbolUsed,
  type ParsedImport,
  DRIZZLE_FP_SYMBOLS,
  DRIZZLE_PACKAGES,
} from '../shared.js'

export function detectUnusedImport(
  parsed: ParsedImport,
  filePath: string,
  fileContent: string,
  astUsedSymbols?: Set<string>,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = []
  if (parsed.isSideEffect || parsed.isNamespace || parsed.isDynamic) return diagnostics

  const unusedSymbols: string[] = []

  for (const sym of parsed.symbols) {
    if (DRIZZLE_FP_SYMBOLS.has(sym) && DRIZZLE_PACKAGES.has(parsed.source.split('/').slice(0, 2).join('/'))) {
      continue
    }

    if (astUsedSymbols !== undefined && parsed.viaAST) {
      if (!astUsedSymbols.has(sym)) {
        unusedSymbols.push(sym)
      }
    } else {
      const bodyAfterImports = fileContent.split('\n').slice(parsed.line).join('\n')
      if (!isSymbolUsed(sym, bodyAfterImports)) {
        unusedSymbols.push(sym)
      }
    }
  }

  if (unusedSymbols.length === parsed.symbols.length) {
    const isDrizzle = DRIZZLE_PACKAGES.has(parsed.source.split('/').slice(0, 2).join('/'))
    const allDrizzleFPs = parsed.symbols.every((s) => DRIZZLE_FP_SYMBOLS.has(s))
    if (isDrizzle && allDrizzleFPs) return diagnostics

    diagnostics.push(
      diag(filePath, 'import-intelligence/unused-import', 'warning',
        `Entire import from '${parsed.source}' is unused`,
        parsed.line,
        'Remove the unused import line entirely.',
        {
          fixable: true,
          suggestion: {
            type: 'delete',
            text: '',
            range: {
              startLine: parsed.line,
              startCol: 1,
              endLine: parsed.line,
              endCol: parsed.raw.length + 1,
            },
            confidence: parsed.viaAST ? 0.92 : 0.85,
            reason: 'This import is never used in the file. Removing it reduces bundle size and avoids misleading readers about the module\'s dependencies.',
          },
          detail: { astConfirmed: parsed.viaAST },
        },
      ),
    )
  }

  return diagnostics
}
