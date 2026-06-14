import { describe, it, expect } from 'vitest'
import { execFile as execFileCb } from 'node:child_process'
import { promisify } from 'node:util'
import { resolve } from 'node:path'
import { existsSync } from 'node:fs'

const execFile = promisify(execFileCb)

const ROOT = resolve(__dirname, '..')

// Use bundled CLI if available (local), otherwise fall back to tsx (CI)
const BUNDLED_CLI = resolve(ROOT, 'dist/deep-slop-bundled.js')
const SOURCE_CLI = resolve(ROOT, 'src/cli.ts')
const CLI = existsSync(BUNDLED_CLI) ? BUNDLED_CLI : SOURCE_CLI
const USE_TSX = !existsSync(BUNDLED_CLI)

const FIXTURES = resolve(ROOT, 'e2e/fixtures')

interface ScanResult {
  score: number
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
    skipReason?: string
  }>
  meta: {
    rootDirectory: string
    languages: string[]
    filesScanned: number
  }
}

async function scan(target: string, extraArgs: string[] = []): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const args = USE_TSX
    ? ['--import', 'tsx', CLI, 'scan', target, '--json', ...extraArgs]
    : [CLI, 'scan', target, '--json', ...extraArgs]

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

function parseResult(stdout: string): ScanResult | null {
  try {
    return JSON.parse(stdout) as ScanResult
  } catch {
    return null
  }
}

describe('E2E: deep-slop scan', () => {
  it('scans the fixtures directory and returns results', async () => {
    const { stdout, stderr, exitCode } = await scan(FIXTURES)
    if (exitCode !== 0) {
      console.error('Scan failed. stderr:', stderr)
      console.error('stdout (first 500):', stdout.substring(0, 500))
    }
    expect(exitCode).toBe(0)
    const result = parseResult(stdout)
    expect(result).not.toBeNull()
    expect(result!.meta.filesScanned).toBeGreaterThanOrEqual(2)
    expect(result!.totalDiagnostics).toBeGreaterThan(0)
  })

  it('detects AI slop patterns in fixture files', async () => {
    const { stdout, stderr, exitCode } = await scan(FIXTURES)
    expect(exitCode).toBe(0)
    const result = parseResult(stdout)
    expect(result).not.toBeNull()
    // Should find at least some issues in the slop fixture
    expect(result!.totalDiagnostics).toBeGreaterThan(0)
    // Check that specific rules fired
    const allRules = result!.engines.flatMap(e => e.diagnostics.map(d => d.rule))
    expect(allRules.length).toBeGreaterThan(0)
  })

  it('scan does not crash on Python files', async () => {
    const { exitCode, stderr } = await scan(FIXTURES)
    // Should not crash even with Python files
    expect(exitCode).toBe(0)
    expect(stderr).not.toContain('TypeError')
    expect(stderr).not.toContain('Cannot read')
  })

  it('--format json produces valid JSON output', async () => {
    const { stdout, exitCode, stderr } = await scan(FIXTURES, ['--format', 'json'])
    if (exitCode !== 0) {
      console.error('JSON scan failed. stderr:', stderr)
    }
    expect(exitCode).toBe(0)
    const parsed = JSON.parse(stdout)
    expect(parsed).toHaveProperty('score')
    expect(parsed).toHaveProperty('engines')
    expect(parsed).toHaveProperty('totalDiagnostics')
  })

  it('--engine flag filters to specific engine', async () => {
    const { stdout, exitCode } = await scan(FIXTURES, ['--engine', 'ast-slop'])
    expect(exitCode).toBe(0)
    const result = parseResult(stdout)
    expect(result).not.toBeNull()
    // Only ast-slop engine should have results
    const engineNames = result!.engines.filter(e => e.diagnostics.length > 0).map(e => e.engine)
    // All non-empty engines should be ast-slop
    for (const name of engineNames) {
      expect(name).toBe('ast-slop')
    }
  })

  it('--exclude flag works', async () => {
    // node_modules is always excluded by default config
    // Test that --exclude can add additional patterns
    const { stdout, exitCode } = await scan(FIXTURES, ['--exclude', 'clean-code.ts'])
    expect(exitCode).toBe(0)
    const result = parseResult(stdout)
    expect(result).not.toBeNull()
    // clean-code.ts should have been excluded from scanning
    const cleanFiles = result!.engines.flatMap(e =>
      e.diagnostics.filter(d => d.filePath === 'clean-code.ts')
    )
    expect(cleanFiles.length).toBe(0)
  })

  it('score is between 0 and 100', async () => {
    const { stdout, exitCode } = await scan(FIXTURES)
    expect(exitCode).toBe(0)
    const result = parseResult(stdout)
    expect(result).not.toBeNull()
    expect(result!.score).toBeGreaterThanOrEqual(0)
    expect(result!.score).toBeLessThanOrEqual(100)
  })

  it('reports engine names in results', async () => {
    const { stdout, exitCode } = await scan(FIXTURES)
    expect(exitCode).toBe(0)
    const result = parseResult(stdout)
    expect(result).not.toBeNull()
    const names = result!.engines.map(e => e.engine)
    expect(names.length).toBeGreaterThan(0)
  })
})
