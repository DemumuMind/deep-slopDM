import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { uninstallHook } from './uninstall.js'
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const TEST_DIR = join(tmpdir(), 'deep-slop-test-uninstall-' + process.pid)

describe('uninstall', () => {
  beforeEach(() => {
    try { mkdirSync(TEST_DIR, { recursive: true }) } catch {}
  })

  afterEach(() => {
    try { rmSync(TEST_DIR, { recursive: true }) } catch {}
  })

  describe('uninstallHook', () => {
    it('throws for unknown provider', async () => {
      await expect(uninstallHook('unknown-provider', TEST_DIR)).rejects.toThrow(
        'Unknown hook provider: unknown-provider',
      )
    })

    it('removes deep-slop from Claude project config', async () => {
      const claudeDir = join(TEST_DIR, '.claude')
      mkdirSync(claudeDir, { recursive: true })
      const configPath = join(claudeDir, 'settings.json')
      writeFileSync(configPath, JSON.stringify({
        hooks: {
          postToolUse: [
            { command: 'deep-slop check --hook' },
            { command: 'other-tool run' },
          ],
        },
      }))

      await uninstallHook('claude', TEST_DIR)

      const updated = JSON.parse(readFileSync(configPath, 'utf-8'))
      expect(updated.hooks.postToolUse).toHaveLength(1)
      expect(updated.hooks.postToolUse[0].command).toBe('other-tool run')
    })

    it('removes Cursor rule file', async () => {
      const cursorDir = join(TEST_DIR, '.cursor', 'rules')
      mkdirSync(cursorDir, { recursive: true })
      const rulePath = join(cursorDir, 'deep-slop-quality.mdc')
      writeFileSync(rulePath, '# deep-slop quality rule')

      await uninstallHook('cursor', TEST_DIR)

      expect(existsSync(rulePath)).toBe(false)
    })

    it('removes deep-slop from Gemini config', async () => {
      const geminiDir = join(TEST_DIR, '.gemini')
      mkdirSync(geminiDir, { recursive: true })
      const configPath = join(geminiDir, 'config.json')
      writeFileSync(configPath, JSON.stringify({
        postEditCommand: 'deep-slop check --hook',
        otherSetting: true,
      }))

      await uninstallHook('gemini', TEST_DIR)

      const updated = JSON.parse(readFileSync(configPath, 'utf-8'))
      expect(updated.postEditCommand).toBeUndefined()
      expect(updated.otherSetting).toBe(true)
    })

    it('removes deep-slop lines from Cline rules', async () => {
      const rulePath = join(TEST_DIR, '.clinerules')
      writeFileSync(rulePath, 'Always use TypeScript\nRun deep-slop check after edits\nBe concise')

      await uninstallHook('cline', TEST_DIR)

      const content = readFileSync(rulePath, 'utf-8')
      expect(content).not.toContain('deep-slop')
      expect(content).toContain('Always use TypeScript')
    })

    it('deletes .clinerules if only deep-slop content', async () => {
      const rulePath = join(TEST_DIR, '.clinerules')
      writeFileSync(rulePath, 'Run deep-slop check after edits\n')

      await uninstallHook('cline', TEST_DIR)

      expect(existsSync(rulePath)).toBe(false)
    })
  })
})
