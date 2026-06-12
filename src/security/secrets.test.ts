import { describe, it, expect } from 'vitest'
import { detectSecrets } from './secrets.js'
import type { Diagnostic } from '../types/index.js'

describe('secrets', () => {
  describe('detectSecrets', () => {
    it('detects hardcoded API key', () => {
      const diags = detectSecrets('src/config.ts', [
        { num: 5, text: `const apiKey = "sk-abc123def456ghi789jkl012mno345"` },
      ])
      expect(diags.length).toBeGreaterThan(0)
      expect(diags[0].rule).toBe('security-deep/hardcoded-secret')
      expect(diags[0].severity).toBe('error')
    })

    it('detects hardcoded AWS access key', () => {
      const diags = detectSecrets('src/aws.ts', [
        { num: 3, text: `"AKIAIOSFODNN7EXAMPLE"` },
      ])
      expect(diags.length).toBeGreaterThan(0)
    })

    it('detects password assignments', () => {
      const diags = detectSecrets('src/auth.ts', [
        { num: 10, text: `password = "supersecretpassword"` },
      ])
      expect(diags.length).toBeGreaterThan(0)
    })

    it('detects DB connection strings', () => {
      const diags = detectSecrets('src/db.ts', [
        { num: 1, text: `"postgres://user:pass@localhost:5432/mydb"` },
      ])
      expect(diags.length).toBeGreaterThan(0)
    })

    it('detects PEM private keys', () => {
      const diags = detectSecrets('src/cert.ts', [
        { num: 1, text: '-----BEGIN RSA PRIVATE KEY-----' },
      ])
      expect(diags.length).toBeGreaterThan(0)
    })

    it('skips test files entirely', () => {
      const diags = detectSecrets('src/config.test.ts', [
        { num: 5, text: `const apiKey = "sk-abc123def456ghi789jkl012mno345"` },
      ])
      expect(diags).toHaveLength(0)
    })

    it('skips comment lines', () => {
      const diags = detectSecrets('src/app.ts', [
        { num: 1, text: '// const apiKey = "sk-abc123def456ghi789jkl012mno345"' },
        { num: 2, text: '/* const apiKey = "sk-abc123def456ghi789jkl012mno345" */' },
        { num: 3, text: '# const apiKey = "sk-abc123def456ghi789jkl012mno345"' },
      ])
      expect(diags).toHaveLength(0)
    })

    it('masks secrets in diagnostic messages', () => {
      const diags = detectSecrets('src/app.ts', [
        { num: 1, text: `const key = "sk-abc123def456ghi789jkl012mno345"` },
      ])
      expect(diags.length).toBeGreaterThan(0)
      expect(diags[0].message).toContain('REDACTED')
      expect(diags[0].message).not.toContain('sk-abc123def456ghi789jkl012mno345')
    })

    it('returns empty for empty lines', () => {
      const diags = detectSecrets('src/app.ts', [])
      expect(diags).toHaveLength(0)
    })
  })
})
