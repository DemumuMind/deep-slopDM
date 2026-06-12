import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { connectProvider, resolveProvider } from './connect.js'
import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const TEST_DIR = join(tmpdir(), 'deep-slop-test-connect-' + process.pid)

vi.mock('../agents/providers.js', () => ({
  AGENT_PROVIDERS: {
    claude: { command: 'claude', args: ['--print'], promptMode: 'stdin', detectCommand: 'claude --version' },
    codex: { command: 'codex', args: ['--quiet'], promptMode: 'stdin', detectCommand: 'codex --version' },
  },
  isAgentAvailable: vi.fn().mockResolvedValue(true),
}))

describe('connect', () => {
  beforeEach(() => {
    try { mkdirSync(TEST_DIR, { recursive: true }) } catch {}
    // Clean up any .deep-slop dir from previous tests
    try { rmSync(join(TEST_DIR, '.deep-slop'), { recursive: true }) } catch {}
  })

  afterEach(() => {
    try { rmSync(TEST_DIR, { recursive: true }) } catch {}
  })

  describe('connectProvider', () => {
    it('returns error for unknown provider', async () => {
      const result = await connectProvider('nonexistent', TEST_DIR)
      expect(result.success).toBe(false)
      expect(result.message).toContain('Unknown provider')
    })

    it('returns error when provider CLI is not available', async () => {
      const { isAgentAvailable } = await import('../agents/providers.js')
      vi.mocked(isAgentAvailable).mockResolvedValueOnce(false)

      const result = await connectProvider('claude', TEST_DIR)
      expect(result.success).toBe(false)
      expect(result.message).toContain('CLI not found')
    })

    it('saves provider preference on successful connection', async () => {
      const { isAgentAvailable } = await import('../agents/providers.js')
      vi.mocked(isAgentAvailable).mockResolvedValueOnce(true)

      const result = await connectProvider('claude', TEST_DIR)
      expect(result.success).toBe(true)
      expect(result.message).toContain('Connected to claude')

      const savedPath = join(TEST_DIR, '.deep-slop', 'provider')
      expect(existsSync(savedPath)).toBe(true)
      const content = readFileSync(savedPath, 'utf-8').trim()
      expect(content).toBe('claude')
    })
  })

  describe('resolveProvider', () => {
    it('throws for unknown explicit provider name', async () => {
      await expect(resolveProvider('nonexistent', TEST_DIR)).rejects.toThrow('Unknown provider')
    })

    it('throws when explicit provider is not installed', async () => {
      const { isAgentAvailable } = await import('../agents/providers.js')
      vi.mocked(isAgentAvailable).mockResolvedValueOnce(false)

      await expect(resolveProvider('claude', TEST_DIR)).rejects.toThrow('not installed')
    })

    it('returns explicit provider when available', async () => {
      const { isAgentAvailable } = await import('../agents/providers.js')
      vi.mocked(isAgentAvailable).mockResolvedValueOnce(true)

      const provider = await resolveProvider('claude', TEST_DIR)
      expect(provider).toBe('claude')
    })

    it('uses saved preference when auto-detecting', async () => {
      const { isAgentAvailable } = await import('../agents/providers.js')
      // Default mock returns true, so saved preference check will succeed
      vi.mocked(isAgentAvailable).mockResolvedValue(true)

      // Write a saved preference
      const configDir = join(TEST_DIR, '.deep-slop')
      mkdirSync(configDir, { recursive: true })
      writeFileSync(join(configDir, 'provider'), 'codex')

      const provider = await resolveProvider('auto', TEST_DIR)
      expect(provider).toBe('codex')
    })

    it('auto-detects when no saved preference and no explicit name', async () => {
      const { isAgentAvailable } = await import('../agents/providers.js')
      vi.mocked(isAgentAvailable).mockResolvedValue(true)

      const provider = await resolveProvider(undefined, TEST_DIR)
      // Should return first available = claude (first in AGENT_PROVIDERS)
      expect(provider).toBe('claude')
    })

    it('throws when no provider is available at all', async () => {
      const { isAgentAvailable } = await import('../agents/providers.js')
      vi.mocked(isAgentAvailable).mockResolvedValue(false)

      await expect(resolveProvider('auto', TEST_DIR)).rejects.toThrow('No agent provider found')
    })
  })
})
