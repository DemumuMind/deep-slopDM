import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { existsSync, readFileSync } from 'node:fs'
import { minimatch } from 'minimatch'
import micromatch from 'micromatch'
import type { Language } from '../../types/index.js'
import { assessCoverage, type CoverageInfo } from '../coverage-gate.js'

/** File extension → language mapping */
export const EXT_MAP: Record<string, Language> = {
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.py': 'python',
  '.go': 'go',
  '.rs': 'rust',
  '.rb': 'ruby',
  '.php': 'php',
  '.java': 'java',
}

/** Directories to always skip during walk (never recurse into) */
export const SKIP_DIR_NAMES = new Set([
  'node_modules', '.git', 'dist', 'build', 'coverage', '.next', '.nuxt',
  '.pnpm-store', '.turbo', '.vercel', '.cache', 'tmp-', '__pycache__',
  '.venv', 'venv', '.tox', 'target', 'vendor', 'bower_components',
])

/**
 * Load .deep-slopignore patterns from the project root.
 * Returns an array of glob patterns (lines that are not empty or comments).
 */
export function loadDeepSlopIgnore(rootDir: string): string[] {
  const ignorePath = join(rootDir, '.deep-slopignore')
  if (!existsSync(ignorePath)) return []

  try {
    const content = readFileSync(ignorePath, 'utf-8')
    return content
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line !== '' && !line.startsWith('#'))
  } catch {
    return []
  }
}

/**
 * Check if a relative file path matches any ignore pattern using minimatch.
 * Supports gitignore-style glob patterns.
 */
export function matchesIgnorePattern(relPath: string, patterns: string[]): boolean {
  for (const pattern of patterns) {
    // Negation patterns (prefixed with !) are not supported here
    if (pattern.startsWith('!')) continue
    if (minimatch(relPath, pattern, { dot: true })) return true
    // Also try matching with the pattern treating basename-only patterns
    if (!pattern.includes('/')) {
      const basename = relPath.split('/').pop() ?? ''
      if (minimatch(basename, pattern, { dot: true })) return true
    }
  }
  return false
}

/** Check if path matches any exclude pattern */
export function isExcluded(relPath: string, excludes: Set<string>): boolean {
  const segments = relPath.split('/')
  const patterns = [...excludes]
  for (const pattern of patterns) {
    // Exact segment match (for simple names like 'node_modules')
    if (segments.some((s) => s === pattern)) {
      return true
    }
  }
  // Glob pattern match (for patterns like '**/*.py', '*.ts', 'dist/**')
  if (micromatch.isMatch(relPath, patterns)) {
    return true
  }
  return false
}

/** Walk directory recursively, skipping excluded directories early */
export async function walkDir(
  dir: string,
  visitor: (filePath: string) => Promise<void>,
  excludeSet?: Set<string>,
): Promise<void> {
  try {
    const entries = await readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.isDirectory()) {
        // Skip excluded directories by name — don't recurse into them at all
        if (SKIP_DIR_NAMES.has(entry.name)) continue
        if (excludeSet && excludeSet.has(entry.name)) continue
        const fullPath = join(dir, entry.name)
        await walkDir(fullPath, visitor, excludeSet)
      } else if (entry.isFile()) {
        const fullPath = join(dir, entry.name)
        await visitor(fullPath)
      }
    }
  } catch { /* permission denied, skip */ }
}

/** Compute coverage info for the project */
export function computeCoverage(
  languages: Language[],
  totalFiles: number,
): CoverageInfo {
  return assessCoverage(languages, totalFiles)
}
