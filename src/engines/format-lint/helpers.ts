// ── Format-Lint Engine ──────────────────────────────────
// Detects formatting inconsistencies: mixed indentation,
// inconsistent quote style, max line length, inconsistent
// semicolons, blank line clusters, and trailing comma issues.

import { readdir } from 'node:fs/promises'
import { join, extname } from 'node:path'
import type { Diagnostic } from '../../types/index.js'

// ── Helpers ──────────────────────────────────────────────

export const ALL_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.py', '.go', '.rs', '.rb', '.php', '.java',
  '.cs', '.swift',
  '.json', '.yaml', '.yml', '.css', '.html', '.md',
])

export const JS_TS_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
])

export function isRelevantFile(filePath: string): boolean {
  const ext = extname(filePath)
  return ALL_EXTENSIONS.has(ext)
}

export function isJsTsFile(filePath: string): boolean {
  const ext = extname(filePath)
  return JS_TS_EXTENSIONS.has(ext)
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

/** Make a diagnostic with sensible defaults for format-lint */
export function makeDiagnostic(
  overrides: Partial<Diagnostic> & Pick<Diagnostic, 'filePath' | 'rule' | 'message' | 'line'>,
): Diagnostic {
  return {
    engine: 'format-lint',
    severity: 'info',
    column: 1,
    category: 'style',
    fixable: false,
    help: '',
    ...overrides,
  }
}
