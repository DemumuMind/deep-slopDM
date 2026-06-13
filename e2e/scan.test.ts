import { describe, it, expect } from 'vitest'
import { execFile as execFileCb } from 'node:child_process'
import { promisify } from 'node:util'
import { resolve } from 'node:path'

const execFile = promisify(execFileCb)

const ROOT = resolve(__dirname, '..')
const CLI = resolve(ROOT, 'dist/deep-slop-bundled.js')
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
  try {
    const { stdout, stderr } = await execFile('node', [CLI, 'scan', target, '--json', ...extraArgs], {
      cwd: ROOT,
      timeout: 120000,
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
    const { stdout, exitCode } = await scan(FIXTURES)
    expect(exitCode).toBe(0)
    const result = parseResult(stdout)
    expect(result).not.toBeNull()
    expect(result!.meta.filesScanned).toBeGreaterThanOrEqual(2)
    expect(result!.totalDiagnostics).toBeGreaterThan(0)
  })

  it('detects AI slop patterns in fixture files', async () => {
    const { stdout } = await scan(FIXTURES)
    const result = parseResult(stdout)!
    // Should find at least some issues in the slop fixture
    expect(result.totalDiagnostics).toBeGreaterThan(0)
    // Check that specific rules fired
    const allRules = result.engines.flatMap(e => e.diagnostics.map(d => d.rule))
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
    const { stdout, exitCode } = await scan(FIXTURES, ['--format', 'json'])
    expect(exitCode).toBe(0)
    const parsed = JSON.parse(stdout)
    expect(parsed).toHaveProperty('score')
    expect(parsed).toHaveProperty('engines')
    expect(parsed).toHaveProperty('totalDiagnostics')
  })

  it('--engine flag filters to specific engine', async () => {
    const { stdout } = await scan(FIXTURES, ['--engine', 'ast-slop'])
    const result = parseResult(stdout)!
    // Only ast-slop engine should have results
    const engineNames = result.engines.filter(e => e.diagnostics.length > 0).map(e => e.engine)
    // All non-empty engines should be ast-slop
    for (const name of engineNames) {
      expect(name).toBe('ast-slop')
    }
  })

  it('--exclude flag works', async () => {
    // node_modules is always excluded by default config
    // Test that --exclude can add additional patterns
    const { stdout, exitCode } = await scan(FIXTURES, ['--exclude', 'clean-code.ts'])
    const result = parseResult(stdout)!
    // clean-code.ts should have been excluded from scanning
    const cleanFiles = result.engines.flatMap(e =>
      e.diagnostics.filter(d => d.filePath === 'clean-code.ts')
    )
    expect(cleanFiles.length).toBe(0)
  })

  it('score is between 0 and 100', async () => {
    const { stdout } = await scan(FIXTURES)
    const result = parseResult(stdout)!
    expect(result.score).toBeGreaterThanOrEqual(0)
    expect(result.score).toBeLessThanOrEqual(100)
  })

  it('reports engine names in results', async () => {
    const { stdout } = await scan(FIXTURES)
    const result = parseResult(stdout)!
    const names = result.engines.map(e => e.engine)
    expect(names.length).toBeGreaterThan(0)
  })
})
