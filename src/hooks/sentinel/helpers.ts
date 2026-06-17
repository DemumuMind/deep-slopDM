// ── Sentinel Helpers ────────────────────────────────────
// Shared types, constants, and utilities for hook sentinel.

import { execSync } from 'node:child_process'

import type { HookProvider } from '../types.js'

export interface SentinelCheckResult {
  /** Provider that was checked */
  provider: HookProvider
  /** Whether the hook is healthy */
  healthy: boolean
  /** Issues detected (empty if healthy) */
  issues: SentinelIssue[]
  /** Whether issues were auto-repaired */
  repaired: boolean
}

export interface SentinelIssue {
  /** Issue type */
  type: 'missing-config' | 'missing-command' | 'corrupted-config' | 'command-drift' | 'stale-hook' | 'hook-disabled'
  /** Human-readable description */
  message: string
  /** Severity of the issue */
  severity: 'error' | 'warning' | 'info'
  /** Whether this issue was auto-repaired */
  repaired: boolean
}

/** Expected scan command fragment in hook configs */
export const EXPECTED_COMMAND_FRAGMENT = 'deep-slop scan'

/** All supported hook providers */
export const ALL_HOOK_PROVIDERS: HookProvider[] = ['claude', 'cursor', 'gemini', 'cline']

/**
 * Validate that the deep-slop command is available on the system.
 */
export function checkDeepSlopAvailable(): SentinelIssue | null {
  try {
    execSync('deep-slop --version', { stdio: 'pipe', timeout: 5000 })
    return null
  } catch {
    return {
      type: 'missing-command',
      message: 'deep-slop command not found on PATH — hooks will fail silently',
      severity: 'error',
      repaired: false,
    }
  }
}

/** Helper to build a check result */
export function checkResult(provider: HookProvider, issues: SentinelIssue[], repaired: boolean): SentinelCheckResult {
  return {
    provider,
    healthy: issues.length === 0,
    issues,
    repaired,
  }
}

/**
 * Format sentinel results for CLI output.
 */
export function formatSentinelResults(results: SentinelCheckResult[]): string {
  const lines: string[] = []

  for (const result of results) {
    const icon = result.healthy ? '✔' : result.repaired ? '⟳' : '✖'
    const color = result.healthy ? 'success' : result.repaired ? 'warning' : 'error'
    lines.push(`  ${icon} ${result.provider}: ${result.healthy ? 'healthy' : result.repaired ? 'repaired' : 'issues found'}`)

    for (const issue of result.issues) {
      const sevIcon = issue.severity === 'error' ? '✖' : issue.severity === 'warning' ? '⚠' : 'ℹ'
      const repairTag = issue.repaired ? ' [repaired]' : ''
      lines.push(`    ${sevIcon} ${issue.message}${repairTag}`)
    }
  }

  const healthyCount = results.filter((r) => r.healthy).length
  const totalIssues = results.reduce((sum, r) => sum + r.issues.length, 0)
  const repairedCount = results.filter((r) => r.repaired).length

  lines.push('')
  lines.push(`  ${healthyCount}/${results.length} hooks healthy, ${totalIssues} issue(s) found${repairedCount > 0 ? `, ${repairedCount} repaired` : ''}`)

  return lines.join('\n')
}
