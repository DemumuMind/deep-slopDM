import { describe, it, expect } from 'vitest'
import { PRESETS, getPreset, listPresets } from './presets.js'

describe('presets', () => {
  describe('PRESETS', () => {
    it('has the four expected presets', () => {
      expect(PRESETS['typescript-strict']).toBeDefined()
      expect(PRESETS['monorepo-relaxed']).toBeDefined()
      expect(PRESETS['python-go']).toBeDefined()
      expect(PRESETS['minimal']).toBeDefined()
    })

    it('each preset has a description', () => {
      for (const [, preset] of Object.entries(PRESETS)) {
        expect(preset.description).toBeTruthy()
      }
    })
  })

  describe('getPreset', () => {
    it('returns preset config without description for known preset', () => {
      const config = getPreset('typescript-strict')
      expect(config).not.toBeNull()
      expect(config).not.toHaveProperty('description')
      expect(config).toHaveProperty('engines')
      expect(config).toHaveProperty('quality')
    })

    it('returns null for unknown preset name', () => {
      expect(getPreset('nonexistent-preset')).toBeNull()
    })

    it('minimal preset has only ast-slop and security-deep enabled', () => {
      const config = getPreset('minimal')
      expect(config?.engines?.['ast-slop']).toBe(true)
      expect(config?.engines?.['security-deep']).toBe(true)
      expect(config?.engines?.['dead-flow']).toBe(false)
    })
  })

  describe('listPresets', () => {
    it('returns all presets with names and descriptions', () => {
      const list = listPresets()
      expect(list.length).toBe(Object.keys(PRESETS).length)
      for (const entry of list) {
        expect(entry.name).toBeTruthy()
        expect(typeof entry.description).toBe('string')
      }
    })

    it('includes all known preset names', () => {
      const names = listPresets().map(p => p.name)
      expect(names).toContain('typescript-strict')
      expect(names).toContain('monorepo-relaxed')
      expect(names).toContain('python-go')
      expect(names).toContain('minimal')
    })
  })
})
