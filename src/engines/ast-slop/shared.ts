// ── AST-Slop Shared Helpers ─────────────────────────────
// Common utilities used by all rule detectors in this engine.

import { readFile } from 'node:fs/promises'
import { existsSync, readFileSync } from 'node:fs'
import { join, extname, resolve } from 'node:path'
import type { Diagnostic, Language, Severity, Suggestion } from '../../types/index.js'
import { createDiagnostic } from '../../utils/diagnostics.js'

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
  return createDiagnostic('ast-slop', 'ai-slop', opts)
}

/** Determine language from file extension */
export function languageFromPath(filePath: string): Language | null {
  const ext = extname(filePath)
  const map: Record<string, Language> = {
    '.ts': 'typescript',
    '.tsx': 'typescript',
    '.js': 'javascript',
    '.jsx': 'javascript',
    '.mjs': 'javascript',
    '.cjs': 'javascript',
    '.py': 'python',
  }
  return map[ext] ?? null
}

/** Determine TS/TSX language hint for tree-sitter parsing */
export function tsLangHint(filePath: string): 'tsx' | 'typescript' | 'javascript' {
  const ext = extname(filePath)
  if (ext === '.tsx' || ext === '.jsx') return 'tsx'
  if (ext === '.ts') return 'typescript'
  return 'javascript'
}

/** Check whether an import source is a bare specifier (not relative, not absolute) */
export function isBareSpecifier(source: string): boolean {
  return !source.startsWith('.') && !source.startsWith('/')
}

/** Check whether a bare specifier is scoped (@org/pkg) and return the package name */
export function scopedPackageName(source: string): string | null {
  const match = source.match(/^(@[^/]+\/[^/]+)/)
  return match ? match[1] : null
}

// ── tsconfig path alias support ──────────────────────────

export interface TsconfigPaths {
  baseUrl?: string
  paths: Record<string, string[]>
}

/** Load tsconfig.json compilerOptions.paths + baseUrl from project root */
export function loadTsconfigPaths(rootDir: string): TsconfigPaths | null {
  const tsconfigPath = join(rootDir, 'tsconfig.json')
  if (!existsSync(tsconfigPath)) return null
  try {
    const raw = readFileSync(tsconfigPath, 'utf-8')
    // Strip JSONC comments (single-line)
    const stripped = raw.replace(/\/\/.*$/gm, '')
    const parsed = JSON.parse(stripped)
    const compilerOptions = parsed.compilerOptions ?? {}
    const baseUrl: string | undefined = compilerOptions.baseUrl
    const paths: Record<string, string[]> = compilerOptions.paths ?? {}
    if (!baseUrl && Object.keys(paths).length === 0) return null
    return { baseUrl, paths }
  } catch {
    return null
  }
}

/** Check if an import source matches a tsconfig path alias.
 *  Returns the resolved filesystem path if it matches, or null. */
export function resolveTsconfigAlias(
  importSource: string,
  tsconfigPaths: TsconfigPaths,
  rootDir: string,
): string | null {
  const { baseUrl, paths } = tsconfigPaths
  const baseDir = baseUrl ? resolve(rootDir, baseUrl) : rootDir

  for (const [pattern, targets] of Object.entries(paths)) {
    // Handle wildcard patterns like "@/*" → ["src/*"]
    if (pattern.endsWith('/*')) {
      const prefix = pattern.slice(0, -2)
      if (importSource === prefix || importSource.startsWith(prefix + '/')) {
        const suffix = importSource.slice(prefix.length + 1)
        for (const target of targets) {
          const targetPrefix = target.endsWith('/*') ? target.slice(0, -2) : target
          const resolved = resolve(baseDir, targetPrefix, suffix)
          if (
            existsSync(resolved) ||
            existsSync(resolved + '.ts') ||
            existsSync(resolved + '.tsx') ||
            existsSync(resolved + '.js') ||
            existsSync(resolved + '.jsx') ||
            existsSync(resolved + '/index.ts') ||
            existsSync(resolved + '/index.tsx') ||
            existsSync(resolved + '/index.js')
          ) {
            return resolved
          }
        }
      }
    } else {
      // Exact match pattern (no wildcard)
      if (importSource === pattern) {
        for (const target of targets) {
          const resolved = resolve(baseDir, target)
          if (
            existsSync(resolved) ||
            existsSync(resolved + '.ts') ||
            existsSync(resolved + '.tsx') ||
            existsSync(resolved + '.js') ||
            existsSync(resolved + '.jsx') ||
            existsSync(resolved + '/index.ts') ||
            existsSync(resolved + '/index.tsx') ||
            existsSync(resolved + '/index.js')
          ) {
            return resolved
          }
        }
      }
    }
  }

  // Check baseUrl — if importSource resolves under baseUrl, consider it valid
  if (baseUrl && !importSource.startsWith('@') && !importSource.startsWith('.')) {
    const resolved = resolve(baseDir, importSource)
    if (
      existsSync(resolved) ||
      existsSync(resolved + '.ts') ||
      existsSync(resolved + '.tsx') ||
      existsSync(resolved + '.js') ||
      existsSync(resolved + '.jsx') ||
      existsSync(resolved + '/index.ts') ||
      existsSync(resolved + '/index.tsx') ||
      existsSync(resolved + '/index.js')
    ) {
      return resolved
    }
  }

  return null
}

/** Load package.json dependencies (including devDependencies) */
export async function loadPackageDeps(rootDir: string): Promise<Set<string>> {
  try {
    const raw = await readFile(join(rootDir, 'package.json'), 'utf-8')
    const pkg = JSON.parse(raw)
    return new Set([
      ...Object.keys(pkg.dependencies ?? {}),
      ...Object.keys(pkg.devDependencies ?? {}),
      ...Object.keys(pkg.peerDependencies ?? {}),
      ...Object.keys(pkg.optionalDependencies ?? {}),
    ])
  } catch {
    return new Set()
  }
}

/** Load requirements.txt / pyproject.toml for Python */
export async function loadPythonDeps(rootDir: string): Promise<Set<string>> {
  const deps = new Set<string>()
  try {
    const raw = await readFile(join(rootDir, 'requirements.txt'), 'utf-8')
    for (const line of raw.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const name = trimmed.split(/[=<>!\[]/)[0].split('[')[0].trim()
      if (name) deps.add(name)
    }
  } catch { /* no requirements.txt */ }

  try {
    const raw = await readFile(join(rootDir, 'pyproject.toml'), 'utf-8')
    for (const line of raw.split('\n')) {
      const trimmed = line.trim()
      const depMatch = trimmed.match(/^"?([a-zA-Z0-9_-]+)"?\s*[=<>]/)
      if (depMatch) deps.add(depMatch[1])
    }
  } catch { /* no pyproject.toml */ }

  return deps
}

/** Check if an import source looks like a barrel file */
export function isBarrelSource(source: string): boolean {
  return /(?:^|\/)(index|src|lib|utils|helpers|types|models|services|components)(\/)?$/.test(source)
}
