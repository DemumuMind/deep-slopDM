// ── Import Intelligence Shared Helpers ─────────────────────
// Common types and utilities used by all import-intelligence rule detectors.

import { stat } from 'node:fs/promises'
import { join, resolve, dirname } from 'node:path'
import type { Diagnostic, Severity } from '../../types/index.js'
import { readFileContent, type ImportInfo } from '../../utils/file-utils.js'

// ── Constants ───────────────────────────────

/** Packages known to support deep / tree-shakeable imports */
export const TREE_SHAKEABLE_PACKAGES: Record<string, string> = {
  lodash: 'lodash/{symbol}',
  'lodash-es': 'lodash-es/{symbol}',
  ramda: 'ramda/src/{symbol}',
  underscore: 'underscore/cjs/{symbol}',
  rxjs: 'rxjs/{symbol}',
  d3: 'd3-{symbol}',
  'date-fns': 'date-fns/{symbol}',
}

/** Side-effect-only import pattern (no bindings) */
export const SIDE_EFFECT_RE = /^import\s+['"][^'"]+['"];?\s*$/

/** Named-import extraction: `import { A, B as C, ... } from ...` */
export const NAMED_IMPORTS_RE = /import\s+(?:type\s+)?\{([^}]+)\}/

/** Default-import extraction: `import X from ...` (no braces) */
export const DEFAULT_IMPORT_RE = /^import\s+(?:type\s+)?(\w+)\s+from\s+['"]/

/** Namespace import: `import * as X from ...` */
export const NAMESPACE_IMPORT_RE = /^import\s+\*\s+as\s+(\w+)\s+from\s+['"]/

/** React version threshold for automatic JSX runtime */
export const REACT_AUTOMATIC_JSX_VERSION = 17

/** Drizzle ORM symbols that are commonly flagged as unused (false positives) */
export const DRIZZLE_FP_SYMBOLS = new Set([
  'sql', 'count', 'desc', 'and', 'inArray', 'eq', 'ne', 'gt', 'gte',
  'lt', 'lte', 'like', 'ilike', 'not', 'or', 'between', 'exists',
  'notInArray', 'isNull', 'isNotNull',
])

/** Packages that are Drizzle ORM */
export const DRIZZLE_PACKAGES = new Set([
  'drizzle-orm', 'drizzle-orm/sqlite-core', 'drizzle-orm/pg-core',
  'drizzle-orm/mysql-core', 'drizzle-orm/sqlite-singlestore-core',
])

// ── Internal types ─────────────────────────────

export interface ParsedImport extends ImportInfo {
  symbols: string[]
  isSideEffect: boolean
  isNamespace: boolean
  namespaceAlias: string
  viaAST: boolean
}

export interface BarrelFile {
  filePath: string
  reExports: { source: string; symbols: string[]; isWildcard: boolean; isTypeOnly?: boolean }[]
}

export interface TsConfigPaths {
  [alias: string]: string[]
}

export interface ImportGraph {
  adjacency: Map<string, Set<string>>
  reverse: Map<string, Set<string>>
}

export interface LazyImport {
  source: string
  line: number
  insideFunction: boolean
  isDynamic: boolean
}

// ── Diagnostic helper ─────────────────────────────

export function diag(
  filePath: string,
  rule: string,
  severity: Severity,
  message: string,
  line: number,
  help: string,
  opts: Partial<Pick<Diagnostic, 'suggestion' | 'detail' | 'fixable' | 'column'>> = {},
): Diagnostic {
  return {
    filePath,
    engine: 'import-intelligence',
    rule,
    severity,
    message,
    help,
    line,
    column: opts.column ?? 1,
    category: 'imports',
    fixable: opts.fixable ?? false,
    suggestion: opts.suggestion,
    detail: opts.detail,
  }
}

// ── Import parsing helpers ──────────────────────────

/** Parse an import line into richer ParsedImport (regex fallback) */
export function parseImport(imp: ImportInfo): ParsedImport {
  const raw = imp.raw.trim()
  const isSideEffect = SIDE_EFFECT_RE.test(raw)

  let symbols: string[] = []
  const namedMatch = raw.match(NAMED_IMPORTS_RE)
  if (namedMatch) {
    symbols = namedMatch[1]
      .split(',')
      .map((s) => {
        const trimmed = s.trim()
        const asMatch = trimmed.match(/^(\w+)\s+as\s+(\w+)$/)
        return asMatch ? asMatch[2] : trimmed
      })
      .filter(Boolean)
  }

  const defaultMatch = raw.match(DEFAULT_IMPORT_RE)
  if (defaultMatch && !raw.includes('{')) {
    symbols.push(defaultMatch[1])
  }

  let isNamespace = false
  let namespaceAlias = ''
  const nsMatch = raw.match(NAMESPACE_IMPORT_RE)
  if (nsMatch) {
    isNamespace = true
    namespaceAlias = nsMatch[1]
    symbols.push(nsMatch[1])
  }

  return {
    ...imp,
    symbols,
    isSideEffect,
    isNamespace,
    namespaceAlias,
    viaAST: false,
  }
}

/** Check if a symbol is used in the file body (text after the import block) */
export function isSymbolUsed(symbol: string, bodyAfterImports: string): boolean {
  const re = new RegExp(`\\b${escapeRegex(symbol)}\\b`)
  return re.test(bodyAfterImports)
}

/** Escape special regex characters */
export function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// ── Project metadata helpers ───────────────────────

/** Read and parse package.json */
export async function readPackageJson(rootDir: string): Promise<Record<string, string> | null> {
  try {
    const content = await readFileContent(join(rootDir, 'package.json'))
    const pkg = JSON.parse(content)
    return { ...pkg.dependencies, ...pkg.devDependencies, ...pkg.peerDependencies }
  } catch {
    return null
  }
}

/** Read and parse tsconfig.json for paths and compilerOptions */
export async function readTsConfig(rootDir: string): Promise<{
  paths?: TsConfigPaths
  baseUrl?: string
  jsx?: string
  jsxImportSource?: string
}> {
  try {
    const content = await readFileContent(join(rootDir, 'tsconfig.json'))
    const tsconfig = JSON.parse(content)
    const co = tsconfig.compilerOptions ?? {}
    return {
      paths: co.paths,
      baseUrl: co.baseUrl,
      jsx: co.jsx,
      jsxImportSource: co.jsxImportSource,
    }
  } catch {
    return {}
  }
}

/** Check whether a file path exists */
export async function fileExists(p: string): Promise<boolean> {
  try {
    const s = await stat(p)
    return s.isFile()
  } catch {
    return false
  }
}

/** Check whether a directory exists */
export async function dirExists(p: string): Promise<boolean> {
  try {
    const s = await stat(p)
    return s.isDirectory()
  } catch {
    return false
  }
}

/** Try to resolve a module specifier relative to a file */
export async function resolveModulePath(
  source: string,
  fromFile: string,
  rootDir: string,
): Promise<string | null> {
  if (source.startsWith('.') || source.startsWith('/')) {
    const baseDir = dirname(fromFile)
    for (const ext of ['', '.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.tsx', '/index.js']) {
      const candidate = resolve(baseDir, source + ext)
      if (await fileExists(candidate)) return candidate
    }
    const dirCandidate = resolve(baseDir, source)
    if (await dirExists(dirCandidate)) {
      for (const idx of ['index.ts', 'index.tsx', 'index.js']) {
        if (await fileExists(join(dirCandidate, idx))) return join(dirCandidate, idx)
      }
    }
    return null
  }

  const nodeModulesPath = join(rootDir, 'node_modules', source)
  if (await dirExists(nodeModulesPath)) return nodeModulesPath
  for (const ext of ['.ts', '.tsx', '.js', '.jsx']) {
    if (await fileExists(nodeModulesPath + ext)) return nodeModulesPath + ext
  }
  return null
}

/** Resolve a tsconfig path alias to a real path */
export function resolveAliasPath(
  source: string,
  paths: TsConfigPaths,
  baseUrl: string,
  rootDir: string,
): { alias: string; resolvedPattern: string } | null {
  const sortedAliases = Object.keys(paths).sort((a, b) => b.length - a.length)

  for (const alias of sortedAliases) {
    const aliasRegexStr = '^' + escapeRegex(alias).replace(/\\\*/g, '(.*)') + '$'
    const match = source.match(new RegExp(aliasRegexStr))
    if (match) {
      const targetPattern = paths[alias][0]
      const resolved = targetPattern.replace(/\*/g, match[1])
      const fullResolved = resolve(rootDir, baseUrl ?? '.', resolved)
      return { alias, resolvedPattern: fullResolved }
    }
  }
  return null
}

// ── Deduplication ───────────────────────────────

/** Merge regex-parsed and AST-parsed imports, preferring AST-confirmed */
export function mergeImportSources(
  regexImports: ParsedImport[],
  astImports: ParsedImport[] | null,
): ParsedImport[] {
  if (!astImports) return regexImports

  const seen = new Map<string, ParsedImport>()

  for (const imp of regexImports) {
    const key = `${imp.source}:${imp.line}`
    seen.set(key, imp)
  }

  for (const imp of astImports) {
    const key = `${imp.source}:${imp.line}`
    const existing = seen.get(key)
    if (existing) {
      seen.set(key, {
        ...existing,
        symbols: imp.symbols.length > 0 ? imp.symbols : existing.symbols,
        isTypeOnly: imp.isTypeOnly ?? existing.isTypeOnly,
        viaAST: true,
      })
    } else {
      seen.set(key, imp)
    }
  }

  return [...seen.values()]
}

/** Deduplicate diagnostics: prefer AST-confirmed over regex-guessed */
export function deduplicateDiagnostics(diagnostics: Diagnostic[]): Diagnostic[] {
  const seen = new Map<string, Diagnostic>()

  for (const d of diagnostics) {
    const key = `${d.filePath}:${d.rule}:${d.line}`
    const existing = seen.get(key)
    if (!existing) {
      seen.set(key, d)
      continue
    }

    const existingAST = existing.detail?.astConfirmed === true
    const currentAST = d.detail?.astConfirmed === true

    if (currentAST && !existingAST) {
      seen.set(key, d)
    } else if (currentAST && existingAST) {
      const currentConf = d.suggestion?.confidence ?? 0
      const existingConf = existing.suggestion?.confidence ?? 0
      if (currentConf > existingConf) {
        seen.set(key, d)
      }
    }
  }

  return [...seen.values()]
}
