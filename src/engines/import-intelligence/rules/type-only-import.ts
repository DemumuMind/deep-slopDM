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
  stripped = stripped.replace(/<[^>]*>/g, '')
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
  astUsedSymbols?: Set<string>,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = []
  if (parsed.isSideEffect || parsed.isDynamic || parsed.isTypeOnly || parsed.symbols.length === 0) return diagnostics

  let allTypeUsage: boolean
  if (astUsedSymbols !== undefined && parsed.viaAST) {
    allTypeUsage = parsed.symbols.every((sym) => {
      if (!astUsedSymbols.has(sym)) return true
      const bodyAfterImports = getBodyAfterImports(fileContent, parsed.line)
      return isTypeOnlyUsage(sym, bodyAfterImports)
    })
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
