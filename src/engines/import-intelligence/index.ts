// ── Import Intelligence Engine ────────────────────────
// Detects import quality issues in TypeScript/JavaScript projects.
// Combines regex parsing with tree-sitter AST for higher-confidence results.

import { join, dirname, resolve, basename } from 'node:path'
import { readFileContent, toLines, extractImports } from '../../utils/file-utils.js'
import { initParser, isAvailable } from '../../utils/tree-sitter.js'
import type { Diagnostic, Engine, EngineContext, EngineResult, FixResult } from '../../types/index.js'
import {
  type ParsedImport,
  type BarrelFile,
  type TsConfigPaths,
  parseImport,
  mergeImportSources,
  deduplicateDiagnostics,
  readPackageJson,
  readTsConfig,
  dirExists,
  fileExists,
  resolveModulePath,
} from './shared.js'
import { parseImportsAST, detectBarrelFileAST, findUsedSymbolsAST } from './ast-imports.js'
import { detectUnusedImport } from './rules/unused-import.js'
import { detectUnusedSymbol } from './rules/unused-symbol.js'
import { detectDuplicateImport } from './rules/duplicate-import.js'
import { detectSideEffectImport } from './rules/side-effect-import.js'
import { detectTypeOnlyImport } from './rules/type-only-import.js'
import { detectHallucinatedImport } from './rules/hallucinated-import.js'
import { detectBarrelBypass } from './rules/barrel-bypass.js'
import { detectCircularDependency } from './rules/circular-dependency.js'
import { detectTreeShakeable } from './rules/tree-shakeable.js'
import { detectReactAutoJsx } from './rules/react-auto-jsx.js'
import { detectReactAutoJsxNamed } from './rules/react-auto-jsx-named.js'
import { detectBrokenAlias } from './rules/broken-alias.js'
import { detectAliasCanonical } from './rules/alias-canonical.js'

// ── File Parsing ──────────────────────────────

async function parseImportsForFile(
  filePath: string,
  content: string,
): Promise<{ parsed: ParsedImport[]; astUsedSymbols?: Set<string> }> {
  const regexImports = extractImports(content, 'typescript').map(parseImport)

  if (isAvailable()) {
    try {
      const astImports = await parseImportsAST(content, filePath)
      const merged = mergeImportSources(regexImports, astImports)

      const treeSitter = await import('../../utils/tree-sitter.js')
      const astRoot = await treeSitter.parseFile(content, filePath.endsWith('.tsx'), filePath)
      const astUsedSymbols = astImports && astRoot
        ? findUsedSymbolsAST(astRoot, merged.flatMap((imp) => imp.symbols))
        : undefined

      return { parsed: merged, astUsedSymbols }
    } catch {
      return { parsed: regexImports }
    }
  }

  return { parsed: regexImports }
}

async function analyzeBarrelFile(
  filePath: string,
  content: string,
): Promise<BarrelFile | null> {
  const astResult = await detectBarrelFileAST(content, filePath)
  if (astResult) {
    astResult.filePath = filePath
    return astResult
  }

  // Regex fallback
  const lines = toLines(content)
  const reExports: BarrelFile['reExports'] = []
  let hasNonExport = false

  for (const { text } of lines) {
    const t = text.trim()
    if (!t || t.startsWith('//')) continue

    const wildcardMatch = t.match(/^export\s+\*\s+from\s+['"]([^'"]+)['"]/)
    if (wildcardMatch) {
      reExports.push({ source: wildcardMatch[1], symbols: [], isWildcard: true })
      continue
    }

    const namedMatch = t.match(/^export\s+(?:type\s+)?\{([^}]+)\}\s+from\s+['"]([^'"]+)['"]/)
    if (namedMatch) {
      const symbols = namedMatch[1].split(',').map((s) => s.trim()).filter(Boolean)
      reExports.push({ source: namedMatch[2], symbols, isWildcard: false })
      continue
    }

    const localNamed = t.match(/^export\s+(?:type\s+)?\{([^}]+)\}/)
    if (localNamed && !t.includes('from')) {
      const symbols = localNamed[1].split(',').map((s) => s.trim()).filter(Boolean)
      reExports.push({ source: '.', symbols, isWildcard: false })
      continue
    }

    hasNonExport = true
    break
  }

  if (reExports.length > 0 && !hasNonExport) {
    return { filePath, reExports }
  }
  return null
}

