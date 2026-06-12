import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { setProviderPreference } from './use.js'
import { mkdirSync, readFileSync, rmSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const TEST_DIR = join(tmpdir(), 'deep-slop-test-use-' + process.pid)

// Mock AGENT_PROVIDERS
vi.mock('../agents/providers.js', () => ({
  AGENT_PROVIDERS: {
    claude: { command: 'claude', args: ['--print'], promptMode: 'stdin', detectCommand: 'claude --version' },
    codex: { command: 'codex', args: ['--quiet'], promptMode: 'stdin', detectCommand: 'codex --version' },
  },
}))

describe('agent/use', () => {
  beforeEach(() => {
    try { mkdirSync(TEST_DIR, { recursive: true }) } catch {}
  })

  afterEach(() => {
    try { rmSync(TEST_DIR, { recursive: true }) } catch {}
  })

  describe('setProviderPreference', () => {
    it('throws for unknown provider', () => {
      expect(() => setProviderPreference('nonexistent', TEST_DIR)).toThrow('Unknown provider')
    })

    it('creates .deep-slop directory and writes provider file', () => {
      setProviderPreference('claude', TEST_DIR)

      const providerPath = join(TEST_DIR, '.deep-slop', 'provider')
      expect(existsSync(providerPath)).toBe(true)
      expect(readFileSync(providerPath, 'utf-8').trim()).toBe('claude')
    })

    it('overwrites existing provider preference', () => {
      setProviderPreference('claude', TEST_DIR)
      setProviderPreference('codex', TEST_DIR)

      const providerPath = join(TEST_DIR, '.deep-slop', 'provider')
      expect(readFileSync(providerPath, 'utf-8').trim()).toBe('codex')
    })
  })
})
