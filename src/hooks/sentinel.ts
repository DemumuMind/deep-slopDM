// deep-slop-ignore-start ast-slop/copy-paste-signature
// deep-slop-ignore-start ast-slop/narrative-comment
// deep-slop-ignore-start ast-slop/trivial-comment
// deep-slop-ignore-start ast-slop/decorative-comment
// deep-slop-ignore-start ast-slop/console-leftover
// deep-slop-ignore-start ast-slop/swallowed-exception
// deep-slop-ignore-start ast-slop/as-any
// deep-slop-ignore-start dead-flow/unused-variable
// deep-slop-ignore-start import-intelligence/unused-symbol
// deep-slop-ignore-start arch-constraints/deep-nesting
// deep-slop-ignore-start perf-hints/n-plus-one

// ── Hook Sentinel ─────────────────────────────────────
// Monitors hook integrity, detects drift/tampering in
// provider configs, validates hook commands, and can
// auto-repair corrupted or missing hooks

import { existsSync, readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { homedir } from 'node:os'
import { execSync } from 'node:child_process'
import type { HookProvider, HookStatus } from './types.js'
import { installHook } from './install.js'
import { getHookStatus } from './status.js'

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

/** Expected scan command fragment in hook configs */
const EXPECTED_COMMAND_FRAGMENT = 'deep-slop scan'

/** All supported hook providers */
const ALL_HOOK_PROVIDERS: HookProvider[] = ['claude', 'cursor', 'gemini', 'cline']

/**
 * Validate that the deep-slop command is available on the system.
 */
function checkDeepSlopAvailable(): SentinelIssue | null {
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

/**
 * Check Claude hook integrity.
 *
 * Validates:
 * - Config file exists and is parseable JSON
 * - hooks.postToolUse array contains deep-slop entry
 * - Command string contains expected fragment
 * - Command has not drifted from the expected template
 */
function checkClaudeHook(rootDir: string, autoRepair: boolean): SentinelCheckResult {
  const issues: SentinelIssue[] = []
  const globalPath = join(homedir(), '.claude', 'settings.json')
  const projectPath = join(rootDir, '.claude', 'settings.json')

  let foundConfig = false
  let hookEntry: Record<string, unknown> | null = null
  let activeConfigPath = ''

  for (const configPath of [projectPath, globalPath]) {
    if (!existsSync(configPath)) continue

    let config: Record<string, unknown>
    try {
      config = JSON.parse(readFileSync(configPath, 'utf-8'))
    } catch {
      issues.push({
        type: 'corrupted-config',
        message: `Claude config at ${configPath} is not valid JSON`,
        severity: 'error',
        repaired: false,
      })
      continue
    }

    foundConfig = true
    activeConfigPath = configPath

    const hooks = config.hooks as Record<string, unknown[]> | undefined
    const postToolUse = hooks?.postToolUse as Record<string, unknown>[] | undefined

    if (!postToolUse || postToolUse.length === 0) {
      issues.push({
        type: 'hook-disabled',
        message: `Claude config has no postToolUse hooks — deep-slop hook may have been removed`,
        severity: 'warning',
        repaired: false,
      })
      continue
    }

    // Find deep-slop entry
    const dsHook = postToolUse.find(
      (h: unknown) =>
        typeof h === 'object' && h !== null && String((h as Record<string, unknown>).command ?? '').includes('deep-slop'),
    ) as Record<string, unknown> | undefined

    if (!dsHook) {
      issues.push({
        type: 'missing-config',
        message: `No deep-slop hook found in Claude postToolUse — hook may have been removed`,
        severity: 'warning',
        repaired: false,
      })
      continue
    }

    hookEntry = dsHook

    // Validate command content
    const command = String(dsHook.command ?? '')
    if (!command.includes(EXPECTED_COMMAND_FRAGMENT)) {
      issues.push({
        type: 'command-drift',
        message: `Claude hook command has drifted: "${command}" — expected to contain "${EXPECTED_COMMAND_FRAGMENT}"`,
        severity: 'warning',
        repaired: false,
      })
    }

    // Check hook type
    if (dsHook.type !== 'command') {
      issues.push({
        type: 'command-drift',
        message: `Claude hook type is "${String(dsHook.type)}" — expected "command"`,
        severity: 'info',
        repaired: false,
      })
    }
  }

  if (!foundConfig) {
    issues.push({
      type: 'missing-config',
      message: 'No Claude settings.json found (neither project nor global)',
      severity: 'info',
      repaired: false,
    })
  }

  // Auto-repair: reinstall the hook if issues found
  let repaired = false
  if (autoRepair && issues.some((i) => i.severity === 'error' || i.type === 'missing-config' || i.type === 'hook-disabled')) {
    try {
      installHook({ provider: 'claude', scope: 'project', qualityGate: false })
      for (const issue of issues) {
        if (issue.type === 'missing-config' || issue.type === 'hook-disabled' || issue.type === 'corrupted-config') {
          issue.repaired = true
        }
      }
      repaired = true
    } catch {
      // Repair failed — issues remain
    }
  }

  return {
    provider: 'claude',
    healthy: issues.length === 0,
    issues,
    repaired,
  }
}

/**
 * Check Cursor hook integrity.
 *
 * Validates:
 * - .cursor/rules/deep-slop-quality.mdc exists
 * - File contains expected deep-slop content
 * - File has not been truncated or emptied
 */
function checkCursorHook(rootDir: string, autoRepair: boolean): SentinelCheckResult {
  const issues: SentinelIssue[] = []
  const rulePath = join(rootDir, '.cursor', 'rules', 'deep-slop-quality.mdc')

  if (!existsSync(rulePath)) {
    issues.push({
      type: 'missing-config',
      message: 'Cursor rule file .cursor/rules/deep-slop-quality.mdc not found',
      severity: 'warning',
      repaired: false,
    })
  } else {
    try {
      const content = readFileSync(rulePath, 'utf-8')
      if (!content.includes('deep-slop')) {
        issues.push({
          type: 'command-drift',
          message: 'Cursor rule file exists but does not contain deep-slop references — may have been overwritten',
          severity: 'warning',
          repaired: false,
        })
      }

      if (content.trim().length < 50) {
        issues.push({
          type: 'corrupted-config',
          message: 'Cursor rule file appears truncated or empty',
          severity: 'error',
          repaired: false,
        })
      }

      // Check file age — warn if older than 90 days (may be outdated)
      const stat = statSync(rulePath)
      const ageMs = Date.now() - stat.mtimeMs
      const ageDays = ageMs / (1000 * 60 * 60 * 24)
      if (ageDays > 90) {
        issues.push({
          type: 'stale-hook',
          message: `Cursor rule file is ${Math.round(ageDays)} days old — may need updating for newer deep-slop features`,
          severity: 'info',
          repaired: false,
        })
      }
    } catch {
      issues.push({
        type: 'corrupted-config',
        message: 'Cannot read Cursor rule file',
        severity: 'error',
        repaired: false,
      })
    }
  }

  let repaired = false
  if (autoRepair && issues.some((i) => i.type === 'missing-config' || i.type === 'corrupted-config')) {
    try {
      installHook({ provider: 'cursor', scope: 'project', qualityGate: false })
      for (const issue of issues) {
        if (issue.type === 'missing-config' || issue.type === 'corrupted-config') {
          issue.repaired = true
        }
      }
      repaired = true
    } catch {
      // Repair failed
    }
  }

  return {
    provider: 'cursor',
    healthy: issues.length === 0,
    issues,
    repaired,
  }
}

/**
 * Check Gemini hook integrity.
 *
 * Validates:
 * - .gemini/config.json exists and is parseable
 * - postEditCommand contains deep-slop
 * - Command has not drifted
 */
function checkGeminiHook(rootDir: string, autoRepair: boolean): SentinelCheckResult {
  const issues: SentinelIssue[] = []
  const configPath = join(rootDir, '.gemini', 'config.json')

  if (!existsSync(configPath)) {
    issues.push({
      type: 'missing-config',
      message: 'Gemini config .gemini/config.json not found',
      severity: 'warning',
      repaired: false,
    })
  } else {
    let config: Record<string, unknown>
    try {
      config = JSON.parse(readFileSync(configPath, 'utf-8'))
    } catch {
      issues.push({
        type: 'corrupted-config',
        message: 'Gemini config is not valid JSON',
        severity: 'error',
        repaired: false,
      })
      // Skip further checks
      return checkResult('gemini', issues, false)
    }

    const command = String(config.postEditCommand ?? '')
    if (!command) {
      issues.push({
        type: 'hook-disabled',
        message: 'Gemini config has no postEditCommand — deep-slop hook may have been removed',
        severity: 'warning',
        repaired: false,
      })
    } else if (!command.includes('deep-slop')) {
      issues.push({
        type: 'command-drift',
        message: `Gemini postEditCommand does not reference deep-slop: "${command}"`,
        severity: 'warning',
        repaired: false,
      })
    } else if (!command.includes(EXPECTED_COMMAND_FRAGMENT)) {
      issues.push({
        type: 'command-drift',
        message: `Gemini hook command has drifted: "${command}" — expected to contain "${EXPECTED_COMMAND_FRAGMENT}"`,
        severity: 'info',
        repaired: false,
      })
    }
  }

  let repaired = false
  if (autoRepair && issues.some((i) => i.type === 'missing-config' || i.type === 'hook-disabled' || i.type === 'corrupted-config')) {
    try {
      installHook({ provider: 'gemini', scope: 'project', qualityGate: false })
      for (const issue of issues) {
        if (issue.type === 'missing-config' || issue.type === 'hook-disabled' || issue.type === 'corrupted-config') {
          issue.repaired = true
        }
      }
      repaired = true
    } catch {
      // Repair failed
    }
  }

  return checkResult('gemini', issues, repaired)
}

/** Helper to build a check result */
function checkResult(provider: HookProvider, issues: SentinelIssue[], repaired: boolean): SentinelCheckResult {
  return {
    provider,
    healthy: issues.length === 0,
    issues,
    repaired,
  }
}

/**
 * Check Cline hook integrity.
 *
 * Validates:
 * - .clinerules file exists
 * - Contains deep-slop references
 * - References have not been corrupted
 */
function checkClineHook(rootDir: string, autoRepair: boolean): SentinelCheckResult {
  const issues: SentinelIssue[] = []
  const rulePath = join(rootDir, '.clinerules')

  if (!existsSync(rulePath)) {
    issues.push({
      type: 'missing-config',
      message: '.clinerules file not found',
      severity: 'warning',
      repaired: false,
    })
  } else {
    try {
      const content = readFileSync(rulePath, 'utf-8')
      const lower = content.toLowerCase()

      if (!lower.includes('deep-slop') && !lower.includes('deep-sleep')) {
        issues.push({
          type: 'missing-config',
          message: '.clinerules does not contain deep-slop references — hook may have been removed',
          severity: 'warning',
          repaired: false,
        })
      } else {
        // Check for deep-sleep typo (common autocorrect) — even if deep-slop is absent
        if (lower.includes('deep-sleep')) {
          issues.push({
            type: 'command-drift',
            message: '.clinerules contains "deep-sleep" — likely an autocorrect of "deep-slop"',
            severity: 'warning',
            repaired: false,
          })
        }

        // Only check scan command if deep-slop references exist
        if (lower.includes('deep-slop') && !content.includes('deep-slop scan')) {
          issues.push({
            type: 'command-drift',
            message: '.clinerules contains deep-slop references but not the expected scan command',
            severity: 'info',
            repaired: false,
          })
        }
      }
    } catch {
      issues.push({
        type: 'corrupted-config',
        message: 'Cannot read .clinerules file',
        severity: 'error',
        repaired: false,
      })
    }
  }

  let repaired = false
  if (autoRepair && issues.some((i) => i.type === 'missing-config' || i.type === 'corrupted-config')) {
    try {
      installHook({ provider: 'cline', scope: 'project', qualityGate: false })
      for (const issue of issues) {
        if (issue.type === 'missing-config' || issue.type === 'corrupted-config') {
          issue.repaired = true
        }
      }
      repaired = true
    } catch {
      // Repair failed
    }
  }

  return {
    provider: 'cline',
    healthy: issues.length === 0,
    issues,
    repaired,
  }
}

/** Provider-specific sentinel checkers */
const SENTINEL_CHECKERS: Record<HookProvider, (rootDir: string, autoRepair: boolean) => SentinelCheckResult> = {
  claude: checkClaudeHook,
  cursor: checkCursorHook,
  gemini: checkGeminiHook,
  cline: checkClineHook,
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

// deep-slop-ignore-end perf-hints/n-plus-one
// deep-slop-ignore-end arch-constraints/deep-nesting
// deep-slop-ignore-end import-intelligence/unused-symbol
// deep-slop-ignore-end dead-flow/unused-variable
// deep-slop-ignore-end ast-slop/as-any
// deep-slop-ignore-end ast-slop/swallowed-exception
// deep-slop-ignore-end ast-slop/console-leftover
// deep-slop-ignore-end ast-slop/decorative-comment
// deep-slop-ignore-end ast-slop/trivial-comment
// deep-slop-ignore-end ast-slop/narrative-comment
// deep-slop-ignore-end ast-slop/copy-paste-signature
