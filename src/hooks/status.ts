// ── Hook Status ────────────────────────────────────
// Check installation status of deep-slop hooks

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import type { HookProvider, HookStatus } from './types.js'

function checkClaudeStatus(rootDir: string, homeDir: string): HookStatus {
  const globalPath = join(homeDir, '.claude', 'settings.json')
  const projectPath = join(rootDir, '.claude', 'settings.json')

  for (const [scope, configPath] of [['global', globalPath], ['project', projectPath]] as const) {
    if (!existsSync(configPath)) continue

    try {
      const config = JSON.parse(readFileSync(configPath, 'utf-8'))
      const hooks = config.hooks as Record<string, unknown[]> | undefined
      const postToolUse = hooks?.postToolUse
      if (!postToolUse) continue

      const found = postToolUse.some(
        (h: unknown) =>
          typeof h === 'object' && h !== null && String((h as Record<string, unknown>).command ?? '').includes('deep-slop'),
      )

      if (found) {
        const hook = postToolUse.find(
          (h: unknown) =>
            typeof h === 'object' && h !== null && String((h as Record<string, unknown>).command ?? '').includes('deep-slop'),
        ) as Record<string, unknown> | undefined
        const command = String(hook?.command ?? '')
        const qualityGate = command.includes('baseline') || command.includes('quality')
        return { provider: 'claude', installed: true, scope, qualityGate, path: configPath }
      }
    } catch {
      // Skip unparseable files
    }
  }

  return { provider: 'claude', installed: false, scope: 'none', qualityGate: false, path: '' }
}

function checkCursorStatus(rootDir: string): HookStatus {
  const rulePath = join(rootDir, '.cursor', 'rules', 'deep-slop-quality.mdc')

  if (!existsSync(rulePath)) {
    return { provider: 'cursor', installed: false, scope: 'none', qualityGate: false, path: '' }
  }

  try {
    const content = readFileSync(rulePath, 'utf-8')
    const qualityGate = content.includes('baseline') || content.includes('quality')
    return { provider: 'cursor', installed: true, scope: 'project', qualityGate, path: rulePath }
  } catch {
    return { provider: 'cursor', installed: false, scope: 'none', qualityGate: false, path: '' }
  }
}

function checkGeminiStatus(rootDir: string): HookStatus {
  const configPath = join(rootDir, '.gemini', 'config.json')

  if (!existsSync(configPath)) {
    return { provider: 'gemini', installed: false, scope: 'none', qualityGate: false, path: '' }
  }

  try {
    const config = JSON.parse(readFileSync(configPath, 'utf-8'))
    const command = String(config.postEditCommand ?? '')
    if (!command.includes('deep-slop')) {
      return { provider: 'gemini', installed: false, scope: 'none', qualityGate: false, path: '' }
    }
    const qualityGate = command.includes('baseline') || command.includes('quality')
    return { provider: 'gemini', installed: true, scope: 'project', qualityGate, path: configPath }
  } catch {
    return { provider: 'gemini', installed: false, scope: 'none', qualityGate: false, path: '' }
  }
}

function checkClineStatus(rootDir: string): HookStatus {
  const rulePath = join(rootDir, '.clinerules')

  if (!existsSync(rulePath)) {
    return { provider: 'cline', installed: false, scope: 'none', qualityGate: false, path: '' }
  }

  try {
    const content = readFileSync(rulePath, 'utf-8')
    const hasHook = content.toLowerCase().includes('deep-slop')
    if (!hasHook) {
      return { provider: 'cline', installed: false, scope: 'none', qualityGate: false, path: '' }
    }
    const qualityGate = content.includes('baseline') || content.includes('quality')
    return { provider: 'cline', installed: true, scope: 'project', qualityGate, path: rulePath }
  } catch {
    return { provider: 'cline', installed: false, scope: 'none', qualityGate: false, path: '' }
  }
}

const STATUS_CHECKERS: Record<HookProvider, (rootDir: string, homeDir: string) => HookStatus> = {
  claude: checkClaudeStatus,
  cursor: checkCursorStatus,
  gemini: checkGeminiStatus,
  cline: checkClineStatus,
}

const ALL_PROVIDERS: HookProvider[] = ['claude', 'cursor', 'gemini', 'cline']

/**
 * Check the installation status of deep-slop hooks across all providers.
 *
 * Reads each provider's configuration file and determines whether
 * a deep-slop hook is present, its scope, and whether quality gate
 * is enabled.
 */
export function getHookStatus(rootDir?: string, homeDir?: string): HookStatus[] {
  const effectiveRootDir = rootDir ?? process.cwd()
  const effectiveHomeDir = homeDir ?? homedir()
  return ALL_PROVIDERS.map((provider) => STATUS_CHECKERS[provider](effectiveRootDir, effectiveHomeDir))
}