async function buildBarrelCache(
  files: string[],
): Promise<Map<string, BarrelFile>> {
  const cache = new Map<string, BarrelFile>()
  const indexFiles = files.filter((p) => basename(p) === 'index.ts' || basename(p) === 'index.js')

  for (const filePath of indexFiles) {
    try {
      const content = await readFileContent(filePath)
      const barrel = await analyzeBarrelFile(filePath, content)
      if (barrel) {
        const relativePath = filePath.replace(process.cwd(), '').replace(/\\/g, '/').replace(/^\//, '')
        const dirName = './' + dirname(relativePath)
        cache.set(dirName, barrel)
        cache.set(dirName.replace(/\.\.\//g, '').replace(/\//g, '/'), barrel)
      }
    } catch {
      // ignore
    }
  }

  return cache
}

// ── Engine Definition ─────────────────────────────

export const importIntelligenceEngine: Engine = {
  name: 'import-intelligence',
  description:
    'Analyzes import quality for TypeScript/JavaScript projects. Detects unused imports, duplicate imports, unused symbols, side-effect imports, type-only imports that should use `import type`, barrel-file bypasses, circular dependencies, tree-shakeable alternatives, automatic JSX runtime issues, broken tsconfig aliases, and non-canonical alias usage. AST-aware parsing suppresses false positives and improves confidence.',
  supportedLanguages: ['typescript', 'javascript'],

  async run(context: EngineContext): Promise<EngineResult> {
    const start = performance.now()

    const files = context.files ?? []
    if (files.length === 0) {
      return {
        engine: 'import-intelligence',
        diagnostics: [],
        elapsed: performance.now() - start,
        skipped: true,
        skipReason: 'No files to scan (context.files is empty)',
      }
    }

    await initParser()

    const dependencies = await readPackageJson(context.rootDirectory)
    const tsconfig = await readTsConfig(context.rootDirectory)
    const paths: TsConfigPaths = tsconfig.paths ?? {}
    const baseUrl = tsconfig.baseUrl
    const isReactAutoJsx = tsconfig.jsx === 'react-jsx' ||
      (tsconfig.jsxImportSource && tsconfig.jsxImportSource.startsWith('react')) || false

    const barrelCache = await buildBarrelCache(files)
    const fileImports = new Map<string, ParsedImport[]>()
    let hasASTImports = false
    const allDiagnostics: Diagnostic[] = []

    for (const filePath of files) {
      if (!/\.(?:ts|tsx|js|jsx|mjs|cjs)$/.test(filePath)) continue

      let content: string
      try {
        content = await readFileContent(filePath)
      } catch {
        continue
      }

      const relPath = filePath.replace(context.rootDirectory, '').replace(/^[/\\]/, '') || filePath
      const { parsed, astUsedSymbols } = await parseImportsForFile(filePath, content)
      fileImports.set(filePath, parsed)
      if (parsed.some((p) => p.viaAST)) hasASTImports = true

      for (const imp of parsed) {
        if (imp.isSideEffect) {
          allDiagnostics.push(...detectSideEffectImport(imp, relPath))
          continue
        }

        allDiagnostics.push(...detectUnusedImport(imp, relPath, content, astUsedSymbols))
        allDiagnostics.push(...detectUnusedSymbol(imp, relPath, content, astUsedSymbols))
        allDiagnostics.push(...detectTypeOnlyImport(imp, relPath, content, astUsedSymbols))
        allDiagnostics.push(...detectTreeShakeable(imp, relPath))
        allDiagnostics.push(...detectReactAutoJsx(imp, relPath, isReactAutoJsx))
        allDiagnostics.push(...detectReactAutoJsxNamed(imp, relPath, isReactAutoJsx))
        allDiagnostics.push(...detectBarrelBypass(imp, relPath, barrelCache))

        if (imp.source.startsWith('.')) {
          allDiagnostics.push(...await detectBrokenAlias(imp, relPath, paths, baseUrl, context.rootDirectory))
          allDiagnostics.push(...detectAliasCanonical(imp, relPath, paths, context.rootDirectory, baseUrl))
        } else {
          allDiagnostics.push(...await detectHallucinatedImport(imp, relPath, dependencies, paths, baseUrl, context.rootDirectory))
        }
      }

      allDiagnostics.push(...detectDuplicateImport(parsed, relPath))
    }

    allDiagnostics.push(...detectCircularDependency(fileImports, context.rootDirectory, 5, hasASTImports))

    return {
      engine: 'import-intelligence',
      diagnostics: deduplicateDiagnostics(allDiagnostics),
      elapsed: performance.now() - start,
      skipped: false,
    }
  },

  async fix(diagnostics: Diagnostic[], context: EngineContext): Promise<FixResult> {
    const fixableRules = new Set([
      'import-intelligence/unused-import',
      'import-intelligence/unused-symbol',
      'import-intelligence/duplicate-import',
      'import-intelligence/type-only-import',
      'import-intelligence/react-auto-jsx',
      'import-intelligence/react-auto-jsx-named',
    ])

    const fixable = diagnostics.filter(
      (d) => d.fixable && fixableRules.has(d.rule) && (d.suggestion?.type === 'delete' || d.suggestion?.type === 'replace'),
    )
    const remaining = diagnostics.filter((d) => !fixableRules.has(d.rule) || !d.fixable)

    const byFile = new Map<string, Diagnostic[]>()
    for (const d of fixable) {
      const list = byFile.get(d.filePath) ?? []
      list.push(d)
      byFile.set(d.filePath, list)
    }

    const modifiedFiles: string[] = []

    for (const [relPath, fileDiags] of byFile) {
      const absPath = join(context.rootDirectory, relPath)
      try {
        const content = await readFileContent(absPath)
        const lines = content.split('\n')

        const deleteLines = new Set<number>()
        const replacements = new Map<number, string>()

        for (const d of fileDiags) {
          if (d.suggestion?.type === 'delete') {
            deleteLines.add(d.line)
          } else if (d.suggestion?.type === 'replace' && d.suggestion.text) {
            replacements.set(d.line, d.suggestion.text)
          }
        }

        const newLines = lines.map((line, idx) => {
          const lineNum = idx + 1
          if (deleteLines.has(lineNum)) return null
          if (replacements.has(lineNum)) return replacements.get(lineNum)
          return line
        }).filter((line): line is string => line !== null)

        const { writeFile } = await import('node:fs/promises')
        await writeFile(absPath, newLines.join('\n'), 'utf-8')
        modifiedFiles.push(relPath)
      } catch {
        remaining.push(...fileDiags)
      }
    }

    return {
      fixed: fixable.length - (remaining.length - (diagnostics.length - fixable.length)),
      remaining,
      modifiedFiles,
    }
  },
}
