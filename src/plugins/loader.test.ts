import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { tmpdir } from 'node:os'
import { loadPlugin, loadPluginWithErrors, loadPlugins } from './loader.js'

const TEST_DIR = join(tmpdir(), 'deep-slop-test-plugins-' + process.pid)

function makeValidPlugin(): string {
  const path = join(TEST_DIR, 'valid-plugin.mjs')
  writeFileSync(
    path,
    `export default {\n` +
      `  name: 'todo-counter',\n` +
      `  description: 'Counts TODO comments',\n` +
      `  supportedLanguages: ['typescript'],\n` +
      `  async run() {\n` +
      `    return { engine: 'todo-counter', diagnostics: [], elapsed: 0, skipped: false }\n` +
      `  }\n` +
      `}\n`,
  )
  return path
}

function makePluginWithFix(): string {
  const path = join(TEST_DIR, 'fix-plugin.mjs')
  writeFileSync(
    path,
    `export default {\n` +
      `  name: 'fixable-demo',\n` +
      `  description: 'Demo engine with fix',\n` +
      `  supportedLanguages: ['typescript'],\n` +
      `  async run() {\n` +
      `    return { engine: 'fixable-demo', diagnostics: [], elapsed: 0, skipped: false }\n` +
      `  },\n` +
      `  async fix() {\n` +
      `    return { fixed: 0, remaining: [], modifiedFiles: [] }\n` +
      `  }\n` +
      `}\n`,
  )
  return path
}

function makePluginWithBadFix(): string {
  const path = join(TEST_DIR, 'bad-fix-plugin.mjs')
  writeFileSync(
    path,
    `export default {\n` +
      `  name: 'bad-fix',\n` +
      `  description: 'Bad fix export',\n` +
      `  supportedLanguages: ['typescript'],\n` +
      `  async run() {\n` +
      `    return { engine: 'bad-fix', diagnostics: [], elapsed: 0, skipped: false }\n` +
      `  },\n` +
      `  fix: 'not-a-function'\n` +
      `}\n`,
  )
  return path
}

function toFileUrl(path: string): string {
  return pathToFileURL(path).href
}

describe('plugin loader', () => {
  beforeEach(() => {
    try { mkdirSync(TEST_DIR, { recursive: true }) } catch {}
  })

  afterEach(() => {
    try { rmSync(TEST_DIR, { recursive: true, force: true }) } catch {}
  })

  describe('loadPluginWithErrors', () => {
    it('loads a valid plugin and returns the engine', async () => {
      const path = makeValidPlugin()
      const { engine, errors } = await loadPluginWithErrors(toFileUrl(path))
      expect(errors).toEqual([])
      expect(engine).not.toBeNull()
      expect(engine?.name).toBe('todo-counter')
      expect(engine?.description).toBe('Counts TODO comments')
      expect(engine?.supportedLanguages).toEqual(['typescript'])
      expect(typeof engine?.run).toBe('function')
    })

    it('allows an optional fix function', async () => {
      const path = makePluginWithFix()
      const { engine, errors } = await loadPluginWithErrors(toFileUrl(path))
      expect(errors).toEqual([])
      expect(engine?.fix).toBeDefined()
    })

    it('rejects a plugin with a non-function fix', async () => {
      const path = makePluginWithBadFix()
      const { engine, errors } = await loadPluginWithErrors(toFileUrl(path))
      expect(engine).toBeNull()
      expect(errors.length).toBe(1)
      expect(errors[0]).toContain("exports 'fix' but it is not a function")
    })

    it('rejects a missing default export', async () => {
      const path = join(TEST_DIR, 'no-default.mjs')
      writeFileSync(path, `export const engine = {}\n`)
      const { engine, errors } = await loadPluginWithErrors(toFileUrl(path))
      expect(engine).toBeNull()
      expect(errors.length).toBe(1)
      expect(errors[0]).toContain('must export a default Engine object')
    })

    it('rejects a missing name field', async () => {
      const path = join(TEST_DIR, 'missing-name.mjs')
      writeFileSync(
        path,
        `export default {\n` +
          `  description: 'Counts TODO comments',\n` +
          `  supportedLanguages: ['typescript'],\n` +
          `  async run() {\n` +
          `    return { engine: 'todo-counter', diagnostics: [], elapsed: 0, skipped: false }\n` +
          `  }\n` +
          `}\n`,
      )
      const { engine, errors } = await loadPluginWithErrors(toFileUrl(path))
      expect(engine).toBeNull()
      expect(errors.some((e) => e.includes("non-empty string 'name'"))).toBe(true)
    })

    it('rejects empty supportedLanguages', async () => {
      const path = join(TEST_DIR, 'bad-languages.mjs')
      writeFileSync(
        path,
        `export default {\n` +
          `  name: 'bad-engine',\n` +
          `  description: 'Bad engine',\n` +
          `  supportedLanguages: [],\n` +
          `  async run() {\n` +
          `    return { engine: 'bad-engine', diagnostics: [], elapsed: 0, skipped: false }\n` +
          `  }\n` +
          `}\n`,
      )
      const { engine, errors } = await loadPluginWithErrors(toFileUrl(path))
      expect(engine).toBeNull()
      expect(errors.some((e) => e.includes('non-empty array of strings'))).toBe(true)
    })

    it('rejects a non-function run', async () => {
      const path = join(TEST_DIR, 'bad-run.mjs')
      writeFileSync(
        path,
        `export default {\n` +
          `  name: 'bad-engine',\n` +
          `  description: 'Bad engine',\n` +
          `  supportedLanguages: ['typescript'],\n` +
          `  run: 'not-a-function'\n` +
          `}\n`,
      )
      const { engine, errors } = await loadPluginWithErrors(toFileUrl(path))
      expect(engine).toBeNull()
      expect(errors.some((e) => e.includes("'run' as an async function"))).toBe(true)
    })

    it('reports import errors clearly', async () => {
      const path = join(TEST_DIR, 'syntax-error.mjs')
      writeFileSync(path, `export default {\n`)
      const { engine, errors } = await loadPluginWithErrors(toFileUrl(path))
      expect(engine).toBeNull()
      expect(errors.length).toBe(1)
      expect(errors[0]).toContain('Failed to import plugin')
    })
  })

  describe('loadPlugin', () => {
    it('returns the engine for a valid plugin', async () => {
      const path = makeValidPlugin()
      const engine = await loadPlugin(toFileUrl(path))
      expect(engine).not.toBeNull()
      expect(engine?.name).toBe('todo-counter')
    })

    it('returns null for an invalid plugin', async () => {
      const path = join(TEST_DIR, 'bad.mjs')
      writeFileSync(path, `export default {}\n`)
      const engine = await loadPlugin(toFileUrl(path))
      expect(engine).toBeNull()
    })
  })

  describe('loadPlugins', () => {
    it('returns only valid engines', async () => {
      const valid = makeValidPlugin()
      const bad = join(TEST_DIR, 'bad.mjs')
      writeFileSync(bad, `export default {}\n`)
      const engines = await loadPlugins([toFileUrl(valid), toFileUrl(bad)])
      expect(engines).toHaveLength(1)
      expect(engines[0].name).toBe('todo-counter')
    })
  })
})
