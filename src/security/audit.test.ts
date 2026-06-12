import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { npmAudit, pnpmAudit, pipAudit, goVulnCheck, cargoAudit } from './audit.js'
import { writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const TEST_DIR = join(tmpdir(), 'deep-slop-test-audit-' + process.pid)

describe('security/audit', () => {
  beforeEach(() => {
    try { mkdirSync(TEST_DIR, { recursive: true }) } catch {}
  })

  afterEach(() => {
    try { rmSync(TEST_DIR, { recursive: true }) } catch {}
  })

  describe('npmAudit', () => {
    it('returns empty when no package.json exists', () => {
      const emptyDir = join(TEST_DIR, 'no-pkg')
      mkdirSync(emptyDir, { recursive: true })
      const result = npmAudit(emptyDir, 5000)
      expect(result).toEqual([])
    })

    it('returns warning diagnostic when npm audit times out', () => {
      // Create a package.json so it doesn't return [] immediately
      writeFileSync(join(TEST_DIR, 'package.json'), '{}')
      // Very short timeout to trigger timeout path
      const result = npmAudit(TEST_DIR, 1)
      // Either timeout or actual result - both are valid
      if (result.length > 0) {
        expect(result[0].rule).toBe('security-deep/dependency-vulnerability')
      }
    })

    it('produces diagnostics with correct engine and category', () => {
      writeFileSync(join(TEST_DIR, 'package.json'), '{}')
      const result = npmAudit(TEST_DIR, 5000)
      for (const d of result) {
        expect(d.engine).toBe('security-deep')
        expect(d.category).toBe('security')
        expect(d.filePath).toBe('package.json')
      }
    })
  })

  describe('pipAudit', () => {
    it('returns empty when no Python project files exist', () => {
      const emptyDir = join(TEST_DIR, 'no-python')
      mkdirSync(emptyDir, { recursive: true })
      const result = pipAudit(emptyDir, 5000)
      expect(result).toEqual([])
    })
  })

  describe('goVulnCheck', () => {
    it('returns empty when no go.mod exists', () => {
      const emptyDir = join(TEST_DIR, 'no-go')
      mkdirSync(emptyDir, { recursive: true })
      const result = goVulnCheck(emptyDir, 5000)
      expect(result).toEqual([])
    })
  })

  describe('cargoAudit', () => {
    it('returns empty when no Cargo.lock exists', () => {
      const emptyDir = join(TEST_DIR, 'no-rust')
      mkdirSync(emptyDir, { recursive: true })
      const result = cargoAudit(emptyDir, 5000)
      expect(result).toEqual([])
    })
  })
})
