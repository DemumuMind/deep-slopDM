// ── Sentinel Providers ─────────────────────────────────
// Provider-specific hook integrity checks.

import { existsSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

import type { HookProvider } from '../types.js'
import { installHook } from '../install.js'
import { EXPECTED_COMMAND_FRAGMENT, checkResult, type SentinelIssue, type SentinelCheckResult } from './helpers.js'

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
export const SENTINEL_CHECKERS: Record<HookProvider, (rootDir: string, autoRepair: boolean) => SentinelCheckResult> = {
  claude: checkClaudeHook,
  cursor: checkCursorHook,
  gemini: checkGeminiHook,
  cline: checkClineHook,
}
