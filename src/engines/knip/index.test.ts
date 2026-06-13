import { describe, it, expect, afterAll } from 'vitest'
import { knipEngine } from './index.js'
import { makeContext, tempDir, writeFile, cleanup } from '../test-utils.js'

describe('knip', () => {
  const dir = tempDir()
  afterAll(() => cleanup(dir))

  it('has correct metadata', () => {
    expect(knipEngine.name).toBe('knip')
    expect(knipEngine.description).toContain('unused')
    expect(knipEngine.supportedLanguages).toContain('typescript')
    expect(knipEngine.supportedLanguages).toContain('javascript')
  })

  it('returns a valid EngineResult', async () => {
    const ctx = makeContext(dir)
    const result = await knipEngine.run(ctx)
    expect(result.engine).toBe('knip')
    expect(result.elapsed).toBeGreaterThanOrEqual(0)
    expect(result.diagnostics).toEqual([])
    expect([true, false]).toContain(result.skipped)
  })
})
