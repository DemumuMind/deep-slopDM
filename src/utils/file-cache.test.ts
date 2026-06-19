import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { readFileCached, preloadFiles, clearFileCache } from './file-cache.js'
import { writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const TEST_DIR = join(tmpdir(), 'deep-slop-test-file-cache-' + process.pid)

describe('file-cache', () => {
  beforeEach(() => {
    clearFileCache()
    try { mkdirSync(TEST_DIR, { recursive: true }) } catch {}
  })

  afterEach(() => {
    clearFileCache()
    try { rmSync(TEST_DIR, { recursive: true }) } catch {}
  })

  describe('readFileCached', () => {
    it('reads file content correctly', async () => {
      const filePath = join(TEST_DIR, 'test.txt')
      writeFileSync(filePath, 'hello world', 'utf-8')
      const content = await readFileCached(filePath)
      expect(content).toBe('hello world')
    })

    it('returns cached content when stat/read fails', async () => {
      const filePath = join(TEST_DIR, 'cached.txt')
      writeFileSync(filePath, 'cached content', 'utf-8')
      const first = await readFileCached(filePath)
      rmSync(filePath)
      const second = await readFileCached(filePath)
      expect(first).toBe('cached content')
      expect(second).toBe('cached content')
    })

    it('strips BOM from file content', async () => {
      const filePath = join(TEST_DIR, 'bom.txt')
      const bom = Buffer.from([0xef, 0xbb, 0xbf])
      const content = Buffer.concat([bom, Buffer.from('no bom')])
      writeFileSync(filePath, content)
      const result = await readFileCached(filePath)
      expect(result).toBe('no bom')
      expect(result.charCodeAt(0)).not.toBe(0xfeff)
    })

    it('throws for non-existent file', async () => {
      await expect(readFileCached(join(TEST_DIR, 'nonexistent.txt'))).rejects.toThrow()
    })
  })

  describe('clearFileCache', () => {
    it('clears the cache', async () => {
      const filePath = join(TEST_DIR, 'clear.txt')
      writeFileSync(filePath, 'data', 'utf-8')
      const first = await readFileCached(filePath)
      rmSync(filePath)
      clearFileCache()
      await expect(readFileCached(filePath)).rejects.toThrow()
      expect(first).toBe('data')
    })
  })

  describe('preloadFiles', () => {
    it('preloads multiple files', async () => {
      const f1 = join(TEST_DIR, 'a.txt')
      const f2 = join(TEST_DIR, 'b.txt')
      writeFileSync(f1, 'aaa', 'utf-8')
      writeFileSync(f2, 'bbb', 'utf-8')
      await preloadFiles([f1, f2])
      expect(await readFileCached(f1)).toBe('aaa')
      expect(await readFileCached(f2)).toBe('bbb')
    })

    it('skips unreadable files without throwing', async () => {
      const f1 = join(TEST_DIR, 'good.txt')
      const f2 = join(TEST_DIR, 'missing.txt')
      writeFileSync(f1, 'ok', 'utf-8')
      await expect(preloadFiles([f1, f2])).resolves.toBeUndefined()
    })
  })
})
