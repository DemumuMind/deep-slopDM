import { describe, it, expect, afterAll } from 'vitest'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { frameworkLintEngine } from './index.js'
import { makeContext, tempDir, writeFile, cleanup } from '../test-utils.js'

describe('framework-lint', () => {
  const dir = tempDir()
  afterAll(() => cleanup(dir))

  it('has correct metadata', () => {
    expect(frameworkLintEngine.name).toBe('framework-lint')
    expect(frameworkLintEngine.description).toContain('Framework-specific')
    expect(frameworkLintEngine.supportedLanguages).toContain('typescript')
    expect(frameworkLintEngine.supportedLanguages).toContain('tsx')
  })

  it('returns a valid EngineResult and skips for non-framework projects', async () => {
    const ctx = makeContext(dir)
    const result = await frameworkLintEngine.run(ctx)
    expect(result.engine).toBe('framework-lint')
    expect(result.skipped).toBe(true)
    expect(result.diagnostics).toEqual([])
    expect(result.elapsed).toBeGreaterThanOrEqual(0)
  })

  it('detects Next.js and Tailwind issues in sample code', async () => {
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify({
        dependencies: { next: '14.0.0', react: '18.0.0' },
        devDependencies: { tailwindcss: '3.4.0' },
      }),
      'utf-8',
    )
    const appDir = join(dir, 'app')
    mkdirSync(appDir, { recursive: true })
    writeFile(
      dir,
      'app/page.tsx',
      `import { useState } from 'react'\nimport Image from 'next/image'\nimport Link from 'next/link'\n\nexport default function Page() {\n  const [count, setCount] = useState(0)\n  return (\n    <div className="flex p-4 p-6 w-[123px] !important">\n      <Image src="/x.jpg" alt="x" />\n      <Link href="/" aria-label="Home"></Link>\n      <button onClick={() => setCount(c => c + 1)}>{count}</button>\n      <div style={{ color: 'red' }} className="text-red-500">x</div>\n    </div>\n  )\n}\n`,
    )
    const ctx = makeContext(dir)
    ctx.languages = ['typescript', 'tsx', 'javascript', 'jsx']
    const result = await frameworkLintEngine.run(ctx)
    expect(result.engine).toBe('framework-lint')
    expect(result.skipped).toBe(false)
    expect(result.elapsed).toBeGreaterThanOrEqual(0)
    expect(result.diagnostics.length).toBeGreaterThan(0)
    const rules = result.diagnostics.map((d) => d.rule)
    expect(rules).toContain('nextjs/missing-use-client')
    expect(rules).toContain('nextjs/image-missing-dimensions')
    expect(rules).toContain('tailwind/duplicate-utilities')
    expect(rules).toContain('tailwind/inline-style-conflict')
  })
})
