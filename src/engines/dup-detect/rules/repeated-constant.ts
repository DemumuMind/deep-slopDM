// ── Repeated Constant Detection ───────────────────────
// Strings repeated 3+ times across 3+ different files.

import { relative } from 'node:path'
import type { Diagnostic, Language } from '../../../types/index.js'
import { diag, REPEATED_CONSTANT_MIN_CHARS, REPEATED_CONSTANT_MIN_OCCURRENCES, type StringOccurrence } from '../shared.js'

// Common English phrases and UI labels that are not meaningful constants
const EXCLUDED_COMMON_PHRASES = new Set([
  'project directory',
  'output as json',
  'needs work',
])

// Rule definition files are allowed to repeat literals (e.g. pattern-docs.ts)
const RULES_DIR_RE = /[/\\]engines[/\\][^/\\]+[/\\]rules[/\\]/

function isRuleDefinitionFile(filePath: string): boolean {
  return RULES_DIR_RE.test(filePath)
}

/** Plain-language phrases (2+ words) that are not meaningful constants */
function isCommonEnglishPhrase(value: string): boolean {
  const trimmed = value.trim()
  const words = trimmed.split(/\s+/)
  if (words.length < 2) return false
  return words.every((w) => /^[a-z-]+$/.test(w))
}

/** CLI option descriptions like "Output as JSON" or "Project directory" */
function isCliFlagDescription(value: string): boolean {
  const trimmed = value.trim()
  const words = trimmed.split(/\s+/)
  if (words.length < 2) return false
  if (!/^[A-Z]/.test(trimmed)) return false
  // Each word is either an all-caps acronym or starts with a lowercase letter
  return words.every((w) => /^[A-Z]{2,}$/.test(w) || /^[a-zA-Z][a-z-]*$/.test(w))
}

/** Filename references such as pattern-docs.ts or utils.js */
function isFilenameReference(value: string): boolean {
  return /\.(ts|js)$/i.test(value) && !value.includes(' ')
}

/** UI status labels like "Needs Work" or "In Progress" */
function isUiStatusLabel(value: string): boolean {
  const trimmed = value.trim()
  const words = trimmed.split(/\s+/)
  if (words.length < 2) return false
  return words.every((w) => /^[A-Z][a-z]+$/.test(w))
}

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
function isConstantCandidate(value: string): boolean {
  if (/^https?:\/\//.test(value)) return false
  if (/^\/|^\.\.\//.test(value)) return false
  if (/^\d+$/.test(value)) return false
  if (/^[.\[]/.test(value)) return false
  if (/^node_modules/.test(value)) return false
  if (/^[@a-z0-9][-a-z0-9.]*\/[-a-z0-9.@/]*$/i.test(value)) return false
  // Node.js built-in modules: node:fs, node:path, node:child_process, etc.
  if (/^node:[a-z]/i.test(value)) return false
  // CLI flags: --dry-run, --staged, --max-turns, etc.
  if (/^--/.test(value)) return false
  // Config filenames: package.json, tsconfig.json, config.yml, .deep-slop-quality.mdc, etc.
  if (/^\w[\w-]*\.(json|yml|yaml|toml|txt|mdc|md|lock|json5)$/i.test(value)) return false
  // Template expressions in string literals: "${source}", "${imp.source}"
  if (value.includes('${')) return false
  // snake_case or kebab-case identifiers (AST node types, engine names, rule IDs, package names)
  // catch_clause, import_statement, ast-slop, dead-flow, bare-except, web-tree-sitter
  if (/^[a-z][a-z0-9_-]{1,25}$/i.test(value)) return false
  // Natural language descriptions/messages (CLI .description() strings, diagnostic messages)
  // These contain spaces and are > 20 chars — not worth extracting as constants
  if (value.includes(' ') && value.length > 20) return false
  // Common English phrases and UI labels are not meaningful constants
  if (EXCLUDED_COMMON_PHRASES.has(value.toLowerCase().trim())) return false
  // Skip common English phrases, CLI flag descriptions, filename references, and UI labels
  if (isCommonEnglishPhrase(value)) return false
  if (isCliFlagDescription(value)) return false
  if (isFilenameReference(value)) return false
  if (isUiStatusLabel(value)) return false
  // Tool name prefix: deep-slop scan, deep-slop-quality
  if (/^deep-slop/i.test(value)) return false
  // Type assertion patterns: "as unknown as X"
  if (/^as\s+(unknown|any)\s+as\s+/i.test(value)) return false
  // Python exception patterns: "except Exception:", "raise NotImplementedError"
  if (/^(except|raise)\s/i.test(value)) return false
  if (/\bimport\b|\bfrom\b|\brequire\b/.test(value)) return false
  if (/^\.[a-z]{1,4}$/i.test(value)) return false
  return true
}

/** Convert a string value to a SCREAMING_SNAKE_CASE constant name */
function toConstantName(value: string): string {
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
    if (isRuleDefinitionFile(occ.filePath)) continue
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
