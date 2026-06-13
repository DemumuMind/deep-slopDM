import { execSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join, relative } from 'node:path'
import type { Diagnostic, EngineContext } from '../../types/index.js'

/** Default timeout for golangci-lint execution (ms) */
const GOLANGCI_TIMEOUT_MS = 60_000

/** golangci-lint JSON output format */
interface GolangciIssue {
  FromLinter: string
  Text: string
  Severity: string
  Pos: { Filename: string; Line: number; Column: number }
  Replacement: unknown | null
}

interface GolangciReport {
  Issues: GolangciIssue[]
}

/** Check if golangci-lint is available on PATH */
function isGolangciAvailable(): boolean {
  try {
    execSync('golangci-lint version', { stdio: 'pipe', timeout: 5_000 })
    return true
  } catch {
    return false
  }
}

/** Check if go.mod exists in the project */
function hasGoMod(root: string): boolean {
  return existsSync(join(root, 'go.mod'))
}

/** Map golangci-lint severity to our severity levels */
function mapSeverity(linter: string, textSeverity: string): Diagnostic['severity'] {
  if (textSeverity === 'error') return 'error'
  // Certain linters are always high severity
  const errorLinters = ['govet', 'errcheck', 'sqlclosecheck', 'rowserrcheck']
  if (errorLinters.includes(linter)) return 'error'
  return 'warning'
}

/** Run golangci-lint and return diagnostics */
export function runGolangciLint(context: EngineContext): Diagnostic[] {
  if (!isGolangciAvailable()) return []
  if (!hasGoMod(context.rootDirectory)) return []

  const root = context.rootDirectory
  let rawOutput: string

  try {
    rawOutput = execSync('golangci-lint run --out-format=json ./...', {
      cwd: root,
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: GOLANGCI_TIMEOUT_MS,
      encoding: 'utf-8',
    })
  } catch (err: unknown) {
    // golangci-lint exits non-zero when issues found — output is still on stdout
    const e = err as { stdout?: string; status?: number }
    if (e.stdout && typeof e.stdout === 'string') {
      rawOutput = e.stdout
    } else {
      return []
    }
  }

  let report: GolangciReport
  try {
    report = JSON.parse(rawOutput) as GolangciReport
  } catch {
    return []
  }

  const issues = report.Issues
  if (!Array.isArray(issues)) return []

  const diagnostics: Diagnostic[] = []

  for (const issue of issues) {
    const filePath = relative(root, issue.Pos.Filename).replace(/\\/g, '/')
    const linter = issue.FromLinter ?? 'unknown'
    const severity = mapSeverity(linter, issue.Severity ?? '')

    diagnostics.push({
      engine: 'lint-external',
      filePath,
      rule: `lint-external/golangci-${linter}`,
      severity,
      message: issue.Text,
      help: `See golangci-lint documentation for linter: ${linter}`,
      line: issue.Pos.Line ?? 1,
      column: issue.Pos.Column ?? 1,
      category: 'style',
      fixable: issue.Replacement != null,
    })
  }

  return diagnostics
}

/** Check if golangci-lint is installed (for skip detection) */
export function golangciAvailable(): boolean {
  return isGolangciAvailable()
}

