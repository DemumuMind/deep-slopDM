// ── AST-Slop Engine ──────────────────────────
// Detects AI-authored code patterns using regex + tree-sitter AST context.
// Tree-sitter integration provides AST-aware enhancements; regex remains the
// fallback when tree-sitter is unavailable.

import { join } from 'node:path'
import { readFileContent, toLines } from '../../utils/file-utils.js'
import { processFiles } from '../../utils/batch-processor.js'
import type { FileData } from '../../utils/batch-processor.js'
import {
  initParser,
  parseFile,
  isAvailable,
  initPythonParser,
  parsePython,
  isPythonAvailable,
} from '../../utils/tree-sitter.js'
import type { Diagnostic, Engine, EngineContext, EngineResult, FixResult, Language } from '../../types/index.js'
import { loadPackageDeps, loadPythonDeps, loadTsconfigPaths, languageFromPath, tsLangHint } from './shared.js'
import { detectNarrativeComment } from './rules/narrative-comment.js'
import { detectTrivialComment } from './rules/trivial-comment.js'
import { detectDecorativeComment } from './rules/decorative-comment.js'
import { detectConsoleLeftover } from './rules/console-leftover.js'
import { detectTodoStub } from './rules/todo-stub.js'
import { detectGenericName } from './rules/generic-name.js'
import { detectDefensiveTypeof } from './rules/defensive-typeof.js'
import { detectDefensiveIsinstance } from './rules/defensive-isinstance.js'
import { detectSwallowedException } from './rules/swallowed-exception.js'
import { detectDoubleAssertion } from './rules/double-assertion.js'
import { detectAsAny } from './rules/as-any.js'
import { detectHallucinatedImport } from './rules/hallucinated-import.js'
import { detectUnnecessaryAbstraction } from './rules/unnecessary-abstraction.js'
import { detectSilentRecovery } from './rules/silent-recovery.js'
import { detectHardcodedConfig } from './rules/hardcoded-config.js'
import { detectMetaComment } from './rules/meta-comment.js'
import { detectDebugPath } from './rules/debug-path.js'
import { detectSuspiciousAlias } from './rules/suspicious-alias.js'
import { detectWorkspaceMisconfig } from './rules/workspace-misconfig.js'
import { detectOverdefensiveType } from './rules/overdefensive-type.js'
import { detectPlaceholderImpl } from './rules/placeholder-impl.js'
import { detectCopyPasteSignature } from './rules/copy-paste-signature.js'
import { detectBarrelTypeImport } from './rules/barrel-type-import.js'
import { detectBarrelWildcardImport } from './rules/barrel-wildcard-import.js'
import {
  detectEmptyCatchAST,
  detectAsAnyAST,
  detectConsoleLeftoversAST,
  detectDoubleAssertionAST,
  detectPythonAIPatternsAST,
} from './ast-detectors.js'

// ── Deduplication ────────────────────────────────

/** Deduplicate diagnostics: prefer AST-confirmed over regex on same line+rule */
function dedupDiagnostics(diagnostics: Diagnostic[]): Diagnostic[] {
  const byKey = new Map<string, Diagnostic[]>()

  for (const d of diagnostics) {
    const key = `${d.filePath}::${d.rule}::${d.line}`
    const list = byKey.get(key) ?? []
    list.push(d)
    byKey.set(key, list)
  }

  const results: Diagnostic[] = []
  for (const [, group] of byKey) {
    if (group.length === 1) {
      results.push(group[0])
      continue
    }
    const astConfirmed = group.find((d) => d.detail?.astConfirmed === true)
    if (astConfirmed) {
      results.push(astConfirmed)
    } else {
      results.push(group[0])
    }
  }
  return results
}

// ── File Analysis ──────────────────────────────

