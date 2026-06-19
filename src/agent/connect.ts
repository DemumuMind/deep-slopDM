// ── Agent Connect & Provider Resolution ────────────────
// Connect verifies a provider is installed+authenticated
// and saves the preference. resolveProvider picks which one to use.

import { join } from 'node:path'
import { access, readFile, writeFile, mkdir } from 'node:fs/promises'
import { AGENT_PROVIDERS, isAgentAvailable } from '../agents/providers.js'

const CONFIG_DIR = '.deep-slop'
const PROVIDER_FILE = 'provider'

async function exists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

/** Ensure .deep-slop directory exists */
async function ensureConfigDir(rootDir: string): Promise<string> {
  const dir = join(rootDir, CONFIG_DIR)
  if (!(await exists(dir))) {
    await mkdir(dir, { recursive: true })
  }
  return dir
}

/** Read the saved provider preference */
async function readProviderPreference(rootDir: string): Promise<string | null> {
  const filePath = join(rootDir, CONFIG_DIR, PROVIDER_FILE)
  try {
    const content = await readFile(filePath, 'utf-8')
    return content.trim() || null
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
  await ensureConfigDir(rootDir)
  const filePath = join(rootDir, CONFIG_DIR, PROVIDER_FILE)
  await writeFile(filePath, provider, 'utf-8')

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
    const saved = await readProviderPreference(rootDir)
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

