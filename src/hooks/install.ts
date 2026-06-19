// ── Hook Installation ─────────────────────────────────
// Install deep-slop hooks for AI coding tool providers

import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { homedir } from 'node:os'
import type { HookInstall, HookProvider } from './types.js'

/** Deep-slop scan command used in hooks */
const SCAN_COMMAND = 'deep-slop scan --staged --exclude node_modules dist'

/** Quality gate scan command with baseline comparison */
const QUALITY_GATE_COMMAND =
  'deep-slop scan --staged --exclude node_modules dist && deep-slop hook baseline --check'

// ── Provider-specific installers ──────────────────────

function installClaudeHook(options: HookInstall): void {
  const configPath = options.scope === 'global'
    ? join(homedir(), '.claude', 'settings.json')
    : join(process.cwd(), '.claude', 'settings.json')

  const configDir = dirname(configPath)
  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true })
  }

  const command = options.qualityGate ? QUALITY_GATE_COMMAND : SCAN_COMMAND

  let config: Record<string, unknown> = {}
  if (existsSync(configPath)) {
    try {
      config = JSON.parse(readFileSync(configPath, 'utf-8'))
    } catch {
      config = {}
    }
  }

  // Add to hooks.postToolUse
  const hooks = (config.hooks ?? {}) as Record<string, unknown[]>
  const postToolUse = (hooks.postToolUse ?? []) as Record<string, unknown>[]

  // Check if deep-slop hook already exists
  const existingIdx = postToolUse.findIndex(
    (h: Record<string, unknown>) =>
      typeof h === 'object' && h !== null && String(h.command ?? '').includes('deep-slop'),
  )

  const hookEntry = { command, type: 'command' }

  if (existingIdx >= 0) {
    postToolUse[existingIdx] = hookEntry
  } else {
    postToolUse.push(hookEntry)
  }

  hooks.postToolUse = postToolUse
  config.hooks = hooks

  writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8')
  process.stderr.write(`  ✔ Claude hook installed → ${configPath}\n`)
}

function installCursorHook(options: HookInstall): void {
  const rulesDir = join(process.cwd(), '.cursor', 'rules')
  const rulePath = join(rulesDir, 'deep-slop-quality.mdc')

  if (!existsSync(rulesDir)) {
    mkdirSync(rulesDir, { recursive: true })
  }

  const qualityGateBlock = options.qualityGate
    ? `\nBefore finalizing any edit, compare the deep-slop score against the baseline captured in .deep-slop/baseline.json. If the score has dropped, revert your changes and try a different approach.`
    : ''

  const content = [
    '---',
    'description: deep-slop quality gate',
    '---',
    'Always run deep-slop scan after editing files. If score drops below baseline, revert changes.',
    qualityGateBlock,
  ].filter(Boolean).join('\n') + '\n'

  writeFileSync(rulePath, content, 'utf-8')
  process.stderr.write(`  ✔ Cursor hook installed → ${rulePath}\n`)
}

function installGeminiHook(options: HookInstall): void {
  const configPath = join(process.cwd(), '.gemini', 'config.json')
  const configDir = dirname(configPath)

  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true })
  }

  const command = options.qualityGate ? QUALITY_GATE_COMMAND : SCAN_COMMAND

  let config: Record<string, unknown> = {}
  if (existsSync(configPath)) {
    try {
      config = JSON.parse(readFileSync(configPath, 'utf-8'))
    } catch {
      config = {}
    }
  }

  config.postEditCommand = command

  writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8')
  process.stderr.write(`  ✔ Gemini hook installed → ${configPath}\n`)
}

function installClineHook(options: HookInstall): void {
  const rulePath = join(process.cwd(), '.clinerules')

  const qualityGateBlock = options.qualityGate
    ? `\nAfter making changes, check the deep-slop score against .deep-slop/baseline.json. If the score has dropped below the baseline score, revert the changes.`
    : ''

  let content = ''
  if (existsSync(rulePath)) {
    content = readFileSync(rulePath, 'utf-8')
    // Remove existing deep-slop section if present
    const lines = content.split('\n')
    const filtered = lines.filter(
      (line) => !line.toLowerCase().includes('deep-slop') && !line.toLowerCase().includes('deep-sleep'),
    )
    content = filtered.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n'
  }

  content += `\n# deep-slop quality check\n`
  content += `After editing files, run: ${options.qualityGate ? QUALITY_GATE_COMMAND : SCAN_COMMAND}\n`
  content += `Review any reported issues and fix before committing.\n`
  if (qualityGateBlock) {
    content += `${qualityGateBlock}\n`
  }

  writeFileSync(rulePath, content, 'utf-8')
  process.stderr.write(`  ✔ Cline hook installed → ${rulePath}\n`)
}

const INSTALLERS: Record<HookProvider, (options: HookInstall) => void> = {
  claude: installClaudeHook,
  cursor: installCursorHook,
  gemini: installGeminiHook,
  cline: installClineHook,
}

/**
 * Install a deep-slop hook for a given provider.
 *
 * Writes the appropriate configuration file for the provider
 * so that deep-slop runs automatically after edits.
 * If qualityGate is enabled, also captures a baseline score.
 */
export async function installHook(options: HookInstall): Promise<void> {
  const installer = INSTALLERS[options.provider]
  if (!installer) {
    throw new Error(`Unknown hook provider: ${options.provider}`)
  }

  installer(options)

  // Capture baseline if quality gate is enabled
  if (options.qualityGate) {
    const rootDir = options.scope === 'global' ? homedir() : process.cwd()
    // Defer baseline capture — the CLI handler will run the scan first
    process.stderr.write(`  ℹ Quality gate enabled — run 'deep-slop hook baseline' to capture baseline\n`)
  }

  process.stderr.write(`  ✔ Hook installed for ${options.provider} (${options.scope})\n`)
}

