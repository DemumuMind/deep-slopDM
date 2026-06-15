import { describe, it, expect } from 'vitest'
import { execFile as execFileCb } from 'node:child_process'
import { promisify } from 'node:util'
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { tmpdir } from 'node:os'

const execFile = promisify(execFileCb)

const ROOT = resolve(__dirname, '../..')

// Use bundled CLI if available (local build), otherwise fall back to tsx (CI)
const BUNDLED_CLI = resolve(ROOT, 'dist/deep-slop-bundled.js')
const SOURCE_CLI = resolve(ROOT, 'src/cli.ts')
const CLI = existsSync(BUNDLED_CLI) ? BUNDLED_CLI : SOURCE_CLI
const USE_TSX = !existsSync(BUNDLED_CLI)

interface CIResult {
  score: number | null
  totalDiagnostics: number
  bySeverity: Record<string, number>
  byEngine: Record<string, number>
  engines: Array<{
    engine: string
    diagnostics: Array<{
      rule: string
      severity: string
      message: string
      line: number
      filePath: string
    }>
    skipped: boolean
  }>
  coverage: {
    isScoreable: boolean
    reason?: string
  }
  gate: {
    failBelow: number
    failOnErrors: boolean
    scoreable: boolean
    hasErrors: boolean
    score: number | null
  }
}

async function runCi(
  target: string,
  extraArgs: string[] = [],
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const args = USE_TSX
    ? ['--import', 'tsx', CLI, 'ci', target, '--format', 'json', ...extraArgs]
    : [CLI, 'ci', target, '--format', 'json', ...extraArgs]

  try {
    const { stdout, stderr } = await execFile('node', args, {
      cwd: ROOT,
      timeout: 120000,
      env: { ...process.env, NODE_OPTIONS: USE_TSX ? undefined : process.env.NODE_OPTIONS },
    })
    return { stdout, stderr, exitCode: 0 }
  } catch (err: any) {
    return {
      stdout: err.stdout ?? '',
      stderr: err.stderr ?? '',
      exitCode: err.code ?? 1,
    }
  }
}

function parseResult(stdout: string): CIResult | null {
  try {
    return JSON.parse(stdout) as CIResult
  } catch {
    return null
  }
}

function createCleanProject(): string {
  const dir = mkdtempSync(join(tmpdir(), 'deep-slop-ci-'))
  writeFileSync(
    join(dir, 'clean.ts'),
    "export function greet(name: string): string {\n  return `Hello, ${name}`\n}\n",
    'utf8',
  )
  return dir
}

describe('E2E: deep-slop ci', () => {
  const projectDir = createCleanProject()

  it('produces valid JSON output with --fail-below 0', async () => {
    const { stdout, stderr, exitCode } = await runCi(projectDir, ['--fail-below', '0'])
    if (exitCode !== 0) {
      console.error('CI failed. stderr:', stderr)
      console.error('stdout (first 500):', stdout.substring(0, 500))
    }
    expect(exitCode).toBe(0)
    const result = parseResult(stdout)
    expect(result).not.toBeNull()
    if (result!.score !== null) {
      expect(result!.score).toBeGreaterThanOrEqual(0)
      expect(result!.score).toBeLessThanOrEqual(100)
    }
    expect(result!.totalDiagnostics).toBeGreaterThanOrEqual(0)
  })

  it('includes coverage and gate information', async () => {
    const { stdout, stderr, exitCode } = await runCi(projectDir, ['--fail-below', '0'])
    if (exitCode !== 0) {
      console.error('CI failed. stderr:', stderr)
    }
    expect(exitCode).toBe(0)
    const result = parseResult(stdout)
    expect(result).not.toBeNull()
    expect(result!).toHaveProperty('coverage')
    expect(result!).toHaveProperty('gate')
    expect(result!.coverage).toHaveProperty('isScoreable')
    expect(result!.gate).toHaveProperty('failBelow')
    expect(result!.gate.failBelow).toBe(0)
  })

  it('lists engines and diagnostics', async () => {
    const { stdout, exitCode } = await runCi(projectDir, ['--fail-below', '0'])
    expect(exitCode).toBe(0)
    const result = parseResult(stdout)
    expect(result).not.toBeNull()
    expect(result!.engines.length).toBeGreaterThan(0)
  })
})
