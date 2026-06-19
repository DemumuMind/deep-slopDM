import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdirSync, rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { captureBaseline, readBaseline, checkQualityGate } from './baseline.js'
import type { BaselineData } from './types.js'

const TEST_DIR = join(tmpdir(), 'deep-slop-hooks-baseline-' + process.pid)

describe('baseline', () => {
  beforeEach(() => {
    mkdirSync(TEST_DIR, { recursive: true })
  })

  afterEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true })
  })

  describe('captureBaseline', () => {
    it('writes baseline.json with score and diagnostics', () => {
      captureBaseline(TEST_DIR, 85, { total: 5, errors: 1, warnings: 2 })

      const filePath = join(TEST_DIR, '.deep-slop', 'baseline.json')
      expect(existsSync(filePath)).toBe(true)

      const data = JSON.parse(readFileSync(filePath, 'utf-8')) as BaselineData
      expect(data.score).toBe(85)
      expect(data.diagnostics.total).toBe(5)
      expect(data.diagnostics.errors).toBe(1)
      expect(data.diagnostics.warnings).toBe(2)
      expect(typeof data.timestamp).toBe('string')
    })

    it('defaults diagnostics to zero when omitted', () => {
      captureBaseline(TEST_DIR, 92)

      const filePath = join(TEST_DIR, '.deep-slop', 'baseline.json')
      const data = JSON.parse(readFileSync(filePath, 'utf-8')) as BaselineData
      expect(data.diagnostics).toEqual({ total: 0, errors: 0, warnings: 0 })
    })
  })

  describe('readBaseline', () => {
    it('returns null when no baseline exists', () => {
      expect(readBaseline(TEST_DIR)).toBeNull()
    })

    it('returns null when baseline file is corrupted', () => {
      const dir = join(TEST_DIR, '.deep-slop')
      mkdirSync(dir, { recursive: true })
      writeFileSync(join(dir, 'baseline.json'), '{not json', 'utf-8')

      expect(readBaseline(TEST_DIR)).toBeNull()
    })

    it('returns baseline data when file is valid', () => {
      captureBaseline(TEST_DIR, 78, { total: 3, errors: 0, warnings: 1 })
      const baseline = readBaseline(TEST_DIR)
      expect(baseline).not.toBeNull()
      expect(baseline?.score).toBe(78)
    })
  })

  describe('checkQualityGate', () => {
    it('passes by default when no baseline exists', () => {
      const result = checkQualityGate(TEST_DIR, 60)
      expect(result.pass).toBe(true)
      expect(result.delta).toBe(0)
      expect(result.baselineScore).toBe(0)
    })

    it('passes when current score equals baseline', () => {
      captureBaseline(TEST_DIR, 80)
      const result = checkQualityGate(TEST_DIR, 80)
      expect(result.pass).toBe(true)
      expect(result.delta).toBe(0)
      expect(result.baselineScore).toBe(80)
    })

    it('passes when current score is above baseline', () => {
      captureBaseline(TEST_DIR, 80)
      const result = checkQualityGate(TEST_DIR, 90)
      expect(result.pass).toBe(true)
      expect(result.delta).toBe(10)
    })

    it('fails when current score is below baseline', () => {
      captureBaseline(TEST_DIR, 80)
      const result = checkQualityGate(TEST_DIR, 70)
      expect(result.pass).toBe(false)
      expect(result.delta).toBe(-10)
      expect(result.baselineScore).toBe(80)
    })
  })
})
