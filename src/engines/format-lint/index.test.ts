import { describe, it, expect, afterAll } from 'vitest'
import { formatLintEngine } from './index.js'
import { makeContext, tempDir, writeFile, cleanup } from '../test-utils.js'

describe('format-lint', () => {
  const dir = tempDir()
  afterAll(() => cleanup(dir))

  it('has correct metadata', () => {
    expect(formatLintEngine.name).toBe('format-lint')
    expect(formatLintEngine.description).toContain('Format linting')
    expect(formatLintEngine.supportedLanguages).toContain('typescript')
    expect(formatLintEngine.supportedLanguages).toContain('javascript')
  })

  it('returns a valid EngineResult', async () => {
    const ctx = makeContext(dir)
    const result = await formatLintEngine.run(ctx)
    expect(result.engine).toBe('format-lint')
    expect(result.skipped).toBe(true)
    expect(result.diagnostics).toEqual([])
    expect(result.elapsed).toBeGreaterThanOrEqual(0)
  })

  it('detects formatting issues in sample code', async () => {
    const filePath = writeFile(
      dir,
      'test.ts',
      `const a = 'single'\nconst b = "double"\nconst c = 1;\nconst d = 2\nconst veryLongVariableName = 'this is a very long string that should definitely exceed the default maximum line length of one hundred and twenty characters'\n\n\n\n\nconst e = 3\n`,
    )
    const ctx = makeContext(dir)
    ctx.files = [filePath]
    const result = await formatLintEngine.run(ctx)
    expect(result.engine).toBe('format-lint')
    expect(result.skipped).toBe(false)
    expect(result.elapsed).toBeGreaterThanOrEqual(0)
    expect(result.diagnostics.length).toBeGreaterThan(0)
    const rules = result.diagnostics.map((d) => d.rule)
    expect(rules).toContain('format-lint/inconsistent-quotes')
    expect(rules).toContain('format-lint/inconsistent-semicolons')
    expect(rules).toContain('format-lint/max-line-length')
    expect(rules).toContain('format-lint/blank-line-cluster')
  })
})
