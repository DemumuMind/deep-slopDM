import { describe, it, expect, afterAll } from 'vitest'
import { markupLintEngine } from './index.js'
import { makeContext, tempDir, writeFile, cleanup } from '../test-utils.js'

describe('markup-lint', () => {
  const dir = tempDir()
  afterAll(() => cleanup(dir))

  it('has correct metadata', () => {
    expect(markupLintEngine.name).toBe('markup-lint')
    expect(markupLintEngine.description).toContain('JSON, YAML, CSS, HTML, and Markdown')
    expect(markupLintEngine.supportedLanguages).toContain('typescript')
    expect(markupLintEngine.supportedLanguages).toContain('javascript')
  })

  it('returns a valid EngineResult', async () => {
    const ctx = makeContext(dir)
    const result = await markupLintEngine.run(ctx)
    expect(result.engine).toBe('markup-lint')
    expect(result.skipped).toBe(true)
    expect(result.diagnostics).toEqual([])
    expect(result.elapsed).toBeGreaterThanOrEqual(0)
  })

  it('detects markup quality issues in sample files', async () => {
    const jsonPath = writeFile(
      dir,
      'bad.json',
      `{\n  "name": "a",\n  "name": "b",\n  "list": [1, 2,],\n}\n`,
    )
    const htmlPath = writeFile(
      dir,
      'bad.html',
      `<html>\n<head><title>x</title></head>\n<body>\n  <img src="x.jpg">\n  <center>old</center>\n  <div onclick="alert('x')">click</div>\n</body>\n</html>\n`,
    )
    const mdPath = writeFile(
      dir,
      'bad.md',
      `# Title\n\n[empty]()\n\n\`\`\`\nno lang\n\`\`\`\n`,
    )
    const ctx = makeContext(dir)
    ctx.files = [jsonPath, htmlPath, mdPath]
    const result = await markupLintEngine.run(ctx)
    expect(result.engine).toBe('markup-lint')
    expect(result.skipped).toBe(false)
    expect(result.elapsed).toBeGreaterThanOrEqual(0)
    expect(result.diagnostics.length).toBeGreaterThan(0)
    const rules = result.diagnostics.map((d) => d.rule)
    expect(rules).toContain('json/duplicate-keys')
    expect(rules).toContain('json/trailing-comma')
    expect(rules).toContain('html/missing-alt')
    expect(rules).toContain('html/missing-lang')
    expect(rules).toContain('html/deprecated-tag')
    expect(rules).toContain('html/inline-event-handler')
    expect(rules).toContain('md/broken-link')
    expect(rules).toContain('md/missing-fenced-lang')
  })
})
