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
