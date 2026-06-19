// ── Type-Only Import Rule ──────────────────────────
// Suggests `import type` when all imported symbols are used only as types.

import type { Diagnostic } from '../../../types/index.js'
import { diag, type ParsedImport, escapeRegex } from '../shared.js'

function getBodyAfterImports(content: string, lastImportLine: number): string {
  const lines = content.split('\n')
  return lines.slice(lastImportLine).join('\n')
}

function isTypeOnlyUsage(symbol: string, body: string): boolean {
  let stripped = body

  stripped = stripped.replace(/:\s*[A-Z]\w*(?:\s*[&|]\s*[A-Z]\w*)*/g, '')
  // Only strip generics with uppercase type names (Array<string>, Map<K, V>)
  // NOT comparison operators (a < b) which were stripping value usages
  stripped = stripped.replace(/<[A-Z]\w*(?:[\s,&|]+[A-Z]\w*)*>/g, '')
  stripped = stripped.replace(/\bas\s+[A-Z]\w*/g, '')
  stripped = stripped.replace(/\b(?:extends|implements)\s+[A-Z]\w*/g, '')
  stripped = stripped.replace(/\btype\s+\w+\s*=\s*[A-Z]\w*/g, '')
  stripped = stripped.replace(/\binterface\s+\w+[^{]*/g, '')

  return !new RegExp(`\\b${escapeRegex(symbol)}\\b`).test(stripped)
}

export function detectTypeOnlyImport(
  parsed: ParsedImport,
  filePath: string,
  fileContent: string,
  astValueUsedSymbols?: Set<string>,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = []
  if (parsed.isSideEffect || parsed.isDynamic || parsed.isTypeOnly || parsed.symbols.length === 0) return diagnostics

  let allTypeUsage: boolean
  if (astValueUsedSymbols !== undefined && parsed.viaAST) {
    // AST mode: if ANY symbol is used as a value (identifier, not type_identifier),
    // the import is NOT type-only
    allTypeUsage = parsed.symbols.every((sym) => !astValueUsedSymbols.has(sym))
  } else {
    const bodyAfterImports = getBodyAfterImports(fileContent, parsed.line)
    allTypeUsage = parsed.symbols.every((sym) => isTypeOnlyUsage(sym, bodyAfterImports))
  }

  if (allTypeUsage) {
    const replacement = parsed.raw
      .replace(/^import\s+/, 'import type ')
      .replace(/^import\s+type\s+type\s+/, 'import type ')

    diagnostics.push(
      diag(filePath, 'import-intelligence/type-only-import', 'suggestion',
        `All imported symbols from '${parsed.source}' are used only as types — use 'import type'`,
        parsed.line,
        "Switch to 'import type' for better tree-shaking and to make intent explicit.",
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
            confidence: parsed.viaAST ? 0.85 : 0.75,
            reason: "Using 'import type' makes it explicit that the import is type-only, allowing TypeScript compilers and bundlers to erase it at build time. This reduces runtime bundle size and clarifies the module's role.",
          },
          detail: { astConfirmed: parsed.viaAST },
        },
      ),
    )
  }

  return diagnostics
}
