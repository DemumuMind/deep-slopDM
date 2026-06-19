// ── Type-Safety Engine Helpers ─────────────────────────────────────────────
// Utility functions for the type-safety engine.

import { join, relative } from 'node:path'
import type { Suggestion } from '../../types/index.js'

/** Check whether a file path is a TypeScript/JavaScript file we should scan */
export function isTargetFile(filePath: string): boolean {
  return /\.(ts|tsx|js|jsx|mjs|cjs)$/i.test(filePath)
}

/** Check whether a file path is TypeScript (not plain JS) */
export function isTypeScriptFile(filePath: string): boolean {
  return /\.(ts|tsx)$/i.test(filePath)
}

/** Check whether a file is a JSX/TSX file */
export function isJsxFile(filePath: string): boolean {
  return /\.(tsx|jsx)$/i.test(filePath)
}

/** Count leading spaces/tabs for column calculation */
export function columnForIndex(line: string, index: number): number {
  return index + 1
}

/** Capitalize first letter */
export function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/** Walk a directory recursively collecting target files (excludes configured patterns) */
export async function collectFiles(
  root: string,
  exclude: string[],
  filter?: string[],
): Promise<string[]> {
  const { readdir } = await import('node:fs/promises')
  const results: string[] = []

  async function walk(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = join(dir, entry.name)
      const rel = relative(root, fullPath)

      const shouldExclude = exclude.some(
        (pattern) =>
          rel.includes(pattern) ||
          entry.name === pattern ||
          new RegExp(pattern.replace(/\*/g, '.*')).test(rel),
      )
      if (shouldExclude) continue

      if (entry.isDirectory()) {
        await walk(fullPath)
      } else if (isTargetFile(entry.name)) {
        if (filter && filter.length > 0) {
          const normalizedRel = rel.replace(/\\/g, '/')
          if (filter.some((f) => normalizedRel === f.replace(/\\/g, '/'))) {
            results.push(fullPath)
          }
        } else {
          results.push(fullPath)
        }
      }
    }
  }

  await walk(root)
  return results
}

/** Context result from analyzing `as any` */
export interface AsAnyContext {
  severity: 'warning' | 'info' | 'suggestion'
  message: string
  help: string
  suggestion: Suggestion
  rule: string
}
