import { describe, it, expect, afterAll } from 'vitest'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { archRulesEngine } from './index.js'
import { makeContext, tempDir, writeFile, cleanup } from '../test-utils.js'

describe('arch-rules', () => {
  const dir = tempDir()
  afterAll(() => cleanup(dir))

  it('has correct metadata', () => {
    expect(archRulesEngine.name).toBe('arch-rules')
    expect(archRulesEngine.description).toContain('User-defined architecture rules')
    expect(archRulesEngine.supportedLanguages).toContain('typescript')
    expect(archRulesEngine.supportedLanguages).toContain('javascript')
  })

  it('returns a valid EngineResult and skips when no rules.yml exists', async () => {
    const ctx = makeContext(dir)
    const result = await archRulesEngine.run(ctx)
    expect(result.engine).toBe('arch-rules')
    expect(result.skipped).toBe(true)
    expect(result.skipReason).toMatch(/No rules defined|Failed to load rules/)
    expect(result.diagnostics).toEqual([])
    expect(result.elapsed).toBeGreaterThanOrEqual(0)
  })

  it('detects forbidden imports when rules are defined', async () => {
    const rulesDir = join(dir, '.deep-slop')
    mkdirSync(rulesDir, { recursive: true })
    writeFileSync(
      join(rulesDir, 'rules.yml'),
      `rules:
  - name: no-lodash
    type: forbid_import
    match: '**/*.ts'
    forbid: 'lodash'
    severity: error`,
      'utf-8',
    )
    const filePath = writeFile(dir, 'bad.ts', `import { debounce } from 'lodash'\nconsole.log(debounce)`)
    const ctx = makeContext(dir)
    ctx.files = [filePath]
    const result = await archRulesEngine.run(ctx)
    expect(result.engine).toBe('arch-rules')
    expect(result.skipped).toBe(false)
    expect(result.elapsed).toBeGreaterThanOrEqual(0)
    expect(result.diagnostics.length).toBeGreaterThan(0)
    const rules = result.diagnostics.map((d) => d.rule)
    expect(rules).toContain('arch-rules/no-lodash')
  })
})
