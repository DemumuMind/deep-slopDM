import { describe, it, expect } from 'vitest'
import { execFile as execFileCb } from 'node:child_process'
import { promisify } from 'node:util'
import { readFileSync, existsSync, unlinkSync } from 'node:fs'
import { resolve } from 'node:path'

const execFile = promisify(execFileCb)

const ROOT = resolve(__dirname, '../..')

// Use bundled CLI if available (local), otherwise fall back to tsx (CI)
const BUNDLED_CLI = resolve(ROOT, 'dist/deep-slop-bundled.js')
const SOURCE_CLI = resolve(ROOT, 'src/cli/index.ts')
const CLI = existsSync(BUNDLED_CLI) ? BUNDLED_CLI : SOURCE_CLI
const USE_TSX = !existsSync(BUNDLED_CLI)

const FIXTURES = resolve(ROOT, 'e2e/fixtures')

async function runReport(
  target: string,
  extraArgs: string[] = [],
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const args = USE_TSX
    ? ['--import', 'tsx', CLI, 'report', target, ...extraArgs]
    : [CLI, 'report', target, ...extraArgs]

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

describe('E2E: deep-slop report', () => {
  const outputPath = resolve('/tmp/test-report.html')

  it('produces an HTML report from scan history', async () => {
    if (existsSync(outputPath)) unlinkSync(outputPath)

    const { stdout, stderr, exitCode } = await runReport(FIXTURES, [
      '--output',
      outputPath,
    ])
    if (exitCode !== 0) {
      console.error('Report failed. stderr:', stderr)
      console.error('stdout (first 500):', stdout.substring(0, 500))
    }
    expect(exitCode).toBe(0)
    expect(stdout).toContain('Report written to')
    expect(stdout).toContain(outputPath)

    expect(existsSync(outputPath)).toBe(true)
    const html = readFileSync(outputPath, 'utf8')
    expect(html).toContain('<html')
    expect(html).toContain('</html>')
  })

  it('report contains expected sections', async () => {
    if (existsSync(outputPath)) unlinkSync(outputPath)

    const { stdout, stderr, exitCode } = await runReport(FIXTURES, [
      '--output',
      outputPath,
      '--limit',
      '10',
    ])
    if (exitCode !== 0) {
      console.error('Report failed. stderr:', stderr)
    }
    expect(exitCode).toBe(0)

    const html = readFileSync(outputPath, 'utf8')
    expect(html).toContain('deep-slop')
    expect(html).toContain('Trend')
    expect(html.length).toBeGreaterThan(500)
  })
})
