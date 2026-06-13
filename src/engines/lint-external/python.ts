import { execSync } from 'node:child_process'
import { relative } from 'node:path'
import type { Diagnostic, EngineContext } from '../../types/index.js'

/** Default timeout for ruff execution (ms) */
const RUFF_TIMEOUT_MS = 30_000

/** Ruff JSON output format per diagnostic */
interface RuffDiagnostic {
  filename: string
  location: { row: number; column: number }
  end_location: { row: number; column: number } | null
  code: string
  message: string
  fix: { message: string } | null
}

/** Check if ruff is available on PATH */
function isRuffAvailable(): boolean {
  try {
    execSync('ruff --version', { stdio: 'pipe', timeout: 5_000 })
    return true
  } catch {
    return false
  }
}

/** Map ruff severity-like codes to our severity levels */
function mapSeverity(code: string): Diagnostic['severity'] {
  // Ruff category prefixes that suggest higher severity
  const errorPrefixes = ['S', 'T20', 'ERA'] // security, print, commented-out
  if (errorPrefixes.some((p) => code.startsWith(p))) return 'error'
  return 'warning'
}

/** Run ruff and return diagnostics */
export function runRuff(context: EngineContext): Diagnostic[] {
  if (!isRuffAvailable()) return []

  const root = context.rootDirectory
  let rawOutput: string

  try {
    rawOutput = execSync('ruff check --output-format=json .', {
      cwd: root,
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: RUFF_TIMEOUT_MS,
      encoding: 'utf-8',
    })
  } catch (err: unknown) {
    // ruff exits non-zero when issues found — output is still on stdout
    const e = err as { stdout?: string; status?: number }
    if (e.stdout && typeof e.stdout === 'string') {
      rawOutput = e.stdout
    } else {
      return []
    }
  }

  let findings: RuffDiagnostic[]
  try {
    findings = JSON.parse(rawOutput) as RuffDiagnostic[]
  } catch {
    return []
  }

  if (!Array.isArray(findings)) return []

  const diagnostics: Diagnostic[] = []

  for (const f of findings) {
    const filePath = relative(root, f.filename).replace(/\\/g, '/')
    const ruleId = f.code ?? 'unknown'
    const severity = mapSeverity(ruleId)

    diagnostics.push({
      engine: 'lint-external',
      filePath,
      rule: `lint-external/ruff-${ruleId}`,
      severity,
      message: f.message,
      help: f.fix?.message ?? `Run 'ruff rule ${ruleId}' for details`,
      line: f.location?.row ?? 1,
      column: f.location?.column ?? 1,
      category: 'style',
      fixable: f.fix != null,
    })
  }

  return diagnostics
}

/** Check if ruff is installed (for skip detection) */
export function ruffAvailable(): boolean {
  return isRuffAvailable()
}

