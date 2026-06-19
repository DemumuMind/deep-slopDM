// ── Shared helpers for markup-lint rules ─────────────────

import { extname } from 'node:path'
import type { Diagnostic } from '../../types/index.js'
import { collectFilesByExtension } from '../../utils/file-collection.js'

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
  return collectFilesByExtension(root, MARKUP_EXTENSIONS, exclude)
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
