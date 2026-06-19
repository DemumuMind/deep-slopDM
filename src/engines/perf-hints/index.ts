// ── Perf-Hints Engine ───────────────────────────────────────────────────────
// Performance hints: N+1 query patterns, missing React memoization,
// sync I/O in async, loop allocations, string concatenation in loops.

import { relative } from 'node:path'
import type {
  Engine,
  EngineContext,
  EngineResult,
  Diagnostic,
} from '../../types/index.js'
import { processFiles } from '../../utils/batch-processor.js'
import { uniqueDiagnostics } from '../../utils/diagnostics.js'
import { collectFiles, isRelevantFile, parseBlocks } from './helpers.js'
import {
  detectLargeLoopAllocation,
  detectNPlusOne,
  detectReactMissingMemo,
  detectStringConcatInLoop,
  detectSyncInAsync,
  detectUnnecessaryAwait,
} from './rules.js'

// ── Main Engine ──────────────────────────────────────────────────────────

export const perfHintsEngine: Engine = {
  name: 'perf-hints' as const,
  description:
    'Performance hints: N+1 query patterns, missing React memoization, sync I/O in async, loop allocations, unnecessary awaits, string concatenation in loops',
  supportedLanguages: ['typescript', 'javascript'],

  async run(context: EngineContext): Promise<EngineResult> {
    const start = Date.now()
    const diagnostics: Diagnostic[] = []
    const { rootDirectory, config, files: specifiedFiles } = context

    // Reset seen keys for this run
    const seenKeys = new Set<string>()

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
        skipReason: 'No TypeScript/JavaScript files found to analyze',
      }
    }

    // Read and analyze each file using the shared batch processor
    await processFiles(filePaths, async (file) => {
      const relPath = relative(rootDirectory, file.filePath)

      // Parse block structure for scope-aware detection
      const blocks = parseBlocks(file.lines)

      // Rule 1: N+1 query pattern
      diagnostics.push(...detectNPlusOne(file.lines, relPath, blocks, seenKeys))
      // Rule 2: React component defined inside another component
      diagnostics.push(...detectReactMissingMemo(file.lines, relPath, blocks))
      // Rule 3: Synchronous file I/O inside async functions
      diagnostics.push(...detectSyncInAsync(file.lines, relPath, blocks))
      // Rule 4: Large allocation inside loops
      diagnostics.push(...detectLargeLoopAllocation(file.lines, relPath, blocks))
      // Rule 5: Unnecessary await on non-Promise values
      diagnostics.push(...detectUnnecessaryAwait(file.content, relPath))
      // Rule 6: String concatenation in loops
      diagnostics.push(...detectStringConcatInLoop(file.lines, relPath, blocks))
    })

    // Deduplicate diagnostics (same file + line + rule)
    const unique = uniqueDiagnostics(diagnostics)

    return {
      engine: this.name,
      diagnostics: unique,
      elapsed: Date.now() - start,
      skipped: false,
    }
  },
}
