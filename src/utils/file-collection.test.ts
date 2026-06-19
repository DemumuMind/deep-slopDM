import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { collectFilesByExtension } from './file-collection.js'

const baseTmp = join(tmpdir(), 'deep-slop-file-collection-' + process.pid)

describe('collectFilesByExtension', () => {
  let root: string

  beforeEach(() => {
    root = mkdtempSync(baseTmp)
  })

  afterEach(() => {
    try { rmSync(root, { recursive: true, force: true }) } catch {}
  })

  it('collects matching files recursively', async () => {
    mkdirSync(join(root, 'src'), { recursive: true })
    mkdirSync(join(root, 'node_modules'), { recursive: true })
    writeFileSync(join(root, 'src', 'a.ts'), '')
    writeFileSync(join(root, 'src', 'b.js'), '')
    writeFileSync(join(root, 'node_modules', 'bad.ts'), '')

    const files = await collectFilesByExtension(root, new Set(['.ts']), ['node_modules'])
    expect(files).toContain(join(root, 'src', 'a.ts'))
    expect(files).not.toContain(join(root, 'src', 'b.js'))
    expect(files).not.toContain(join(root, 'node_modules', 'bad.ts'))
  })

  it('returns empty when the extension set is empty', async () => {
    writeFileSync(join(root, 'a.ts'), '')
    const files = await collectFilesByExtension(root, new Set())
    expect(files).toEqual([])
  })

  it('returns empty for a non-existent root', async () => {
    const files = await collectFilesByExtension(join(root, 'missing'), new Set(['.ts']))
    expect(files).toEqual([])
  })

  it('skips paths matching exclude patterns', async () => {
    mkdirSync(join(root, 'dist'), { recursive: true })
    mkdirSync(join(root, 'src'), { recursive: true })
    writeFileSync(join(root, 'dist', 'bundle.ts'), '')
    writeFileSync(join(root, 'src', 'app.ts'), '')

    const files = await collectFilesByExtension(root, new Set(['.ts']), ['dist'])
    expect(files).toContain(join(root, 'src', 'app.ts'))
    expect(files).not.toContain(join(root, 'dist', 'bundle.ts'))
  })
})
