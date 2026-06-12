import { describe, it, expect } from 'vitest'
import { computeExitCode } from './exit-code.js'

describe('exit-code', () => {
  describe('computeExitCode', () => {
    it('returns 1 when hasErrors and failOnErrors are both true', () => {
      expect(computeExitCode({
        hasErrors: true,
        failOnErrors: true,
        scoreable: true,
        score: 80,
        failBelow: 70,
      })).toBe(1)
    })

    it('returns 0 when hasErrors is true but failOnErrors is false', () => {
      expect(computeExitCode({
        hasErrors: true,
        failOnErrors: false,
        scoreable: true,
        score: 80,
        failBelow: 70,
      })).toBe(0)
    })

    it('returns 1 when scoreable and score is below failBelow', () => {
      expect(computeExitCode({
        hasErrors: false,
        failOnErrors: true,
        scoreable: true,
        score: 60,
        failBelow: 70,
      })).toBe(1)
    })

    it('returns 0 when scoreable and score equals failBelow', () => {
      expect(computeExitCode({
        hasErrors: false,
        failOnErrors: true,
        scoreable: true,
        score: 70,
        failBelow: 70,
      })).toBe(0)
    })

    it('returns 0 when scoreable and score is above failBelow', () => {
      expect(computeExitCode({
        hasErrors: false,
        failOnErrors: true,
        scoreable: true,
        score: 85,
        failBelow: 70,
      })).toBe(0)
    })

    it('returns 1 for non-scoreable with errors and failOnErrors (hasErrors checked first)', () => {
      // hasErrors && failOnErrors is checked BEFORE !scoreable
      expect(computeExitCode({
        hasErrors: true,
        failOnErrors: true,
        scoreable: false,
        score: 30,
        failBelow: 70,
      })).toBe(1)
    })

    it('returns 0 for non-scoreable without errors (failOnErrors true)', () => {
      expect(computeExitCode({
        hasErrors: false,
        failOnErrors: true,
        scoreable: false,
        score: 30,
        failBelow: 70,
      })).toBe(0)
    })

    it('returns 0 for clean project with no errors', () => {
      expect(computeExitCode({
        hasErrors: false,
        failOnErrors: false,
        scoreable: true,
        score: 95,
        failBelow: 70,
      })).toBe(0)
    })
  })
})
