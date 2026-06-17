// ── Unused Symbol Rule ────────────────────────────
// Flags imports where some but not all symbols are unused.

import type { Diagnostic } from '../../../types/index.js'
import { diag, isSymbolUsed, type ParsedImport, DRIZZLE_FP_SYMBOLS, DRIZZLE_PACKAGES } from '../shared.js'

export function detectUnusedSymbol(
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

  if (unusedSymbols.length > 0 && unusedSymbols.length < parsed.symbols.length) {
    const usedSymbols = parsed.symbols.filter((s) => !unusedSymbols.includes(s))
    const replacement = parsed.raw.replace(/\{[^}]+\}/, `{ ${usedSymbols.join(', ')} }`)

    diagnostics.push(
      diag(filePath, 'import-intelligence/unused-symbol', 'warning',
        `Unused imported symbols: ${unusedSymbols.join(', ')}`,
        parsed.line,
        'Remove unused symbols from the import to keep the codebase clean.',
        {
          fixable: true,
          suggestion: {
            type: 'replace',
            text: replacement,
            range: {
              startLine: parsed.line,
              startCol: 1,
              endLine: parsed.line,
              endCol: parsed.raw.length + 1,
            },
            confidence: parsed.viaAST ? 0.95 : 0.9,
            reason: 'Unused imported symbols add noise and may cause bundlers to include dead code. Removing them clarifies what the module actually depends on.',
          },
          detail: { astConfirmed: parsed.viaAST },
        },
      ),
    )
  }

  return diagnostics
}
