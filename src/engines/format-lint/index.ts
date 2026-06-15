import { relative } from 'node:path'
import type { Diagnostic, Engine, EngineContext, EngineResult, Language } from '../../types/index.js'
import {
  buildEarlyExitResult,
  EARLY_EXIT_BATCH_SIZE,
  isEngineEarlyExitEnabled,
} from '../../config/engine-utils.js'
import { readFileContent, toLines } from '../../utils/file-utils.js'
import { collectFiles, isRelevantFile } from './helpers.js'
import {
  detectBlankLineCluster,
  detectInconsistentIndent,
  detectInconsistentQuotes,
  detectInconsistentSemicolons,
  detectMaxLineLength,
  detectTrailingCommaInconsistency,
} from './rules.js'

// ── Main Engine ──────────────────────────────────────────

export const formatLintEngine: Engine = {
  name: 'format-lint' as const,
  description:
    'Format linting: mixed indentation, inconsistent quotes, max line length, inconsistent semicolons, blank line clusters, trailing comma inconsistency',
  supportedLanguages: ['typescript', 'javascript', 'tsx', 'jsx', 'python', 'go', 'rust', 'ruby', 'php', 'java', 'csharp', 'swift'],

  async run(context: EngineContext): Promise<EngineResult> {
    const start = Date.now()
    const diagnostics: Diagnostic[] = []
    const { rootDirectory, config, files: specifiedFiles } = context

    // Max line length from config (quality.maxFileLoc or default 120)
    const maxLineLength = (config as Record<string, Record<string, unknown>>).format?.maxLineLength as number ?? 120

    // Collect files
    const filePaths = specifiedFiles
      ? specifiedFiles.filter(isRelevantFile)
      : await collectFiles(rootDirectory, config.exclude)

    if (filePaths.length === 0) {
      return {
        engine: this.name,
        diagnostics: [],
        elapsed: Date.now() - start,
        skipped: true,
        skipReason: 'No relevant files found to analyze',
      }
    }

    // Read and analyze each file
    const earlyExit = isEngineEarlyExitEnabled(
      context.config.engines['format-lint'],
      'format-lint',
    )
    // Pre-compute disabled rules for early-exit accuracy
    const disabledRules = new Set<string>()
    const rulesConfig = context.config.rules ?? {}
    for (const [rule, severity] of Object.entries(rulesConfig)) {
      if (severity === 'off') disabledRules.add(rule)
    }

    for (let i = 0; i < filePaths.length; i++) {
      const fp = filePaths[i]
      try {
        const content = await readFileContent(fp)
        const relPath = relative(rootDirectory, fp)
        const lines = toLines(content)

        // Rule 1: Inconsistent indentation
        diagnostics.push(...detectInconsistentIndent(content, lines, relPath))

        // Rule 2: Inconsistent quotes (JS/TS only)
        diagnostics.push(...detectInconsistentQuotes(content, lines, relPath))

        // Rule 3: Max line length
        diagnostics.push(...detectMaxLineLength(content, lines, relPath, maxLineLength))

        // Rule 4: Inconsistent semicolons (JS/TS only)
        diagnostics.push(...detectInconsistentSemicolons(content, lines, relPath))

        // Rule 5: Blank line clusters
        diagnostics.push(...detectBlankLineCluster(content, lines, relPath))

        // Rule 6: Trailing comma inconsistency (JS/TS only)
        diagnostics.push(...detectTrailingCommaInconsistency(content, lines, relPath))
      } catch {
        // Skip unreadable files
      }

      if (
        earlyExit &&
        i >= EARLY_EXIT_BATCH_SIZE - 1 &&
        diagnostics.filter(d => !disabledRules.has(d.rule)).length === 0
      ) {
        return buildEarlyExitResult('format-lint', Date.now() - start)
      }
    }

    // Deduplicate diagnostics (same file + line + rule)
    const seen = new Set<string>()
    const unique = diagnostics.filter((d) => {
      const key = `${d.filePath}:${d.line}:${d.rule}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })

    return {
      engine: this.name,
      diagnostics: unique,
      elapsed: Date.now() - start,
      skipped: false,
    }
  },
}
