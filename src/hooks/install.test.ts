import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdirSync, rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { installHook } from './install.js'

const PROJECT_DIR = join(tmpdir(), 'deep-slop-hooks-install-project-' + process.pid)
const HOME_DIR = join(tmpdir(), 'deep-slop-hooks-install-home-' + process.pid)

describe('installHook', () => {
  beforeEach(() => {
    mkdirSync(PROJECT_DIR, { recursive: true })
    mkdirSync(HOME_DIR, { recursive: true })
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    rmSync(PROJECT_DIR, { recursive: true, force: true })
    rmSync(HOME_DIR, { recursive: true, force: true })
  })

  it('throws for unknown provider', async () => {
    await expect(installHook({
      provider: 'unknown-provider' as unknown as import('./types.js').HookProvider,
      scope: 'project',
      qualityGate: false,
    }, PROJECT_DIR, HOME_DIR)).rejects.toThrow('Unknown hook provider: unknown-provider')
  })

  it('installs a Claude project hook', async () => {
    await installHook({ provider: 'claude', scope: 'project', qualityGate: false }, PROJECT_DIR, HOME_DIR)

    const configPath = join(PROJECT_DIR, '.claude', 'settings.json')
    expect(existsSync(configPath)).toBe(true)
    const config = JSON.parse(readFileSync(configPath, 'utf-8'))
    expect(config.hooks.postToolUse).toHaveLength(1)
    expect(config.hooks.postToolUse[0].command).toContain('deep-slop scan')
    expect(config.hooks.postToolUse[0].type).toBe('command')
  })

  it('installs a Claude global hook', async () => {
    await installHook({ provider: 'claude', scope: 'global', qualityGate: false }, PROJECT_DIR, HOME_DIR)

    const configPath = join(HOME_DIR, '.claude', 'settings.json')
    expect(existsSync(configPath)).toBe(true)
    const config = JSON.parse(readFileSync(configPath, 'utf-8'))
    expect(config.hooks.postToolUse).toHaveLength(1)
  })

  it('updates an existing Claude hook entry', async () => {
    const claudeDir = join(PROJECT_DIR, '.claude')
    mkdirSync(claudeDir, { recursive: true })
    const configPath = join(claudeDir, 'settings.json')
    writeFileSync(configPath, JSON.stringify({
      hooks: {
        postToolUse: [
          { command: 'deep-slop old', type: 'command' },
          { command: 'other', type: 'command' },
        ],
      },
    }))

    await installHook({ provider: 'claude', scope: 'project', qualityGate: false }, PROJECT_DIR, HOME_DIR)

    const config = JSON.parse(readFileSync(configPath, 'utf-8'))
    expect(config.hooks.postToolUse).toHaveLength(2)
    expect(config.hooks.postToolUse[0].command).toContain('deep-slop scan')
    expect(config.hooks.postToolUse[1].command).toBe('other')
  })

  it('installs a Cursor rule with quality gate', async () => {
    await installHook({ provider: 'cursor', scope: 'project', qualityGate: true }, PROJECT_DIR, HOME_DIR)

    const rulePath = join(PROJECT_DIR, '.cursor', 'rules', 'deep-slop-quality.mdc')
    expect(existsSync(rulePath)).toBe(true)
    const content = readFileSync(rulePath, 'utf-8')
    expect(content).toContain('deep-slop quality gate')
    expect(content).toContain('baseline')
  })

  it('installs a Gemini project hook', async () => {
    await installHook({ provider: 'gemini', scope: 'project', qualityGate: false }, PROJECT_DIR, HOME_DIR)

    const configPath = join(PROJECT_DIR, '.gemini', 'config.json')
    expect(existsSync(configPath)).toBe(true)
    const config = JSON.parse(readFileSync(configPath, 'utf-8'))
    expect(config.postEditCommand).toContain('deep-slop scan')
  })

  it('installs a Cline project hook', async () => {
    await installHook({ provider: 'cline', scope: 'project', qualityGate: false }, PROJECT_DIR, HOME_DIR)

    const rulePath = join(PROJECT_DIR, '.clinerules')
    expect(existsSync(rulePath)).toBe(true)
    const content = readFileSync(rulePath, 'utf-8')
    expect(content).toContain('deep-slop quality check')
    expect(content).toContain('deep-slop scan')
  })
})
