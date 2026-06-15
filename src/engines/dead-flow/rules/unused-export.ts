// ── Unused Export Rule ────────────────────────────────────
// Detects exported symbols that are never imported by any other file.

import { join, relative } from "node:path"
import type { Diagnostic } from "../../../types/index.js"
import type { Suggestion } from "../../../types/index.js"
import { readFileContent, toLines } from "../../../utils/file-utils.js"
import { escapeRegExp, makeDiagnostic } from "../shared.js"

interface ExportInfo {
  name: string
  line: number
  isTypeExport: boolean
  isDefault: boolean
}

function extractExports(content: string): ExportInfo[] {
  const exports: ExportInfo[] = []
  const lines = toLines(content)

  for (const { num, text } of lines) {
    const trimmed = text.trim()

    const namedExport = trimmed.match(
      /^export\s+(?:default\s+)?(?:function|const|let|var|class|enum|interface|type)\s+(\w+)/,
    )
    if (namedExport) {
      exports.push({
        name: namedExport[1],
        line: num,
        isTypeExport: trimmed.includes("export type ") || trimmed.includes("export interface "),
        isDefault: trimmed.includes("export default"),
      })
      continue
    }

    const braceExport = trimmed.match(/^export\s+(?:type\s+)?\{([^}]+)\}/)
    if (braceExport) {
      const names = braceExport[1].split(",").map((s) => {
        const parts = s.trim().split(/\s+as\s+/)
        return parts[parts.length - 1].trim()
      }).filter(Boolean)
      for (const name of names) {
        exports.push({
          name,
          line: num,
          isTypeExport: trimmed.includes("export type {"),
          isDefault: false,
        })
      }
      continue
    }

    const defaultExport = trimmed.match(/^export\s+default\s+/)
    if (defaultExport) {
      exports.push({
        name: "default",
        line: num,
        isTypeExport: false,
        isDefault: true,
      })
    }
  }

  return exports
}

const DECLARATION_EXPORT_RE = /^\s*(?:export\s+)?(?:async\s+)?(?:function|const|let|var|class|interface|type|enum)\b/

function buildRegexExportFix(
  relPath: string,
  line: number,
  symbolName: string,
  fileLinesCache: Map<string, { num: number; text: string }[]>,
): { fixable: boolean; suggestion: Suggestion } {
  const lines = fileLinesCache.get(relPath)
  const originalLine = lines?.find((l) => l.num === line)?.text
  if (originalLine && DECLARATION_EXPORT_RE.test(originalLine)) {
    const fixedLine = originalLine.replace(/^(\s*)export\s+/, "$1")
    return {
      fixable: true,
      suggestion: {
        type: "replace",
        text: fixedLine,
        range: {
          startLine: line,
          startCol: 1,
          endLine: line,
          endCol: originalLine.length + 1,
        },
        confidence: 0.8,
        reason: "Exported " + symbolName + " is unused; removing the export keyword makes it module-private.",
      },
    }
  }
  return {
    fixable: false,
    suggestion: {
      type: "refactor",
      text: "// deep-slop-suppress: unused-export " + symbolName,
      confidence: 0.5,
      reason: "This export is not a simple declaration; remove or suppress manually.",
    },
  }
}

export function detectUnusedExport(
  files: Map<string, string>,
  rootDir: string,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = []
  const exportMap = new Map<string, Array<{ filePath: string; line: number; isType: boolean; isDefault: boolean }>>()
  const importedSymbols = new Set<string>()
  const fileLinesCache = new Map<string, { num: number; text: string }[]>()

  function getLines(relPath: string): { num: number; text: string }[] | null {
    if (fileLinesCache.has(relPath)) return fileLinesCache.get(relPath)!
    const absPath = join(rootDir, relPath)
    const content = files.get(absPath)
    if (!content) return null
    const lines = toLines(content)
    fileLinesCache.set(relPath, lines)
    return lines
  }

  for (const [filePath, content] of files) {
    const relPath = relative(rootDir, filePath)

    const exports = extractExports(content)
    for (const exp of exports) {
      const key = relPath + "::" + exp.name
      if (!exportMap.has(key)) exportMap.set(key, [])
      exportMap.get(key)!.push({
        filePath: relPath,
        line: exp.line,
        isType: exp.isTypeExport,
        isDefault: exp.isDefault,
      })
    }

    const lines = toLines(content)
    for (let li = 0; li < lines.length; li++) {
      const trimmed = lines[li].text.trim()

      const braceImport = trimmed.match(
        /^import\s+(?:type\s+)?\{([^}]+)\}\s+from\s+['"][^'"]+['"]/,
      )
      if (braceImport) {
        const names = braceImport[1].split(",").map((s) => {
          const parts = s.trim().split(/\s+as\s+/)
          return parts[0].trim()
        }).filter(Boolean)
        for (const name of names) importedSymbols.add(name)
      }

      const multiLineImportStart = trimmed.match(/^import\s+(?:type\s+)?\{\s*$/)
      if (multiLineImportStart) {
        for (let next = li + 1; next < lines.length; next++) {
          const nextTrimmed = lines[next].text.trim()
          if (nextTrimmed.startsWith("}")) break
          const nameParts = nextTrimmed.split(",").map((s) => {
            const parts = s.trim().split(/\s+as\s+/)
            return parts[0].trim()
          }).filter(Boolean)
          for (const name of nameParts) importedSymbols.add(name)
        }
      }

      const defaultImport = trimmed.match(
        /^import\s+(\w+)\s+from\s+['"][^'"]+['"]/,
      )
      if (defaultImport && !trimmed.includes("{")) {
        importedSymbols.add(defaultImport[1])
      }

      const nsImport = trimmed.match(/^import\s+\*\s+as\s+(\w+)\s+from/)
      if (nsImport) {
        importedSymbols.add(nsImport[1])
      }

      const dynamicImport = trimmed.match(
        /import\s*\([^)]*\)\s*\.then\s*\(\s*(?:\((\w+)\)|(\w+))\s*=>\s*\2?\.?(\w+)/,
      )
      if (dynamicImport) {
        const symbolName = dynamicImport[3]
        if (symbolName) importedSymbols.add(symbolName)
      }

      const dynamicThenAccess = trimmed.match(
        /\.then\s*\(\s*\((\w+)\)\s*=>\s*\1\.(\w+)/,
      )
      if (dynamicThenAccess) {
        importedSymbols.add(dynamicThenAccess[2])
      }

      const dynamicThenAccessNoParens = trimmed.match(
        /\.then\s*\(\s*(\w+)\s*=>\s*\1\.(\w+)/,
      )
      if (dynamicThenAccessNoParens) {
        importedSymbols.add(dynamicThenAccessNoParens[2])
      }
    }
  }

  for (const [key, entries] of exportMap) {
    for (const entry of entries) {
      const symbolName = key.split("::").pop()!

      if (entry.isType) continue
      if (entry.isDefault) continue
      if (/^[A-Z]/.test(symbolName)) continue
      if (/Engine$/.test(symbolName)) continue

      if (!importedSymbols.has(symbolName)) {
        const { fixable, suggestion } = buildRegexExportFix(entry.filePath, entry.line, symbolName, fileLinesCache)
        diagnostics.push(
          makeDiagnostic({
            filePath: entry.filePath,
            rule: "dead-flow/unused-export",
            message: "Exported " + symbolName + " is never imported by any other file",
            line: entry.line,
            severity: "info",
            fixable,
            help: "Consider removing the unused export " + symbolName + " or adding it to the public API explicitly",
            suggestion,
            detail: { symbolName },
          }),
        )
      }
    }
  }

  return diagnostics
}
