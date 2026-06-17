// ── Hook Sentinel ──────────────────────────────────────
// Monitors hook integrity, detects drift/tampering in
// provider configs, validates hook commands, and can
// auto-repair corrupted or missing hooks.

import type { HookProvider } from '../types.js'
import { SENTINEL_CHECKERS } from './providers.js'
import { ALL_HOOK_PROVIDERS, checkDeepSlopAvailable, type SentinelCheckResult } from './helpers.js'

export { formatSentinelResults, type SentinelCheckResult, type SentinelIssue } from './helpers.js'

export interface SentinelOptions {
  /** Which providers to check (defaults to all) */
  providers?: HookProvider[]
  /** Whether to auto-repair issues */
  autoRepair: boolean
  /** Whether to check that deep-slop command itself is available */
  checkCommand: boolean
  /** Root directory (defaults to cwd) */
  rootDir: string
}

/**
 * Run the hook sentinel — validate all installed hooks for integrity.
 *
 * Checks each provider's config file for:
 * - Missing or corrupted configuration
 * - Command drift (hook command changed from expected)
 * - Disabled or removed hooks
 * - Stale hooks (very old, may need updating)
 *
 * Optionally auto-repairs issues by reinstalling hooks.
 */
export function runSentinel(options: SentinelOptions): SentinelCheckResult[] {
  const providers = options.providers ?? ALL_HOOK_PROVIDERS
  const results: SentinelCheckResult[] = []

  // First check that deep-slop itself is available
  if (options.checkCommand) {
    const cmdIssue = checkDeepSlopAvailable()
    if (cmdIssue) {
      // This is a global issue, not per-provider
      // We'll add it to each provider's results
      for (const provider of providers) {
        results.push({
          provider,
          healthy: false,
          issues: [cmdIssue],
          repaired: false,
        })
      }
      return results
    }
  }

  // Check each provider
  for (const provider of providers) {
    const checker = SENTINEL_CHECKERS[provider]
    if (checker) {
      results.push(checker(options.rootDir, options.autoRepair))
    }
  }

  return results
}
