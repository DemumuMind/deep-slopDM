import { describe, it, expect } from 'vitest'
import { execFile as execFileCb } from 'node:child_process'
import { promisify } from 'node:util'
import { readFileSync, unlinkSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

const execFile = promisify(execFileCb)

const ROOT = resolve(__dirname, '../..')

// Use bundled CLI if available (local build), otherwise fall back to tsx (CI)
const BUNDLED_CLI = resolve(ROOT, 'dist/deep-slop-bundled.js')
const SOURCE_CLI = resolve(ROOT, 'src/cli.ts')
const CLI = existsSync(BUNDLED_CLI) ? BUNDLED_CLI : SOURCE_CLI
const USE_TSX = !existsSync(BUNDLED_CLI)

const FIXTURES = resolve(ROOT, 'e2e/fixtures')

async function runFix(
  target: string,
  extraArgs: string[] = [],
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const args = USE_TSX
    ? ['--import', 'tsx', CLI, 'fix', target, ...extraArgs]
    : [CLI, 'fix', target, ...extraArgs]

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

describe('E2E: deep-slop fix', () => {
  it('produces valid dry-run output in safe mode', async () => {
    const { stdout, stderr, exitCode } = await runFix(FIXTURES, [
      '--safe',
      '--dry-run',
      '--engine',
      'ast-slop',
    ])
    if (exitCode !== 0) {
      console.error('Fix failed. stderr:', stderr)
      console.error('stdout (first 500):', stdout.substring(0, 500))
    }
    expect(exitCode).toBe(0)
    expect(stdout).toContain('Fix Summary')
    expect(stdout).toContain('DRY RUN')
    expect(stdout).toContain('Mode:')
    expect(stdout).toContain('safe')
    expect(stdout).toContain('Score:')
  })

  it('reports fixable diagnostics for the fixture files', async () => {
    const { stdout, stderr, exitCode } = await runFix(FIXTURES, [
      '--safe',
      '--dry-run',
    ])
    if (exitCode !== 0) {
      console.error('Fix failed. stderr:', stderr)
    }
    expect(exitCode).toBe(0)
    // The fixture contains TODO stub patterns that are now fixable
    expect(stdout).toContain('ast-slop/todo-stub')
    // Dry-run should list the proposed changes
    expect(stdout).toContain('Changes:')
  })

  it('does not modify files in dry-run mode', async () => {
    const fixturePath = resolve(FIXTURES, 'ai-slop-sample.ts')
    const before = readFileSync(fixturePath, 'utf8')

    const { stderr, exitCode } = await runFix(FIXTURES, [
      '--safe',
      '--dry-run',
      '--engine',
      'ast-slop',
    ])
    if (exitCode !== 0) {
      console.error('Fix dry-run failed. stderr:', stderr)
    }
    expect(exitCode).toBe(0)

    const after = readFileSync(fixturePath, 'utf8')
    expect(after).toBe(before)
  })
})
