// ── Type-Safety Engine ──────────────────────────────────────────────────────
// Detects type safety issues with CONTEXT-AWARE suggestions.
// This is what separates deep-slop from aislop — we don't just flag,
// we suggest the concrete fix.

import { readFile } from 'node:fs/promises'
import { join, relative } from 'node:path'
import {
  buildEarlyExitResult,
  EARLY_EXIT_BATCH_SIZE,
  isEngineEarlyExitEnabled,
} from '../../config/engine-utils.js'
import type {
  Diagnostic,
  Engine,
  EngineContext,
  EngineResult,
} from '../../types/index.js'
import { collectFiles, isTargetFile } from './helpers.js'
import {
  detectAsAny,
  detectDoubleAssertions,
  detectGenericAny,
  detectMissingReturnTypes,
  detectNonNullAssertions,
  detectTsSuppress,
} from './rules.js'

// ── Engine Implementation ──────────────────────────────────────────────────

export const typeSafetyEngine: Engine = {
  name: 'type-safety',
  description:
    'Detects type safety issues with context-aware suggestions — as any casts, double assertions, missing return types, ts-suppress comments, non-null assertions, and generic any parameters.',
  supportedLanguages: ['typescript', 'javascript'],

  async run(context: EngineContext): Promise<EngineResult> {
    const startTime = performance.now()

    // Respect config flags
    const { flagAsAny, suggestTypes, flagDoubleAssertion } = context.config.types

    // If all features are disabled, skip
    if (!flagAsAny && !suggestTypes && !flagDoubleAssertion) {
      return {
        engine: 'type-safety',
        diagnostics: [],
        elapsed: performance.now() - startTime,
        skipped: true,
        skipReason: 'All type-safety checks disabled in config',
      }
    }

    // Determine files to scan
    const root = context.rootDirectory
    const exclude = context.config.exclude
    const files = context.files
      ? context.files.filter((f) => isTargetFile(f)).map((f) => f.startsWith('/') ? f : join(root, f))
      : await collectFiles(root, exclude)

    if (files.length === 0) {
      return {
        engine: 'type-safety',
        diagnostics: [],
        elapsed: performance.now() - startTime,
        skipped: true,
        skipReason: 'No TypeScript/JavaScript files found to scan',
      }
    }

    const allDiagnostics: Diagnostic[] = []
    const earlyExit = isEngineEarlyExitEnabled(
      context.config.engines['type-safety'],
      'type-safety',
    )
    // Use orchestrator-provided disabled rules for early-exit accuracy
    const disabledRules = context.disabledRules ?? new Set<string>()
    const wildcardOff: string[] = (context as any)._wildcardOff ?? []
    const rulesConfig: Record<string, string> = (context as any).rulesConfig ?? {}

    // Helper: is a rule effectively disabled or suppressed?
    const isRuleSuppressed = (rule: string) =>
      disabledRules.has(rule) || wildcardOff.some(p => rule.startsWith(p))

    // Check if ALL type-safety rules are suppressed/downgraded in config
    // If every rule this engine can produce is set to 'off' or overridden
    // to a non-default severity, early-exit immediately
    const engineRulePrefixes = [
      'types/as-any', 'types/double-assertion', 'types/missing-return-type',
      'types/ts-suppress', 'types/non-null-assertion', 'types/generic-any',
    ]
    const allRulesSuppressed = engineRulePrefixes.every(rule =>
      isRuleSuppressed(rule) || rulesConfig[rule] === 'off'
    )
    if (allRulesSuppressed) {
      return {
        engine: 'type-safety',
        diagnostics: [],
        elapsed: performance.now() - startTime,
        skipped: true,
        skipReason: 'All type-safety rules suppressed in config',
      }
    }

    // Process each file
    for (let i = 0; i < files.length; i++) {
      const filePath = files[i]
      let content: string
      try {
        content = await readFile(filePath, 'utf-8')
      } catch {
        continue
      }

      const lines = content.split('\n')
      const relPath = relative(root, filePath).replace(/\\/g, '/')

      // 1. `as any` detection (if enabled)
      if (flagAsAny) {
        allDiagnostics.push(...detectAsAny(lines, relPath))
      }

      // 2. Double type assertions (if enabled)
      if (flagDoubleAssertion) {
        allDiagnostics.push(...detectDoubleAssertions(lines, relPath))
      }

      // 3. Missing return types (if suggestTypes enabled)
      if (suggestTypes) {
        allDiagnostics.push(...detectMissingReturnTypes(lines, relPath))
      }

      // 4. @ts-ignore / @ts-expect-error (always on for TS files)
      allDiagnostics.push(...detectTsSuppress(lines, relPath))

      // 5. Non-null assertions (always on for TS files)
      allDiagnostics.push(...detectNonNullAssertions(lines, relPath))

      // 6. Generic type parameter misuse (always on for TS files)
      allDiagnostics.push(...detectGenericAny(lines, relPath))

      // Early-exit heuristic
      const activeDiagCount = allDiagnostics.filter(d => !isRuleSuppressed(d.rule)).length
      if (
        earlyExit &&
        i >= EARLY_EXIT_BATCH_SIZE - 1 &&
        activeDiagCount === 0
      ) {
        return buildEarlyExitResult('type-safety', performance.now() - startTime)
      }
    }

    return {
      engine: 'type-safety',
      diagnostics: allDiagnostics,
      elapsed: performance.now() - startTime,
      skipped: false,
    }
  },

  async fix(
    diagnostics: Diagnostic[],
    _context: EngineContext,
  ): Promise<import('../../types/index.js').FixResult> {
    // Auto-fix is limited to simple replacements.
    // Most type-safety fixes require human judgment (designing interfaces),
    // so we only handle a few high-confidence cases.

    const fixable = diagnostics.filter(
      (d) =>
        d.fixable &&
        d.suggestion &&
        d.suggestion.type === 'replace' &&
        d.suggestion.confidence >= 0.8,
    )

    // For now, we report what could be fixed but don't modify files
    // since most fixes require understanding the broader code context.
    // Future: implement targeted replacements for high-confidence suggestions.

    return {
      fixed: 0,
      remaining: diagnostics,
      modifiedFiles: [],
    }
  },
}
