import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { getHookStatus } from './status.js'

const HOME_DIR = join(tmpdir(), 'deep-slop-hooks-status-home-' + process.pid)
const PROJECT_DIR = join(tmpdir(), 'deep-slop-hooks-status-project-' + process.pid)

describe('getHookStatus', () => {
  beforeEach(() => {
    mkdirSync(HOME_DIR, { recursive: true })
    mkdirSync(PROJECT_DIR, { recursive: true })
  })

  afterEach(() => {
    rmSync(HOME_DIR, { recursive: true, force: true })
    rmSync(PROJECT_DIR, { recursive: true, force: true })
  })

  it('reports all providers as not installed when no configs exist', () => {
    const statuses = getHookStatus(PROJECT_DIR, HOME_DIR)
    expect(statuses).toHaveLength(4)
    for (const s of statuses) {
      expect(s.installed).toBe(false)
      expect(s.scope).toBe('none')
      expect(s.path).toBe('')
    }
  })

  it('detects a Claude project hook', () => {
    const configDir = join(PROJECT_DIR, '.claude')
    mkdirSync(configDir, { recursive: true })
    writeFileSync(join(configDir, 'settings.json'), JSON.stringify({
      hooks: {
        postToolUse: [
          { command: 'deep-slop scan --staged', type: 'command' },
        ],
      },
    }))

    const status = getHookStatus(PROJECT_DIR, HOME_DIR).find((s) => s.provider === 'claude')
    expect(status?.installed).toBe(true)
    expect(status?.scope).toBe('project')
    expect(status?.qualityGate).toBe(false)
    expect(status?.path).toContain('settings.json')
  })

  it('detects a Claude global hook with quality gate', () => {
    const configDir = join(HOME_DIR, '.claude')
    mkdirSync(configDir, { recursive: true })
    writeFileSync(join(configDir, 'settings.json'), JSON.stringify({
      hooks: {
        postToolUse: [
          { command: 'deep-slop scan && deep-slop hook baseline --check', type: 'command' },
        ],
      },
    }))

    const status = getHookStatus(PROJECT_DIR, HOME_DIR).find((s) => s.provider === 'claude')
    expect(status?.installed).toBe(true)
    expect(status?.scope).toBe('global')
    expect(status?.qualityGate).toBe(true)
  })

  it('detects a Cursor rule', () => {
    const cursorDir = join(PROJECT_DIR, '.cursor', 'rules')
    mkdirSync(cursorDir, { recursive: true })
    writeFileSync(join(cursorDir, 'deep-slop-quality.mdc'), '---\ndescription: deep-slop quality gate\n---\nAlways run deep-slop scan.\n')

    const status = getHookStatus(PROJECT_DIR, HOME_DIR).find((s) => s.provider === 'cursor')
    expect(status?.installed).toBe(true)
    expect(status?.scope).toBe('project')
    expect(status?.qualityGate).toBe(true)
  })

  it('detects a Cursor quality gate rule from baseline mention', () => {
    const cursorDir = join(PROJECT_DIR, '.cursor', 'rules')
    mkdirSync(cursorDir, { recursive: true })
    writeFileSync(join(cursorDir, 'deep-slop-quality.mdc'), '---\ndescription: deep-slop quality gate\n---\nbaseline\n')

    const status = getHookStatus(PROJECT_DIR, HOME_DIR).find((s) => s.provider === 'cursor')
    expect(status?.installed).toBe(true)
    expect(status?.qualityGate).toBe(true)
  })

  it('detects a Gemini project hook', () => {
    const geminiDir = join(PROJECT_DIR, '.gemini')
    mkdirSync(geminiDir, { recursive: true })
    writeFileSync(join(geminiDir, 'config.json'), JSON.stringify({
      postEditCommand: 'deep-slop scan --staged',
    }))

    const status = getHookStatus(PROJECT_DIR, HOME_DIR).find((s) => s.provider === 'gemini')
    expect(status?.installed).toBe(true)
    expect(status?.scope).toBe('project')
    expect(status?.qualityGate).toBe(false)
  })

  it('detects a Gemini quality gate hook', () => {
    const geminiDir = join(PROJECT_DIR, '.gemini')
    mkdirSync(geminiDir, { recursive: true })
    writeFileSync(join(geminiDir, 'config.json'), JSON.stringify({
      postEditCommand: 'deep-slop scan && deep-slop hook baseline --check',
    }))

    const status = getHookStatus(PROJECT_DIR, HOME_DIR).find((s) => s.provider === 'gemini')
    expect(status?.installed).toBe(true)
    expect(status?.qualityGate).toBe(true)
  })

  it('detects a Cline project hook', () => {
    writeFileSync(join(PROJECT_DIR, '.clinerules'), '# deep-slop quality check\nAfter editing files, run: deep-slop scan\n')

    const status = getHookStatus(PROJECT_DIR, HOME_DIR).find((s) => s.provider === 'cline')
    expect(status?.installed).toBe(true)
    expect(status?.scope).toBe('project')
    expect(status?.qualityGate).toBe(true)
  })

  it('ignores a Gemini config that does not reference deep-slop', () => {
    const geminiDir = join(PROJECT_DIR, '.gemini')
    mkdirSync(geminiDir, { recursive: true })
    writeFileSync(join(geminiDir, 'config.json'), JSON.stringify({
      postEditCommand: 'some-other-linter --check',
    }))

    const status = getHookStatus(PROJECT_DIR, HOME_DIR).find((s) => s.provider === 'gemini')
    expect(status?.installed).toBe(false)
  })
})
