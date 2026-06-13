import { describe, it, expect, afterAll } from 'vitest'
import { lintExternalEngine } from './index.js'
import { makeContext, tempDir, writeFile, cleanup } from '../test-utils.js'

describe('lint-external', () => {
  const dir = tempDir()
  afterAll(() => cleanup(dir))

  it('has correct metadata', () => {
    expect(lintExternalEngine.name).toBe('lint-external')
    expect(lintExternalEngine.description).toContain('External linter')
    expect(lintExternalEngine.supportedLanguages).toContain('python')
    expect(lintExternalEngine.supportedLanguages).toContain('go')
    expect(lintExternalEngine.supportedLanguages).toContain('rust')
  })

  it('returns a valid EngineResult and skips when no relevant languages are detected', async () => {
    const ctx = makeContext(dir)
    ctx.languages = ['typescript', 'javascript']
    const result = await lintExternalEngine.run(ctx)
    expect(result.engine).toBe('lint-external')
    expect(result.skipped).toBe(true)
    expect(result.diagnostics).toEqual([])
    expect(result.elapsed).toBeGreaterThanOrEqual(0)
  })

  it('skips when external linters are not installed', async () => {
    writeFile(dir, 'main.py', 'print("hello")\n')
    const ctx = makeContext(dir)
    ctx.languages = ['python']
    const result = await lintExternalEngine.run(ctx)
    expect(result.engine).toBe('lint-external')
    expect(result.diagnostics).toEqual([])
    expect(result.elapsed).toBeGreaterThanOrEqual(0)
    if (result.skipped) {
      expect(result.skipReason).toMatch(/ruff not installed|No external linters/)
    }
  })
})
