// ── Benchmark Runner ─────────────────────────────────────
// Runs deep-slop scan repeatedly and reports per-engine timing statistics.

import { resolve, join } from 'node:path'
import { access, readdir, stat, readFile, writeFile, mkdir } from 'node:fs/promises'
import { runScan } from '../engines/orchestrator.js'
import { detectLanguages, detectFrameworks, collectFiles } from '../utils/discover.js'
import { DEFAULT_CONFIG } from '../types/index.js'
import type { DeepSlopConfig, EngineName } from '../types/index.js'

async function exists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

/** Benchmark timing for a single engine */
export interface EngineBenchmark {
  name: EngineName
  iterations: number
  avgMs: number
  minMs: number
  maxMs: number
  totalMs: number
}

/** Result of a single benchmark run */
export interface BenchmarkResult {
  timestamp: string
  iterations: number
  path: string
  totalMs: number
  avgMs: number
  minMs: number
  maxMs: number
  engines: EngineBenchmark[]
  filesScanned: number
  score: number | null
}

/** Options for running a benchmark */
export interface BenchmarkOptions {
  path?: string
  iterations?: number
  outputDir?: string
  compare?: boolean
  config?: DeepSlopConfig
}

/** Default benchmark output directory */
const DEFAULT_BENCH_DIR = 'benchmark'

/** Run a benchmark and return the result plus a text summary */
export async function runBenchmark(options: BenchmarkOptions = {}): Promise<{ result: BenchmarkResult; summary: string; previous: BenchmarkResult | null }> {
  const rootDir = resolve(options.path ?? '.')
  const iterations = Math.max(1, options.iterations ?? 3)
  const config = options.config ?? DEFAULT_CONFIG
  const outputDir = resolve(options.outputDir ?? DEFAULT_BENCH_DIR)

  const languages = await detectLanguages(rootDir)
  const frameworks = await detectFrameworks(rootDir)
  const files = await collectFiles(rootDir, languages, config.exclude)

  const context = {
    rootDirectory: rootDir,
    languages,
    frameworks,
    files,
    installedTools: {} as Record<string, string | boolean>,
    config,
  }

  const engineTotals = new Map<EngineName, number[]>()
  const totals: number[] = []
  let finalScore: number | null = null
  let filesScanned = 0

  for (let i = 0; i < iterations; i++) {
    const result = await runScan(context)
    totals.push(result.meta.elapsed)
    filesScanned = result.meta.filesScanned
    finalScore = result.score

    for (const e of result.engines) {
      const list = engineTotals.get(e.engine) ?? []
      list.push(e.elapsed)
      engineTotals.set(e.engine, list)
    }
  }

  const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length

  const engines: EngineBenchmark[] = Array.from(engineTotals.entries())
    .map(([name, times]) => ({
      name,
      iterations: times.length,
      avgMs: Math.round(avg(times)),
      minMs: Math.round(Math.min(...times)),
      maxMs: Math.round(Math.max(...times)),
      totalMs: Math.round(times.reduce((a, b) => a + b, 0)),
    }))
    .sort((a, b) => b.totalMs - a.totalMs)

  const result: BenchmarkResult = {
    timestamp: new Date().toISOString(),
    iterations,
    path: rootDir,
    totalMs: Math.round(totals.reduce((a, b) => a + b, 0)),
    avgMs: Math.round(avg(totals)),
    minMs: Math.round(Math.min(...totals)),
    maxMs: Math.round(Math.max(...totals)),
    engines,
    filesScanned,
    score: finalScore,
  }

  const previous = options.compare ? await loadPreviousBenchmark(outputDir) : null
  const summary = formatSummary(result, previous)

  if (!(await exists(outputDir))) {
    await mkdir(outputDir, { recursive: true })
  }

  const filename = `benchmark-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
  await writeFile(join(outputDir, filename), JSON.stringify(result, null, 2), 'utf8')

  return { result, summary, previous }
}

/** Find the most recent benchmark JSON file in the output directory */
async function loadPreviousBenchmark(outputDir: string): Promise<BenchmarkResult | null> {
  if (!(await exists(outputDir))) return null

  const entries = await readdir(outputDir)
  const files = entries
    .filter((f) => f.startsWith('benchmark-') && f.endsWith('.json'))
    .map((f) => join(outputDir, f))

  const stats = await Promise.all(
    files.map(async (p) => {
      try {
        const s = await stat(p)
        return { path: p, mtime: s.mtime.getTime() }
      } catch {
        return null
      }
    })
  )

  const valid = stats
    .filter((x): x is { path: string; mtime: number } => x !== null)
    .sort((a, b) => b.mtime - a.mtime)

  if (valid.length === 0) return null

  try {
    const content = await readFile(valid[0].path, 'utf8')
    return JSON.parse(content) as BenchmarkResult
  } catch {
    return null
  }
}

/** Format a human-readable benchmark summary */
function formatSummary(result: BenchmarkResult, previous: BenchmarkResult | null): string {
  const lines: string[] = []
  lines.push('')
  lines.push('Benchmark Summary')
  lines.push('─'.repeat(50))
  lines.push(`Path:       ${result.path}`)
  lines.push(`Iterations: ${result.iterations}`)
  lines.push(`Files:      ${result.filesScanned}`)
  lines.push(`Score:      ${result.score ?? '—'}`)
  lines.push('')
  lines.push('Total scan time')
  lines.push(`  Avg: ${result.avgMs}ms  Min: ${result.minMs}ms  Max: ${result.maxMs}ms  Total: ${result.totalMs}ms`)

  if (previous) {
    const delta = result.avgMs - previous.avgMs
    const pct = previous.avgMs === 0 ? 0 : (delta / previous.avgMs) * 100
    const label = delta <= 0 ? 'faster' : 'slower'
    lines.push(`  vs previous: ${Math.abs(delta)}ms ${label} (${Math.abs(pct).toFixed(1)}%)`)
  }

  lines.push('')
  lines.push('Per-engine timing')
  lines.push(`  ${'Engine'.padEnd(22)} ${'Avg'.padStart(8)} ${'Min'.padStart(8)} ${'Max'.padStart(8)} ${'Total'.padStart(9)}`)
  for (const e of result.engines) {
    lines.push(`  ${e.name.padEnd(22)} ${String(e.avgMs).padStart(8)} ${String(e.minMs).padStart(8)} ${String(e.maxMs).padStart(8)} ${String(e.totalMs).padStart(9)}`)
  }

  return lines.join('\n')
}

/** Format a JSON benchmark summary */
export function formatJsonSummary(result: BenchmarkResult, previous: BenchmarkResult | null): string {
  return JSON.stringify({
    current: result,
    previous,
    comparison: previous ? {
      avgMsDelta: result.avgMs - previous.avgMs,
      avgMsDeltaPct: previous.avgMs === 0 ? 0 : ((result.avgMs - previous.avgMs) / previous.avgMs) * 100,
      totalMsDelta: result.totalMs - previous.totalMs,
    } : null,
  }, null, 2)
}
