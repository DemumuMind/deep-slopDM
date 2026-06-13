import { execSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join, relative } from 'node:path'
import type { Diagnostic, EngineContext } from '../../types/index.js'

/** Default timeout for cargo clippy execution (ms) */
const CLIPPY_TIMEOUT_MS = 120_000

/** Clippy JSON message formats we care about */
interface ClippyMessage {
  reason: string
  message?: {
    rendered?: string
    message?: string
    spans?: Array<{
      file_name: string
      line_start: number
      column_start: number
      line_end: number
      column_end: number
      is_primary: boolean
    }>
    code?: { code: string } | null
    level: string
    children?: Array<{ message: string; level: string }>
  }
}

/** Check if cargo is available on PATH */
function isCargoAvailable(): boolean {
  try {
    execSync('cargo --version', { stdio: 'pipe', timeout: 5_000 })
    return true
  } catch {
    return false
  }
}

/** Check if Cargo.toml exists in the project */
function hasCargoToml(root: string): boolean {
  return existsSync(join(root, 'Cargo.toml'))
}

/** Map clippy level to our severity */
function mapSeverity(level: string): Diagnostic['severity'] {
  if (level === 'error') return 'error'
  if (level === 'warning') return 'warning'
  return 'info'
}

/** Map clippy lint code to a category */
function mapCategory(code: string): Diagnostic['category'] {
  if (code.startsWith('clippy::correctness')) return 'syntax'
  if (code.startsWith('clippy::suspicious')) return 'security'
  if (code.startsWith('clippy::style')) return 'style'
  if (code.startsWith('clippy::complexity')) return 'architecture'
  if (code.startsWith('clippy::perf')) return 'performance'
  if (code.startsWith('clippy::pedantic') || code.startsWith('clippy::restriction')) return 'style'
  if (code.startsWith('clippy::nursery')) return 'style'
  return 'style'
}

/** Run cargo clippy and return diagnostics */
export function runClippy(context: EngineContext): Diagnostic[] {
  if (!isCargoAvailable()) return []
  if (!hasCargoToml(context.rootDirectory)) return []

  const root = context.rootDirectory
  let rawOutput: string

  try {
    rawOutput = execSync('cargo clippy --message-format=json 2>&1', {
      cwd: root,
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: CLIPPY_TIMEOUT_MS,
      encoding: 'utf-8',
      maxBuffer: 10 * 1024 * 1024, // 10 MB — clippy JSON can be large
    })
  } catch (err: unknown) {
    // cargo clippy exits non-zero when issues found
    const e = err as { stdout?: string; status?: number }
    if (e.stdout && typeof e.stdout === 'string') {
      rawOutput = e.stdout
    } else {
      return []
    }
  }

  const diagnostics: Diagnostic[] = []

  // Clippy outputs one JSON object per line
  const lines = rawOutput.split('\n').filter((l) => l.trim().length > 0)

  for (const line of lines) {
    let msg: ClippyMessage
    try {
      msg = JSON.parse(line) as ClippyMessage
    } catch {
      continue
    }

    // We only care about compiler-message and diagnostic messages
    if (msg.reason !== 'compiler-message' || !msg.message) continue

    const m = msg.message
    // Skip messages without spans or code (e.g. build artifacts)
    if (!m.spans || m.spans.length === 0) continue

    const primarySpan = m.spans.find((s) => s.is_primary) ?? m.spans[0]
    const code = m.code?.code ?? 'clippy::unknown'
    const severity = mapSeverity(m.level)
    const category = mapCategory(code)
    const filePath = relative(root, primarySpan.file_name).replace(/\\/g, '/')

    // Build help from children messages
    const help = m.children?.map((c) => c.message).join('; ') ?? `Run 'cargo clippy --explain ${code}' for details`

    diagnostics.push({
      engine: 'lint-external',
      filePath,
      rule: `lint-external/${code}`,
      severity,
      message: m.message ?? m.rendered?.split('\n')[0] ?? code,
      help,
      line: primarySpan.line_start ?? 1,
      column: primarySpan.column_start ?? 1,
      category,
      fixable: false,
    })
  }

  return diagnostics
}

/** Check if cargo/clippy is installed (for skip detection) */
export function clippyAvailable(): boolean {
  return isCargoAvailable()
}

