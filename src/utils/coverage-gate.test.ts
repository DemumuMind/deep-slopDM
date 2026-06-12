import { describe, it, expect } from 'vitest'
import { assessCoverage } from './coverage-gate.js'

describe('coverage-gate', () => {
  describe('assessCoverage', () => {
    it('returns not scoreable when totalFiles is 0', () => {
      const result = assessCoverage(['typescript'], 0)
      expect(result.isScoreable).toBe(false)
      expect(result.totalFiles).toBe(0)
      expect(result.scoreableFiles).toBe(0)
      expect(result.coverage).toBe(0)
      expect(result.reason).toBe('No source files found')
    })

    it('returns scoreable when typescript is dominant', () => {
      const result = assessCoverage(['typescript', 'javascript'], 100)
      expect(result.isScoreable).toBe(true)
      expect(result.scoreableFiles).toBe(100)
      expect(result.coverage).toBe(1)
      expect(result.dominantLanguage).toBe('typescript')
    })

    it('returns not scoreable when coverage is below threshold', () => {
      const result = assessCoverage(['python', 'go', 'typescript'], 100)
      // 1/3 scoreable => 33 files => 33% coverage, barely above 30%
      // But actually: scoreableLangs = ['typescript'], langs=3
      // scoreableFiles = round(100 * 1/3) = 33
      // coverage = 33/100 = 0.33 which is >= 0.3
      // Let's use a case that's definitely below threshold
      const result2 = assessCoverage(['python', 'go', 'ruby', 'typescript'], 100)
      expect(result2.isScoreable).toBe(false)
      expect(result2.reason).toContain('Threshold is 30%')
    })

    it('returns not scoreable with no supported languages', () => {
      const result = assessCoverage(['python', 'go', 'rust'], 50)
      expect(result.isScoreable).toBe(false)
      expect(result.scoreableFiles).toBe(0)
      expect(result.coverage).toBe(0)
    })

    it('sets dominantLanguage to first scoreable language', () => {
      const result = assessCoverage(['javascript', 'typescript'], 50)
      expect(result.dominantLanguage).toBe('javascript')
    })

    it('falls back to first language if no scoreable ones', () => {
      const result = assessCoverage(['python'], 50)
      expect(result.dominantLanguage).toBe('python')
    })

    it('handles empty languages array', () => {
      const result = assessCoverage([], 100)
      expect(result.scoreableFiles).toBe(0)
      expect(result.dominantLanguage).toBeNull()
    })
  })
})
