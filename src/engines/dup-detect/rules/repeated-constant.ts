// ── Repeated Constant Detection ───────────────────────
// Strings repeated 3+ times across 3+ different files.

import { relative } from 'node:path'
import type { Diagnostic, Language } from '../../../types/index.js'
import { diag, REPEATED_CONSTANT_MIN_CHARS, REPEATED_CONSTANT_MIN_OCCURRENCES, type StringOccurrence } from '../shared.js'

/** Extract string literals from a line */
export function extractStringLiterals(line: string, lang: Language | null): { value: string; col: number; raw: string }[] {
  const results: { value: string; col: number; raw: string }[] = []

  if (lang === 'python') {
    const stringRe = /(?<!\\)(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)')/g
    let m: RegExpExecArray | null
    while ((m = stringRe.exec(line)) !== null) {
      const value = m[1] ?? m[2] ?? ''
      const col = m.index + 1
      if (value.length >= REPEATED_CONSTANT_MIN_CHARS) {
        results.push({ value, col, raw: m[0] })
      }
    }
  } else {
    const stringRe = /(?<!\\)(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)')/g
    let m: RegExpExecArray | null
    while ((m = stringRe.exec(line)) !== null) {
      const value = m[1] ?? m[2] ?? ''
      const col = m.index + 1
      if (value.length >= REPEATED_CONSTANT_MIN_CHARS) {
        results.push({ value, col, raw: m[0] })
      }
    }
    const templateRe = /`((?:[^`\\]|\\.)*)`/g
    while ((m = templateRe.exec(line)) !== null) {
      const value = m[1] ?? ''
      const col = m.index + 1
      if (value.length >= REPEATED_CONSTANT_MIN_CHARS && !value.includes('${')) {
        results.push({ value, col, raw: m[0] })
      }
    }
  }

  return results
}

/** Check if a string looks like a meaningful constant (not a URL, path, import, etc.) */
export function isConstantCandidate(value: string): boolean {
  if (/^https?:\/\//.test(value)) return false
  if (/^\/|^\.\.?\//.test(value)) return false
  if (/^\d+$/.test(value)) return false
  if (/^[.\[]/.test(value)) return false
  if (/^node_modules/.test(value)) return false
  if (/^[@a-z0-9][-a-z0-9.]*\/[-a-z0-9.@/]*$/i.test(value)) return false
  if (/^[a-z][-a-z0-9]{1,20}$/.test(value) && value.length <= 20) return false
  if (/\bimport\b|\bfrom\b|\brequire\b/.test(value)) return false
  if (/^\.[a-z]{1,4}$/.test(value)) return false
  return true
}

/** Convert a string value to a SCREAMING_SNAKE_CASE constant name */
export function toConstantName(value: string): string {
  const words = value
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 0 && !/^\d+$/.test(w))
    .slice(0, 4)

  if (words.length === 0) return 'SHARED_CONSTANT'

  return words.map((w) => w.toUpperCase()).join('_')
}

export function detectRepeatedConstants(
  allStrings: StringOccurrence[],
  rootDir: string,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = []

  const byValue = new Map<string, StringOccurrence[]>()
  for (const occ of allStrings) {
    if (!isConstantCandidate(occ.value)) continue
    let arr = byValue.get(occ.value)
    if (!arr) {
      arr = []
      byValue.set(occ.value, arr)
    }
    arr.push(occ)
  }

  for (const [value, occurrences] of byValue) {
    if (occurrences.length < REPEATED_CONSTANT_MIN_OCCURRENCES) continue

    const uniqueFiles = new Set(occurrences.map((o) => o.filePath))
    if (uniqueFiles.size < REPEATED_CONSTANT_MIN_OCCURRENCES) continue

    const first = occurrences[0]
    const relPath = relative(rootDir, first.filePath)
    const locations = occurrences.slice(0, 10).map((o) => ({
      file: relative(rootDir, o.filePath),
      line: o.line,
      column: o.col,
    }))

    const suggestedName = toConstantName(value)
    const escapedValue = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
    const fixedLine = first.lineText.replace(first.raw, suggestedName)
    const replacementText = `const ${suggestedName} = "${escapedValue}";\n${fixedLine}`

    diagnostics.push(
      diag({
        filePath: relPath,
        rule: 'dup-detect/repeated-constant',
        severity: 'warning',
        message: `String "${value.length > 40 ? value.slice(0, 40) + '...' : value}" repeated ${occurrences.length} times across ${uniqueFiles.size} files`,
        help: `Extract this string to a shared constant (e.g., ${suggestedName}) to avoid duplication and ensure consistency.`,
        line: first.line,
        column: first.col,
        fixable: true,
        suggestion: {
          type: 'replace',
          text: replacementText,
          range: {
            startLine: first.line,
            startCol: 1,
            endLine: first.line,
            endCol: first.lineText.length + 1,
          },
          confidence: 0.75,
          reason: `The same string literal appears ${occurrences.length} times. Extracting it to a named constant improves maintainability and prevents typos.`,
        },
        detail: {
          value,
          count: occurrences.length,
          fileCount: uniqueFiles.size,
          locations,
        },
      }),
    )
  }

  return diagnostics
}
