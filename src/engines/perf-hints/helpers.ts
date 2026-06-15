// ── Perf-Hints Engine Helpers ──────────────────────────────────────────────
// Utility functions and scope tracker for the perf-hints engine.

import { readdir } from 'node:fs/promises'
import { join, extname, relative } from 'node:path'
import type { Diagnostic, Suggestion } from '../../types/index.js'

// ── File helpers ──────────────────────────────────────────────────────────

const TS_JS_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
])

export function isRelevantFile(filePath: string): boolean {
  const ext = extname(filePath)
  return TS_JS_EXTENSIONS.has(ext)
}

/** Recursively collect file paths under root, respecting exclude list */
export async function collectFiles(
  root: string,
  exclude: string[],
): Promise<string[]> {
  const results: string[] = []

  async function walk(dir: string): Promise<void> {
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const full = join(dir, entry.name)
      if (exclude.some((pat) => full.includes(pat))) continue
      if (entry.isDirectory()) {
        await walk(full)
      } else if (entry.isFile() && isRelevantFile(full)) {
        results.push(full)
      }
    }
  }

  await walk(root)
  return results
}

/** Make a diagnostic with sensible defaults for perf-hints */
export function makeDiagnostic(
  overrides: Partial<Diagnostic> & Pick<Diagnostic, 'filePath' | 'rule' | 'message' | 'line'>,
): Diagnostic {
  return {
    engine: 'perf-hints',
    severity: 'info',
    column: 1,
    category: 'performance',
    fixable: false,
    help: '',
    ...overrides,
  }
}

// ── Scope tracker: maps line ranges to brace-delimited blocks ─────────────

export interface BlockRange {
  /** 0-based line index of the opening brace line */
  startIdx: number
  /** 0-based line index of the closing brace line */
  endIdx: number
  /** 1-based line number of the construct header line (e.g. the `for` line) */
  headerLine: number
  /** Kind of block */
  kind: 'for' | 'while' | 'do' | 'forEach' | 'map' | 'async-function' | 'sync-function' | 'other'
}

export type NumberedLine = { num: number; text: string }

/**
 * Parse the file into block ranges by tracking brace depth.
 * This lets us answer "is line X inside a loop?" or "is line X inside an async function?"
 */
export function parseBlocks(lines: NumberedLine[]): BlockRange[] {
  const blocks: BlockRange[] = []

  const stack: Array<{
    braceLineIdx: number
    headerLine: number
    kind: BlockRange['kind']
  }> = []

  for (let i = 0; i < lines.length; i++) {
    const text = lines[i].text

    for (let col = 0; col < text.length; col++) {
      const ch = text[col]

      // Skip characters inside string literals
      if (ch === '"' || ch === "'" || ch === '`') {
        const quote = ch
        col++
        while (col < text.length && text[col] !== quote) {
          if (text[col] === '\\') col++
          col++
        }
        continue
      }

      // Skip comments
      if (ch === '/' && col + 1 < text.length) {
        if (text[col + 1] === '/') break
        if (text[col + 1] === '*') {
          const end = text.indexOf('*/', col + 2)
          if (end !== -1) {
            col = end + 1
          } else {
            break
          }
          continue
        }
      }

      if (ch === '{') {
        const kind = detectConstructKind(lines, i, stack.length)
        stack.push({
          braceLineIdx: i,
          headerLine: lines[i].num,
          kind,
        })
      } else if (ch === '}') {
        if (stack.length > 0) {
          const opener = stack.pop()!
          blocks.push({
            startIdx: opener.braceLineIdx,
            endIdx: i,
            headerLine: opener.headerLine,
            kind: opener.kind,
          })
        }
      }
    }
  }

  return blocks
}

/**
 * Look at the text before the opening brace on lineIdx to determine what
 * construct this block belongs to.
 */
function detectConstructKind(
  lines: NumberedLine[],
  braceLineIdx: number,
  _depth: number,
): BlockRange['kind'] {
  const chunks: string[] = []
  const braceLine = lines[braceLineIdx].text
  const bracePos = braceLine.indexOf('{')
  if (bracePos > 0) {
    chunks.push(braceLine.slice(0, bracePos))
  }
  for (let i = braceLineIdx - 1; i >= Math.max(0, braceLineIdx - 3); i--) {
    chunks.unshift(lines[i].text.trim())
  }

  const header = chunks.join(' ')

  if (/\basync\s+(?:function\b|[\w]+\s*\([^)]*\)\s*=>)/.test(header) ||
      /\basync\s+function\b/.test(header)) {
    return 'async-function'
  }

  if (/\bfunction\b/.test(header) || /=>\s*$/.test(chunks[chunks.length - 1])) {
    return 'sync-function'
  }

  if (/\bfor\b/.test(header)) return 'for'
  if (/\bwhile\b/.test(header)) return 'while'
  if (/\bdo\b/.test(header)) return 'do'

  if (/\.(forEach|map|filter|reduce|flatMap|some|every)\s*\(/.test(header)) {
    if (/\.forEach\b/.test(header)) return 'forEach'
    if (/\.map\b/.test(header)) return 'map'
    return 'map'
  }

  return 'other'
}

/** Check if a 0-based line index is inside a block of the given kind(s) */
export function isInsideBlock(
  blocks: BlockRange[],
  lineIdx: number,
  kinds: Set<BlockRange['kind']>,
): BlockRange | null {
  for (const block of blocks) {
    if (lineIdx >= block.startIdx && lineIdx <= block.endIdx && kinds.has(block.kind)) {
      return block
    }
  }
  return null
}

/** Get text around a line (N lines ahead from lineIdx, inclusive) */
export function contentAroundLine(
  lines: NumberedLine[],
  lineIdx: number,
  ahead: number,
): string {
  const start = lineIdx
  const end = Math.min(lines.length, lineIdx + ahead)
  const parts: string[] = []
  for (let i = start; i < end; i++) {
    parts.push(lines[i].text)
  }
  return parts.join('\n')
}

/** Human-readable loop kind description */
export function describeLoopKind(kind: BlockRange['kind']): string {
  switch (kind) {
    case 'for': return 'for loop'
    case 'while': return 'while loop'
    case 'do': return 'do-while loop'
    case 'forEach': return '.forEach() callback'
    case 'map': return '.map() callback'
    default: return 'loop'
  }
}

/** Build suggestion for sync-in-async fix */
export function buildSyncInAsyncSuggestion(
  lineText: string,
  methodName: string,
  asyncName: string,
  lineNum: number,
): Suggestion {
  const callRe = new RegExp(
    `\\b(?:(\\w+)\\.)?${methodName}\\s*\\(`,
  )
  const match = lineText.match(callRe)
  let replacement: string
  if (match && match[1] === 'fs') {
    replacement = `await fs.promises.${asyncName}(`
  } else {
    replacement = `await ${asyncName}(`
  }
  const fixedLine = match
    ? lineText.replace(callRe, replacement)
    : lineText.replace(methodName, `await ${asyncName}`)
  return {
    type: 'replace',
    text: fixedLine,
    range: {
      startLine: lineNum,
      startCol: 1,
      endLine: lineNum,
      endCol: lineText.length + 1,
    },
    confidence: 0.85,
    reason: `Async functions should use the async version ${asyncName} instead of the synchronous ${methodName} to prevent blocking the event loop`,
  }
}
