// ── Architecture Rules Engine ───────────────────────────────────────
// User-defined architecture rules loaded from .deep-slop/rules.yml.
// Supports: forbid_import, forbid_import_from_path, require_pattern.

import { relative } from 'node:path'
import type {
  Diagnostic,
  Engine,
  EngineContext,
  EngineResult,
} from '../../types/index.js'
import { readFileContent } from '../../utils/file-utils.js'
import { collectFiles } from '../../utils/discover.js'
import { loadRules } from './loader.js'
import { applyRule } from './matchers.js'

export const archRulesEngine: Engine = {
  name: 'arch-rules' as const,
  description:
    'User-defined architecture rules from .deep-slop/rules.yml: ' +
    'forbid imports, enforce cross-layer boundaries, and require patterns.',
  supportedLanguages: ['typescript', 'javascript', 'python', 'go'],

  async run(context: EngineContext): Promise<EngineResult> {
    const start = performance.now()
    const { rootDirectory, config } = context

    // Load user rules from .deep-slop/rules.yml
    let rules
    try {
      rules = await loadRules(rootDirectory)
    } catch (err) {
      return {
        engine: this.name,
        diagnostics: [],
        elapsed: performance.now() - start,
        skipped: true,
        skipReason: `Failed to load rules: ${err instanceof Error ? err.message : String(err)}`,
      }
    }

    if (rules.length === 0) {
      return {
        engine: this.name,
        diagnostics: [],
        elapsed: performance.now() - start,
        skipped: true,
        skipReason: 'No rules defined in .deep-slop/rules.yml',
      }
    }

    // Collect files for supported languages
    const files = await collectFiles(
      rootDirectory,
      ['typescript', 'javascript', 'python', 'go'],
      config.exclude,
      context.files,
    )

    if (files.length === 0) {
      return {
        engine: this.name,
        diagnostics: [],
        elapsed: performance.now() - start,
        skipped: true,
        skipReason: 'No files found for supported languages (ts, js, py, go)',
      }
    }

    const diagnostics: Diagnostic[] = []

    // Run each rule against each file
    for (const absPath of files) {
      const relPath = relative(rootDirectory, absPath)

      let content: string
      try {
        content = await readFileContent(absPath)
      } catch {
        continue // skip unreadable files
      }

      for (const rule of rules) {
        const ruleDiagnostics = applyRule(rule, content, relPath)
        diagnostics.push(...ruleDiagnostics)
      }
    }

    return {
      engine: this.name,
      diagnostics,
      elapsed: performance.now() - start,
      skipped: false,
    }
  },
}
