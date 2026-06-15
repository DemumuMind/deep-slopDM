import { describe, it, expect, afterAll } from 'vitest'
import { pythonDeepEngine } from './index.js'
import { makeContext, tempDir, writeFile, cleanup } from '../test-utils.js'

describe('python-deep', () => {
  const dir = tempDir()
  afterAll(() => cleanup(dir))

  it('exports the correct engine metadata', () => {
    expect(pythonDeepEngine.name).toBe('python-deep')
    expect(pythonDeepEngine.supportedLanguages).toContain('python')
    expect(typeof pythonDeepEngine.run).toBe('function')
    expect(typeof pythonDeepEngine.fix).toBe('function')
  })

  it('detects all python-deep rules', async () => {
    const code = `def bad(a, b=[]):
    global y
    print("debug")
    pass

class Foo:
    pass

def typed(x: int) -> int:
    return x

def untyped(x):
    return x

try:
    1 / 0
except:
    pass
except Exception:
    pass

from os import *

import logging
name = "world"
logging.info(f"hello {name}")

def missing_doc():
    return 1
`

    const filePath = writeFile(dir, 'sample.py', code)
    const ctx = makeContext(dir)
    ctx.languages = ['python']
    ctx.files = [filePath]

    const result = await pythonDeepEngine.run(ctx)
    expect(result.engine).toBe('python-deep')
    expect(result.skipped).toBe(false)

    const rules = result.diagnostics.map((d) => d.rule)
    expect(rules).toContain('python-deep/bare-except')
    expect(rules).toContain('python-deep/no-type-hint')
    expect(rules).toContain('python-deep/no-return-type')
    expect(rules).toContain('python-deep/f-string-in-log')
    expect(rules).toContain('python-deep/mutable-default')
    expect(rules).toContain('python-deep/global-variable')
    expect(rules).toContain('python-deep/star-import')
    expect(rules).toContain('python-deep/pass-stub')
    expect(rules).toContain('python-deep/print-statement')
    expect(rules).toContain('python-deep/broad-exception')
    expect(rules).toContain('python-deep/missing-docstring')
  })

  it('fixes fixable issues', async () => {
    const code = `def bad(a=[]):
    pass

try:
    x = 1
except:
    pass

print("debug")
`
    const filePath = writeFile(dir, 'fixable.py', code)
    const ctx = makeContext(dir)
    ctx.languages = ['python']
    ctx.files = [filePath]

    const result = await pythonDeepEngine.run(ctx)
    const fixable = result.diagnostics.filter((d) => d.fixable)
    expect(fixable.length).toBeGreaterThan(0)

    const fixResult = await pythonDeepEngine.fix!(fixable, ctx)
    expect(fixResult.fixed).toBeGreaterThan(0)
    expect(fixResult.modifiedFiles).toContain(filePath)
  })

  it('skips non-python files', async () => {
    const filePath = writeFile(dir, 'script.js', 'console.log("ok")')
    const ctx = makeContext(dir)
    ctx.languages = ['javascript']
    ctx.files = [filePath]

    const result = await pythonDeepEngine.run(ctx)
    expect(result.diagnostics).toHaveLength(0)
    expect(result.skipped).toBe(false)
  })
})
