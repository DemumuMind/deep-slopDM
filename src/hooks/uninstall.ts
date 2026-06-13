// ── Hook Uninstallation ───────────────────────────────
// Remove deep-slop hooks from AI coding tool configs

import { existsSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import type { HookProvider } from './types.js'

function uninstallClaudeHook(rootDir: string): void {
  const projectPath = join(rootDir, '.claude', 'settings.json')
  const globalPath = join(homedir(), '.claude', 'settings.json')

  // Try project-level first, then global
  for (const configPath of [projectPath, globalPath]) {
    if (!existsSync(configPath)) continue

    let config: Record<string, unknown>
    try {
      config = JSON.parse(readFileSync(configPath, 'utf-8'))
    } catch {
      process.stderr.write(`  ⚠ Could not parse Claude config: ${configPath}\n`)
      continue
    }

    const hooks = config.hooks as Record<string, unknown[]> | undefined
    if (!hooks?.postToolUse) {
      process.stderr.write(`  ℹ No Claude hooks found in ${configPath}\n`)
      continue
    }

    const before = hooks.postToolUse.length
    hooks.postToolUse = hooks.postToolUse.filter(
      (h: unknown) =>
        !(typeof h === 'object' && h !== null && String((h as Record<string, unknown>).command ?? '').includes('deep-slop')),
    )

    if (hooks.postToolUse.length === before) {
      process.stderr.write(`  ℹ No deep-slop hook found in ${configPath}\n`)
      continue
    }

    if (hooks.postToolUse.length === 0) {
      delete hooks.postToolUse
      if (Object.keys(hooks).length === 0) {
        delete config.hooks
      }
    }

    writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8')
    process.stderr.write(`  ✔ Claude hook removed from ${configPath}\n`)
    return
  }

  process.stderr.write(`  ℹ No Claude config found with deep-slop hooks\n`)
}

function uninstallCursorHook(rootDir: string): void {
  const rulePath = join(rootDir, '.cursor', 'rules', 'deep-slop-quality.mdc')

  if (!existsSync(rulePath)) {
    process.stderr.write(`  ℹ Cursor rule not found: ${rulePath}\n`)
    return
  }

  rmSync(rulePath)
  process.stderr.write(`  ✔ Cursor rule removed: ${rulePath}\n`)
}

function uninstallGeminiHook(rootDir: string): void {
  const configPath = join(rootDir, '.gemini', 'config.json')

  if (!existsSync(configPath)) {
    process.stderr.write(`  ℹ Gemini config not found: ${configPath}\n`)
    return
  }

  let config: Record<string, unknown>
  try {
    config = JSON.parse(readFileSync(configPath, 'utf-8'))
  } catch {
    process.stderr.write(`  ⚠ Could not parse Gemini config: ${configPath}\n`)
    return
  }

  if (!config.postEditCommand || !String(config.postEditCommand).includes('deep-slop')) {
    process.stderr.write(`  ℹ No deep-slop hook found in Gemini config\n`)
    return
  }

  delete config.postEditCommand

  writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8')
  process.stderr.write(`  ✔ Gemini hook removed from ${configPath}\n`)
}

function uninstallClineHook(rootDir: string): void {
  const rulePath = join(rootDir, '.clinerules')

  if (!existsSync(rulePath)) {
    process.stderr.write(`  ℹ Cline rules file not found: ${rulePath}\n`)
    return
  }

  const content = readFileSync(rulePath, 'utf-8')
  const lines = content.split('\n')
  const filtered = lines.filter(
    (line) => !line.toLowerCase().includes('deep-slop'),
  )
  const cleaned = filtered.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd()

  if (cleaned.length === 0) {
    rmSync(rulePath)
    process.stderr.write(`  ✔ Cline rules file removed (was only deep-slop content)\n`)
  } else {
    writeFileSync(rulePath, cleaned + '\n', 'utf-8')
    process.stderr.write(`  ✔ deep-slop rule removed from ${rulePath}\n`)
  }
}

const UNINSTALLERS: Record<HookProvider, (rootDir: string) => void> = {
  claude: uninstallClaudeHook,
  cursor: uninstallCursorHook,
  gemini: uninstallGeminiHook,
  cline: uninstallClineHook,
}

/**
 * Uninstall a deep-slop hook from a provider's configuration.
 *
 * @param provider - Which provider to uninstall ('claude'|'cursor'|'gemini'|'cline')
 * @param rootDir - Project root directory where provider configs live
 */
export async function uninstallHook(provider: string, rootDir: string): Promise<void> {
  const uninstaller = UNINSTALLERS[provider as HookProvider]
  if (!uninstaller) {
    throw new Error(`Unknown hook provider: ${provider}. Supported: claude, cursor, gemini, cline`)
  }

  uninstaller(rootDir)
}

