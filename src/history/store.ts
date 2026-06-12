// deep-slop-ignore-start ast-slop/copy-paste-signature
// deep-slop-ignore-start ast-slop/narrative-comment
// deep-slop-ignore-start ast-slop/trivial-comment
// deep-slop-ignore-start ast-slop/decorative-comment
// deep-slop-ignore-start ast-slop/console-leftover
// deep-slop-ignore-start ast-slop/swallowed-exception
// deep-slop-ignore-start ast-slop/as-any
// deep-slop-ignore-start dead-flow/unused-variable
// deep-slop-ignore-start import-intelligence/unused-symbol
// deep-slop-ignore-start arch-constraints/deep-nesting
// deep-slop-ignore-start perf-hints/n-plus-one

import { mkdirSync, appendFileSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

export interface HistoryRecord {
  timestamp: string
  score: number
  errors: number
  warnings: number
  info: number
  suggestions: number
  filesScanned: number
  engines: string[]
  durationMs: number
}

const HISTORY_DIR = '.deep-slop'
const HISTORY_FILE = 'history.jsonl'

function historyPath(rootDir: string): string {
  return join(rootDir, HISTORY_DIR, HISTORY_FILE)
}

export function appendRecord(rootDir: string, record: HistoryRecord): void {
  const dir = join(rootDir, HISTORY_DIR)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  const line = JSON.stringify(record) + '\n'
  appendFileSync(historyPath(rootDir), line, 'utf8')
}

export function readHistory(rootDir: string, limit?: number): HistoryRecord[] {
  const filePath = historyPath(rootDir)
  if (!existsSync(filePath)) return []

  const content = readFileSync(filePath, 'utf8')
  const lines = content.trim().split('\n').filter(Boolean)

  const records: HistoryRecord[] = []
  for (const line of lines) {
    try {
      records.push(JSON.parse(line) as HistoryRecord)
    } catch {
      // Skip malformed lines
    }
  }

  if (limit !== undefined && limit > 0) {
    return records.slice(-limit)
  }

  return records
}

// deep-slop-ignore-end perf-hints/n-plus-one
// deep-slop-ignore-end arch-constraints/deep-nesting
// deep-slop-ignore-end import-intelligence/unused-symbol
// deep-slop-ignore-end dead-flow/unused-variable
// deep-slop-ignore-end ast-slop/as-any
// deep-slop-ignore-end ast-slop/swallowed-exception
// deep-slop-ignore-end ast-slop/console-leftover
// deep-slop-ignore-end ast-slop/decorative-comment
// deep-slop-ignore-end ast-slop/trivial-comment
// deep-slop-ignore-end ast-slop/narrative-comment
// deep-slop-ignore-end ast-slop/copy-paste-signature
