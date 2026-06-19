import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdirSync, rmSync, existsSync, readdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { runBenchmark, formatJsonSummary } from './index.js'

function makeRootOutputDir(): string {
  return join(tmpdir(), `deep-slop-bench-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)
}

function makeOutputDir(rootOutputDir: string): string {
  return join(rootOutputDir, `run-${Date.now()}-${Math.random().toString(36).slice(2)}`)
}

describe('benchmark runner', () => {
  let rootOutputDir: string

  beforeEach(() => {
    rootOutputDir = makeRootOutputDir()
  })

  afterEach(() => {
    if (existsSync(rootOutputDir)) {
      rmSync(rootOutputDir, { recursive: true, force: true })
    }
  })

  it('runs the requested number of iterations and writes a JSON result', async () => {
    const outputDir = makeOutputDir(rootOutputDir)
    const { result, summary } = await runBenchmark({
      path: resolve('.'),
      iterations: 2,
      outputDir,
    })

    expect(result.iterations).toBe(2)
    expect(result.path).toBe(resolve('.'))
    expect(result.engines.length).toBeGreaterThan(0)
    expect(result.avgMs).toBeGreaterThanOrEqual(0)
    expect(result.totalMs).toBeGreaterThanOrEqual(0)
    expect(summary).toContain('Benchmark Summary')

    const files = readdirSync(outputDir).filter((f) => f.startsWith('benchmark-') && f.endsWith('.json'))
    expect(files.length).toBe(1)

    const written = JSON.parse(readFileSync(join(outputDir, files[0]), 'utf8'))
    expect(written.iterations).toBe(2)
    expect(written.engines.length).toBeGreaterThan(0)
  })

  it('compares with previous benchmark when compare is true', async () => {
    const outputDir = makeOutputDir(rootOutputDir)
    await runBenchmark({ path: resolve('.'), iterations: 1, outputDir })
    const { previous } = await runBenchmark({ path: resolve('.'), iterations: 1, outputDir, compare: true })

    expect(previous).not.toBeNull()
    expect(previous?.iterations).toBe(1)
  })

  it('formats JSON summary with optional previous result', () => {
    const current = {
      timestamp: new Date().toISOString(),
      iterations: 3,
      path: '.',
      totalMs: 300,
      avgMs: 100,
      minMs: 90,
      maxMs: 110,
      engines: [],
      filesScanned: 1,
      score: null,
    }
    const previous = { ...current, avgMs: 120, totalMs: 360 }
    const json = JSON.parse(formatJsonSummary(current, previous))

    expect(json.current.avgMs).toBe(100)
    expect(json.previous.avgMs).toBe(120)
    expect(json.comparison.avgMsDelta).toBe(-20)
  })
})
