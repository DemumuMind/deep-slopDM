// ── Shared helpers for markup-lint rules ─────────────────

import { readdir } from 'node:fs/promises'
import { join, extname } from 'node:path'
import type { Diagnostic } from '../../types/index.js'

export const MARKUP_EXTENSIONS = new Set([
  '.json', '.yaml', '.yml', '.css', '.scss',
  '.html', '.htm', '.md', '.markdown',
])

export function isMarkupFile(filePath: string): boolean {
  const ext = extname(filePath)
  return MARKUP_EXTENSIONS.has(ext)
}

export function fileType(filePath: string): 'json' | 'yaml' | 'css' | 'html' | 'markdown' | null {
  const ext = extname(filePath)
  if (ext === '.json') return 'json'
  if (ext === '.yaml' || ext === '.yml') return 'yaml'
  if (ext === '.css' || ext === '.scss') return 'css'
  if (ext === '.html' || ext === '.htm') return 'html'
  if (ext === '.md' || ext === '.markdown') return 'markdown'
  return null
}

/** Recursively collect file paths under root, respecting exclude list */
export async function collectMarkupFiles(
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
      } else if (entry.isFile() && isMarkupFile(full)) {
        results.push(full)
      }
    }
  }

  await walk(root)
  return results
}

/** Make a diagnostic with sensible defaults for markup-lint */
export function makeDiagnostic(
  overrides: Partial<Diagnostic> & Pick<Diagnostic, 'filePath' | 'rule' | 'message' | 'line'>,
): Diagnostic {
  return {
    engine: 'markup-lint',
    severity: 'info',
    column: 1,
    category: 'style',
    fixable: false,
    help: '',
    ...overrides,
  }
}
