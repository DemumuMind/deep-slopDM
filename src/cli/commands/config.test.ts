import { describe, it, expect } from 'vitest'
import { loadConfig } from '../../config/index.js'
import { resolve } from 'node:path'

describe('config validate', () => {
  it('loads the project config without errors', () => {
    const config = loadConfig(resolve(import.meta.dirname, '../../../'))
    expect(config).toBeDefined()
    expect(config.engines).toBeDefined()
    expect(config.rules).toBeDefined()
  })

  it('has all expected engines enabled', () => {
    const config = loadConfig(resolve(import.meta.dirname, '../../../'))
    const enabledEngines = Object.entries(config.engines)
      .filter(([, v]) => v === true)
      .map(([k]) => k)
    expect(enabledEngines.length).toBeGreaterThanOrEqual(15)
  })

  it('rules are valid severity values', () => {
    const validSeverities = ['error', 'warning', 'info', 'off', 'suggestion']
    const config = loadConfig(resolve(import.meta.dirname, '../../../'))
    for (const [rule, severity] of Object.entries(config.rules ?? {})) {
      expect(validSeverities).toContain(severity as string)
    }
  })

  it('ci config has valid failBelow', () => {
    const config = loadConfig(resolve(import.meta.dirname, '../../../'))
    if (config.ci?.failBelow !== undefined) {
      expect(config.ci.failBelow).toBeGreaterThanOrEqual(0)
      expect(config.ci.failBelow).toBeLessThanOrEqual(100)
    }
  })

  it('exclude patterns are non-empty strings', () => {
    const config = loadConfig(resolve(import.meta.dirname, '../../../'))
    for (const pattern of config.exclude ?? []) {
      expect(typeof pattern).toBe('string')
      expect(pattern.length).toBeGreaterThan(0)
    }
  })
})
