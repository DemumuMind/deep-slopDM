import { describe, it, expect } from 'vitest'
import { isInsideMacroOrString, isTestFile, isRustFile } from './helpers.js'

describe('rust-deep helpers', () => {
  describe('isInsideMacroOrString', () => {
    it('returns false outside a string', () => {
      expect(isInsideMacroOrString('let x = 1;', 5)).toBe(false)
    })

    it('detects inside a double-quoted string', () => {
      expect(isInsideMacroOrString('let x = "hello";', 11)).toBe(true)
    })

    it('detects inside a single-quoted string', () => {
      expect(isInsideMacroOrString("let x = 'hello';", 11)).toBe(true)
    })
  })

  describe('isTestFile', () => {
    it('recognizes test files', () => {
      expect(isTestFile('src/foo_test.rs')).toBe(true)
      expect(isTestFile('src/foo.test.rs')).toBe(true)
    })

    it('recognizes test directory files', () => {
      expect(isTestFile('src/tests/foo.rs')).toBe(true)
      expect(isTestFile('src/test/foo.rs')).toBe(true)
    })

    it('rejects non-test files', () => {
      expect(isTestFile('src/main.rs')).toBe(false)
    })
  })

  describe('isRustFile', () => {
    it('recognizes .rs files', () => {
      expect(isRustFile('src/main.rs')).toBe(true)
    })

    it('rejects non-rust files', () => {
      expect(isRustFile('src/main.ts')).toBe(false)
    })
  })
})