async function analyzeFile(
  file: FileData,
  rootDir: string,
  knownDeps: Set<string>,
  tsconfigPaths: ReturnType<typeof loadTsconfigPaths>,
): Promise<Diagnostic[]> {
  const diagnostics: Diagnostic[] = []
  const filePath = file.filePath
  const language = languageFromPath(filePath)
  if (!language) return diagnostics
  if (language !== 'typescript' && language !== 'javascript' && language !== 'python') {
    return diagnostics
  }

  const { content, lines } = file
  const relPath = filePath.replace(rootDir, '').replace(/^[/\\]/, '') || filePath

  // Regex detectors
  diagnostics.push(...detectNarrativeComment(lines, relPath, language))
  diagnostics.push(...detectDecorativeComment(lines, relPath))
  diagnostics.push(...detectTrivialComment(lines, relPath, language))
  diagnostics.push(...detectConsoleLeftover(lines, relPath, language))
  diagnostics.push(...detectTodoStub(lines, relPath, language))
  diagnostics.push(...detectGenericName(lines, relPath, language))
  diagnostics.push(...detectDefensiveTypeof(lines, relPath, language))
  diagnostics.push(...detectDefensiveIsinstance(lines, relPath, language))
  diagnostics.push(...detectSwallowedException(lines, relPath, language))

  if (language === 'typescript') {
    diagnostics.push(...detectAsAny(lines, relPath))
    diagnostics.push(...detectDoubleAssertion(lines, relPath))
  }

  diagnostics.push(...detectHallucinatedImport(content, lines, relPath, language, knownDeps, tsconfigPaths, rootDir))
  diagnostics.push(...detectUnnecessaryAbstraction(content, lines, relPath, language))
  diagnostics.push(...detectSilentRecovery(lines, relPath, language))
  diagnostics.push(...detectHardcodedConfig(lines, relPath, language))
  diagnostics.push(...detectMetaComment(lines, relPath))
  diagnostics.push(...detectDebugPath(lines, relPath, language))
  diagnostics.push(...detectSuspiciousAlias(content, lines, relPath, language))
  diagnostics.push(...detectOverdefensiveType(lines, relPath, language))
  diagnostics.push(...detectPlaceholderImpl(lines, relPath, language))
  diagnostics.push(...detectCopyPasteSignature(content, lines, relPath, language))

  // Tree-sitter AST enhancement
  const isTsLike = language === 'typescript' || language === 'javascript'
  if (isTsLike && isAvailable()) {
    const isTsx = tsLangHint(filePath) === 'tsx'
    const astRoot = await parseFile(content, isTsx, filePath)
    if (astRoot) {
      diagnostics.push(...detectEmptyCatchAST(astRoot, relPath))
      diagnostics.push(...detectAsAnyAST(astRoot, relPath))
      diagnostics.push(...detectConsoleLeftoversAST(astRoot, relPath))
      diagnostics.push(...detectDoubleAssertionAST(astRoot, relPath))
      diagnostics.push(...detectBarrelTypeImport(astRoot, relPath))
      diagnostics.push(...detectBarrelWildcardImport(astRoot, relPath))
    }
    return dedupDiagnostics(diagnostics)
  }

  if (language === 'python') {
    const pyAvailable = await initPythonParser()
    if (pyAvailable && isPythonAvailable()) {
      const astRoot = await parsePython(content, filePath)
      if (astRoot) {
        diagnostics.push(...detectPythonAIPatternsAST(astRoot, relPath))
      }
      return dedupDiagnostics(diagnostics)
    }
  }

  return diagnostics
}

// ── Engine Definition ─────────────────────────────

export const astSlopEngine: Engine = {
  name: 'ast-slop',
  description:
    'Detects AI-authored code patterns using regex + tree-sitter AST context analysis. Flags narrative comments, decorative blocks, trivial restating comments, debug leftovers, TODO stubs, generic variable names, defensive coding patterns, swallowed exceptions, unsafe type casts, hallucinated imports, unnecessary abstractions, silent recovery, hardcoded config, meta comments, debug paths, suspicious aliases, workspace misconfig, overdefensive types, placeholder implementations, and copy-paste signatures. Tree-sitter AST enhancements suppress false positives and add barrel-import detection when available.',
  supportedLanguages: ['typescript', 'javascript', 'python'],

  async run(context: EngineContext): Promise<EngineResult> {
    const start = performance.now()

    const tsAvailable = await initParser()

    const files = context.files ?? []
    if (files.length === 0) {
      return {
        engine: 'ast-slop',
        diagnostics: [],
        elapsed: performance.now() - start,
        skipped: true,
        skipReason: 'No files to scan (context.files is empty)',
      }
    }

    const hasJS = context.languages.includes('typescript') || context.languages.includes('javascript')
    const hasPython = context.languages.includes('python')

    let knownDeps = new Set<string>()
    if (hasJS) {
      knownDeps = await loadPackageDeps(context.rootDirectory)
    }
    if (hasPython) {
      const pyDeps = await loadPythonDeps(context.rootDirectory)
      knownDeps = new Set([...knownDeps, ...pyDeps])
    }

    const tsconfigPaths = hasJS ? loadTsconfigPaths(context.rootDirectory) : null

    const allDiagnostics: Diagnostic[] = []
    const batchSize = 20

    for (let i = 0; i < files.length; i += batchSize) {
      const batch = files.slice(i, i + batchSize)
      await processFiles(batch, async (file) => {
        const diags = await analyzeFile(file, context.rootDirectory, knownDeps, tsconfigPaths)
        allDiagnostics.push(...diags)
      })
    }

    const pkgJsonPath = join(context.rootDirectory, 'package.json')
    const wsDiags = await detectWorkspaceMisconfig(context.rootDirectory, pkgJsonPath)
    allDiagnostics.push(...wsDiags)

    return {
      engine: 'ast-slop',
      diagnostics: allDiagnostics,
      elapsed: performance.now() - start,
      skipped: false,
    }
  },

  async fix(diagnostics: Diagnostic[], context: EngineContext): Promise<FixResult> {
    const fixableRules = new Set([
      'ast-slop/narrative-comment',
      'ast-slop/decorative-comment',
      'ast-slop/trivial-comment',
      'ast-slop/console-leftover',
    ])

    const fixable = diagnostics.filter(
      (d) => d.fixable && fixableRules.has(d.rule) && d.suggestion?.type === 'delete',
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
        const lines = toLines(content)
        const linesToRemove = new Set(fileDiags.map((d) => d.line))

        const newLines = lines
          .filter((l) => !linesToRemove.has(l.num))
          .map((l) => l.text)
          .join('\n')

        const { writeFile } = await import('node:fs/promises')
        await writeFile(absPath, newLines, 'utf-8')
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
