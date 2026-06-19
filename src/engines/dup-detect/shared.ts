// ── Shared types and helpers for dup-detect rules ───────

import { extname } from 'node:path'
import type { Category, Diagnostic, Language, Severity, Suggestion } from '../../types/index.js'
import { createDiagnostic } from '../../utils/diagnostics.js'

// ── Constants (Calibrated) ──────────────────────────────

export const IDENTICAL_BLOCK_MIN_LINES = 14
export const SIMILAR_BLOCK_MIN_LINES = 10
export const SIMILARITY_THRESHOLD = 0.9
export const DUPLICATE_IMPORT_MIN_FILES = 15
export const REPEATED_CONSTANT_MIN_CHARS = 8
export const REPEATED_CONSTANT_MIN_OCCURRENCES = 3
export const BLOCK_OVERLAP_STEP = 5
export const LARGE_FILE_LINE_LIMIT = 2000
export const FILE_BATCH_SIZE = 50
export const COPY_PASTE_MIN_BODY_LINES = 5

export const COPY_PASTE_NAME_WHITELIST = new Set([
  'run', 'fix', 'constructor', 'get', 'set', 'init', 'handle', 'process',
  'execute', 'dispose', 'close', 'open', 'start', 'stop', 'reset', 'validate',
])

export const SUPPORTED_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.py'])

// ── Internal Types ──────────────────────────────────────

export interface CodeBlock {
  filePath: string
  startLine: number
  endLine: number
  normalizedText: string
  tokenSet?: Set<string>
  isBoilerplate?: boolean
}

export interface FunctionDef {
  filePath: string
  name: string
  startLine: number
  endLine: number
  bodyLineCount: number
  bodyNormalized: string
}

export interface ImportOccurrence {
  filePath: string
  line: number
  source: string
  symbols: string[]
}

export interface StringOccurrence {
  filePath: string
  line: number
  col: number
  value: string
  raw: string
  lineText: string
}

// ── Helpers ─────────────────────────────────────────────

/** Build a diagnostic with common fields filled */
export function diag(opts: {
  filePath: string
  rule: string
  severity: Severity
  message: string
  help: string
  line: number
  column: number
  fixable: boolean
  suggestion?: Suggestion
  detail?: Record<string, unknown>
}): Diagnostic {
  return createDiagnostic('dup-detect', 'duplication', opts)
}

/** Determine language from file extension */
const LANG_MAP: Record<string, Language> = {
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.py': 'python',
}

export function languageFromPath(filePath: string): Language | null {
  return LANG_MAP[extname(filePath)] ?? null
}

/** Normalize a line: strip leading/trailing whitespace, remove comments */
export function normalizeLine(line: string, lang: Language | null): string {
  let trimmed = line.trim()

  if (lang === 'python') {
    const hashIdx = trimmed.indexOf('#')
    if (hashIdx >= 0) {
      trimmed = trimmed.slice(0, hashIdx).trimEnd()
    }
  } else {
    const slashIdx = trimmed.indexOf('//')
    if (slashIdx >= 0) {
      trimmed = trimmed.slice(0, slashIdx).trimEnd()
    }
  }

  return trimmed
}

/** Determine whether a block is mostly imports or header comments */
function isImportLine(line: string): boolean {
  return /^\s*import\b/.test(line)
}

function isCommentLine(line: string, lang: Language | null): boolean {
  const trimmed = line.trim()
  if (lang === 'python') return trimmed.startsWith('#')
  return trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')
}

function isSectionHeader(line: string): boolean {
  return /^\s*\/\/\s*─{2,}/.test(line)
}

function isBoilerplateBlock(rawLines: string[], lang: Language | null): boolean {
  const nonEmpty = rawLines.filter((l) => l.trim().length > 0)
  if (nonEmpty.length === 0) return true

  const importLines = nonEmpty.filter((l) => isImportLine(l)).length
  const commentLines = nonEmpty.filter((l) => isCommentLine(l, lang)).length
  const headerLines = nonEmpty.filter((l) => isSectionHeader(l)).length
  const total = nonEmpty.length

  // Block is mostly imports (e.g. duplicated import boilerplate)
  if (importLines > 0 && importLines / total >= 0.5) return true
  // Block is mostly comments (e.g. duplicated file headers)
  if (commentLines > 0 && commentLines / total >= 0.7) return true
  // Block starts with a section header and is mostly imports/comments
  if (headerLines > 0 && (importLines + commentLines) / total >= 0.5) return true

  return false
}

/** Normalize a block of lines into a single string */
function normalizeBlock(lines: string[], lang: Language | null): string {
  return lines
    .map((l) => normalizeLine(l, lang))
    .filter((l) => l.length > 0)
    .join('\n')
}

/** Tokenize a line into meaningful tokens (identifiers, operators, literals) */
function tokenizeLine(line: string): string[] {
  return line
    .split(/[\s{}()\[\];,.<>:=+\-*/&|!~^%]+/)
    .filter((t) => t.length > 0)
}

/** Compute Jaccard similarity between two sets */
export function jaccardSimilarity<T>(a: Set<T>, b: Set<T>): number {
  if (a.size === 0 && b.size === 0) return 1
  if (a.size === 0 || b.size === 0) return 0
  let intersection = 0
  for (const item of a) {
    if (b.has(item)) intersection++
  }
  const union = a.size + b.size - intersection
  return union === 0 ? 0 : intersection / union
}

/** Extract all code blocks of a given size from lines using a sliding window */
export function extractBlocks(
  lines: { num: number; text: string }[],
  blockSize: number,
  step: number,
  filePath: string,
  lang: Language | null,
  includeTokenSets: boolean,
): CodeBlock[] {
  const blocks: CodeBlock[] = []
  for (let i = 0; i <= lines.length - blockSize; i += step) {
    const slice = lines.slice(i, i + blockSize)
    const rawLines = slice.map((l) => l.text)
    const normalizedText = normalizeBlock(rawLines, lang)
    if (normalizedText.length < 10) continue

    let tokenSet: Set<string> | undefined
    if (includeTokenSets) {
      tokenSet = new Set<string>()
      for (const line of rawLines) {
        const normalized = normalizeLine(line, lang)
        if (normalized.length > 0) {
          for (const tok of tokenizeLine(normalized)) {
            tokenSet.add(tok)
          }
        }
      }
    }

    blocks.push({
      filePath,
      startLine: slice[0].num,
      endLine: slice[slice.length - 1].num,
      normalizedText,
      tokenSet,
      isBoilerplate: isBoilerplateBlock(rawLines, lang),
    })
  }
  return blocks
}
