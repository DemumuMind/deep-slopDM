// ── Agent Use: Set Provider Preference ──────────────────
// Write provider name to .deep-slop/provider file

import { join } from 'node:path'
import { mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { AGENT_PROVIDERS } from '../agents/providers.js'

const CONFIG_DIR = '.deep-slop'
const PROVIDER_FILE = 'provider'

/** Set the default provider preference for this project */
export function setProviderPreference(provider: string, rootDir: string): void {
  const def = AGENT_PROVIDERS[provider]
  if (!def) {
    const available = Object.keys(AGENT_PROVIDERS).join(', ')
    throw new Error(`Unknown provider "${provider}". Available: ${available}`)
  }

  // Ensure config directory exists
  const dir = join(rootDir, CONFIG_DIR)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }

  // Write provider name
  const filePath = join(rootDir, CONFIG_DIR, PROVIDER_FILE)
  writeFileSync(filePath, provider, 'utf-8')
}

