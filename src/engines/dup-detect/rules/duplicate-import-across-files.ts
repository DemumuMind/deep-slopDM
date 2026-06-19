// ── Duplicate Import Across Files ─────────────────────
// Flag modules imported in many files with overlapping symbols.

import { relative } from 'node:path'
import type { Diagnostic, Language } from '../../../types/index.js'
import { diag, DUPLICATE_IMPORT_MIN_FILES, type ImportOccurrence } from '../shared.js'

// Modules that are intentionally imported in many files and should not be flagged
const IMPORT_EXCLUSIONS = new Set([
  // Internal shared utilities used everywhere by design
  'types/index.js',
  'shared.js',
  'utils/file-utils.js',
  // CLI framework imported in all command files
  'commander',
])

/** Whether a module specifier should be ignored by duplicate-import detection */
function isExcludedImportSource(source: string): boolean {
  if (source.startsWith('node:')) return true
  for (const excluded of IMPORT_EXCLUSIONS) {
    if (source.endsWith(excluded)) return true
  }
  return false
}

/** Extract named import symbols from raw import text */
export function extractNamedSymbols(raw: string, lang: Language | null): string[] {
  if (lang === 'typescript' || lang === 'javascript') {
    const namedMatch = raw.match(/\{([^}]+)\}/)
    if (namedMatch) {
      return namedMatch[1]
        .split(',')
        .map((s) => s.trim().split(/\s+as\s+/)[0].trim())
        .filter((s) => s.length > 0)
    }
    const defaultMatch = raw.match(/^import\s+(?:type\s+)?(\w+)\s+from/)
    if (defaultMatch) {
      return [defaultMatch[1]]
    }
    const nsMatch = raw.match(/^import\s+\*\s+as\s+(\w+)\s+from/)
    if (nsMatch) {
      return [nsMatch[1]]
    }
  }

  if (lang === 'python') {
    const fromMatch = raw.match(/^from\s+[^\s]+\s+import\s+(.+)/)
    if (fromMatch) {
      return fromMatch[1]
        .split(',')
        .map((s) => s.trim().split(/\s+as\s+/)[0].trim())
        .filter((s) => s.length > 0)
    }
    const importMatch = raw.match(/^import\s+(.+)/)
    if (importMatch) {
      return importMatch[1]
        .split(',')
        .map((s) => s.trim().split(/\s+as\s+/)[0].trim())
        .filter((s) => s.length > 0)
    }
  }

  return []
}

export function detectDuplicateImports(
  allImports: ImportOccurrence[],
  rootDir: string,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = []

  const byModule = new Map<string, ImportOccurrence[]>()
  for (const imp of allImports) {
    let arr = byModule.get(imp.source)
    if (!arr) {
      arr = []
      byModule.set(imp.source, arr)
    }
    arr.push(imp)
  }

  for (const [source, occurrences] of byModule) {
    if (isExcludedImportSource(source)) continue

    const uniqueFiles = new Set(occurrences.map((o) => o.filePath))
    if (uniqueFiles.size < DUPLICATE_IMPORT_MIN_FILES) continue

    const symbolCounts = new Map<string, number>()
    for (const occ of occurrences) {
      for (const sym of occ.symbols) {
        symbolCounts.set(sym, (symbolCounts.get(sym) ?? 0) + 1)
      }
    }

    const threshold = uniqueFiles.size * 0.3
    const commonSymbols: string[] = []
    for (const [sym, count] of symbolCounts) {
      if (count >= threshold) {
        commonSymbols.push(sym)
      }
    }
    commonSymbols.sort()

    if (commonSymbols.length === 0) continue

    const representative = occurrences[0]
    const relPath = relative(rootDir, representative.filePath)

    diagnostics.push(
      diag({
        filePath: relPath,
        rule: 'dup-detect/duplicate-import-across-files',
        severity: 'info',
        message: `Module "${source}" imported in ${uniqueFiles.size} files with common symbols: ${commonSymbols.join(', ')}`,
        help: `Create a shared re-export (barrel) file for "${source}" that re-exports the common symbols, then import from the barrel in each consumer.`,
        line: representative.line,
        column: 1,
        fixable: true,
        suggestion: {
          type: 'replace',
          text: `export { ${commonSymbols.join(', ')} } from "${source}";`,
          range: {
            startLine: representative.line,
            startCol: 1,
            endLine: representative.line,
            endCol: 1,
          },
          confidence: 0.75,
          reason: `${uniqueFiles.size} files import the same common symbols from "${source}". Consolidating into a barrel file reduces duplication and simplifies future refactoring.`,
        },
        detail: {
          module: source,
          fileCount: uniqueFiles.size,
          commonSymbols,
          files: [...uniqueFiles].map((f) => relative(rootDir, f)),
        },
      }),
    )
  }

  return diagnostics
}
