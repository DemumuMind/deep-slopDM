import type { EngineName, EngineResult } from '../types/index.js'

/** Number of files to scan before deciding whether to early-exit a zero-issue engine */
export const EARLY_EXIT_BATCH_SIZE = 10

/**
 * Engines that are considered mandatory — they should scan every file even when
 * the early-exit heuristic is enabled, because they cover critical categories
 * (security, AI slop, architecture, etc.).
 */
export const MANDATORY_ENGINES = new Set<EngineName>([
  'ast-slop',
  'import-intelligence',
  'dead-flow',
  'security-deep',
  'arch-constraints',
  'dup-detect',
  'perf-hints',
  'i18n-lint',
  'config-lint',
  'meta-quality',
  'arch-rules',
  'lint-external',
  'framework-lint',
  'markup-lint',
  'rust-deep',
  'python-deep',
  'go-deep',
])

/** Check whether an engine entry is enabled (supports boolean and object forms) */
export function isEngineEnabled(value: unknown): boolean {
  return value !== false
}

/**
 * Check whether early-exit is enabled for a given engine.
 * Mandatory engines never early-exit, regardless of config.
 */
export function isEngineEarlyExitEnabled(value: unknown, engineName: EngineName): boolean {
  if (MANDATORY_ENGINES.has(engineName)) return false
  if (value === false) return false
  if (typeof value === 'object' && value !== null) {
    return (value as { earlyExit?: boolean }).earlyExit !== false
  }
  return true
}

/**
 * Build an early-exit result when an engine has scanned the first batch of files
 * and found no diagnostics.
 */
export function buildEarlyExitResult(engineName: EngineName, elapsedMs: number): EngineResult {
  return {
    name: engineName,
    engine: engineName,
    diagnostics: [],
    elapsed: elapsedMs,
    skipped: true,
    skipReason: `early-exit: no issues in first ${EARLY_EXIT_BATCH_SIZE} files`,
  }
}
