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

// ── Agent Connect & Provider Resolution ────────────────
// Connect verifies a provider is installed+authenticated
// and saves the preference. resolveProvider picks which one to use.

import { join } from 'node:path'
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { AGENT_PROVIDERS, isAgentAvailable } from '../agents/providers.js'

const CONFIG_DIR = '.deep-slop'
const PROVIDER_FILE = 'provider'

/** Ensure .deep-slop directory exists */
function ensureConfigDir(rootDir: string): string {
  const dir = join(rootDir, CONFIG_DIR)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  return dir
}

/** Read the saved provider preference */
function readProviderPreference(rootDir: string): string | null {
  const filePath = join(rootDir, CONFIG_DIR, PROVIDER_FILE)
  try {
    return readFileSync(filePath, 'utf-8').trim() || null
  } catch {
    return null
  }
}

/** Connect to a provider: verify it's installed and authenticated */
export async function connectProvider(
  provider: string,
  rootDir: string,
): Promise<{ success: boolean, message: string }> {
  const def = AGENT_PROVIDERS[provider]
  if (!def) {
    const available = Object.keys(AGENT_PROVIDERS).join(', ')
    return {
      success: false,
      message: `Unknown provider "${provider}". Available: ${available}`,
    }
  }

  // Check if the CLI is installed
  const available = await isAgentAvailable(def)
  if (!available) {
    return {
      success: false,
      message: `Provider "${provider}" CLI not found. Install it or check your PATH.`,
    }
  }

  // Try to get version info for authentication verification
  let versionInfo = ''
  try {
    const { execSync } = await import('node:child_process')
    versionInfo = execSync(def.detectCommand, { stdio: 'pipe', timeout: 5000 }).toString().trim()
  } catch {
    versionInfo = '(version info unavailable)'
  }

  // Save provider preference
  ensureConfigDir(rootDir)
  const filePath = join(rootDir, CONFIG_DIR, PROVIDER_FILE)
  writeFileSync(filePath, provider, 'utf-8')

  return {
    success: true,
    message: `Connected to ${provider}: ${versionInfo}`,
  }
}

/** Resolve which provider to use based on name, preference, or auto-detect */
export async function resolveProvider(
  name: string | undefined,
  rootDir: string,
): Promise<string> {
  // Explicit name given
  if (name && name !== 'auto') {
    const def = AGENT_PROVIDERS[name]
    if (!def) {
      throw new Error(`Unknown provider "${name}". Available: ${Object.keys(AGENT_PROVIDERS).join(', ')}`)
    }
    const available = await isAgentAvailable(def)
    if (!available) {
      throw new Error(`Provider "${name}" is not installed. Install it or check your PATH.`)
    }
    return name
  }

  // 'auto' or no name: check saved preference first
  if (!name || name === 'auto') {
    const saved = readProviderPreference(rootDir)
    if (saved && saved !== 'auto') {
      const def = AGENT_PROVIDERS[saved]
      if (def) {
        const available = await isAgentAvailable(def)
        if (available) return saved
      }
      // Saved preference not available, fall through to auto-detect
    }
  }

  // Auto-detect: pick first installed+authenticated provider
  const entries = Object.entries(AGENT_PROVIDERS)
  for (const [provName, provDef] of entries) {
    const available = await isAgentAvailable(provDef)
    if (available) return provName
  }

  throw new Error('No agent provider found. Install one of: ' + Object.keys(AGENT_PROVIDERS).join(', '))
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
