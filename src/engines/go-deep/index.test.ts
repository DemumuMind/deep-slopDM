import { describe, it, expect, afterAll } from 'vitest'
import { goDeepEngine } from './index.js'
import { makeContext, tempDir, writeFile, cleanup } from '../test-utils.js'

describe('go-deep', () => {
  const dir = tempDir()
  afterAll(() => cleanup(dir))

  it('has engine metadata', () => {
    expect(goDeepEngine.name).toBe('go-deep')
    expect(goDeepEngine.supportedLanguages).toContain('go')
    expect(goDeepEngine.description).toContain('Go-specific')
  })

  it('detects idiomatic Go issues', async () => {
    const src = `package main

import (
  "fmt"
  "net/http"
  "os"
  "context"
)

func init() {
  f, err := os.Create("tmp")
  if err != nil {
    panic(err)
  }
  f.Close()
}

func main() {
  doSomething()
}

func doSomething() {
  _, err := someFunc()
  _ = someFunc()
  http.Get("http://example.com")
  var x interface{} = 1
  var y any = 2
  for i := 0; i < 10; i++ {
    defer cleanup()
  }
  goto exit
exit:
  fmt.Println("done")
}

func ExportedNoDoc() {}

func Process(cfg Config) {}

type Config struct{}

func Good(ctx context.Context) {
  http.Get("http://example.com")
}

func someFunc() (int, error) { return 0, nil }
func cleanup() {}
`

    const filePath = writeFile(dir, 'main.go', src)
    const ctx = makeContext(dir)
    ctx.languages = ['go']
    ctx.files = [filePath]
    const result = await goDeepEngine.run(ctx)

    expect(result.engine).toBe('go-deep')
    const rules = result.diagnostics.map((d) => d.rule)

    for (const rule of [
      'go-deep/unchecked-error',
      'go-deep/empty-interface',
      'go-deep/exported-no-doc',
      'go-deep/deep-copy-missing',
      'go-deep/init-side-effect',
      'go-deep/defer-in-loop',
      'go-deep/context-missing',
      'go-deep/goto-usage',
    ]) {
      expect(rules).toContain(rule)
    }

    const contextMissing = result.diagnostics.filter((d) => d.rule === 'go-deep/context-missing')
    expect(contextMissing.some((d) => d.message.includes("doSomething"))).toBe(true)
  })

  it('detects package import cycles', async () => {
    const f1 = writeFile(dir, 'pkgA/foo.go', 'package a\n\nimport "b"\n')
    const f2 = writeFile(dir, 'pkgB/bar.go', 'package b\n\nimport "a"\n')
    const ctx = makeContext(dir)
    ctx.languages = ['go']
    ctx.files = [f1, f2]
    const result = await goDeepEngine.run(ctx)
    const rules = result.diagnostics.map((d) => d.rule)
    expect(rules).toContain('go-deep/package-cycle')
  })
})
