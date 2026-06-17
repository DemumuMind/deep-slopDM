// ── Shared helpers for multi-language vulnerability auditing ──
// Runs external audit tools with timeout and builds diagnostics.

import { execSync } from 'node:child_process'
import type { Diagnostic, Severity, Suggestion } from '../types/index.js'

// ── Run a command with timeout ──────────────────────────

export interface RunResult {
  stdout: string
  stderr: string
  status: number | null
  timedOut: boolean
}

export function runWithTimeout(
  cmd: string,
  cwd: string,
  timeout: number
): RunResult {
  try {
    const stdout = execSync(cmd, {
      cwd,
      timeout,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      maxBuffer: 10 * 1024 * 1024,
    })
    return { stdout, stderr: '', status: 0, timedOut: false }
  } catch (err: unknown) {
    const e = err as {
      stdout?: string
      stderr?: string
      status?: number | null
      signal?: string | null
      killed?: boolean
    }
    return {
      stdout: typeof e.stdout === 'string' ? e.stdout : '',
      stderr: typeof e.stderr === 'string' ? e.stderr : '',
      status: e.status ?? null,
      timedOut: e.killed === true || e.signal === 'SIGTERM',
    }
  }
}

// ── Build a diagnostic ──────────────────────────────────

export function makeAuditDiagnostic(
  rule: string,
  severity: Severity,
  message: string,
  help: string,
  opts?: {
    fixable?: boolean
    suggestion?: Suggestion
    detail?: Record<string, unknown>
  }
): Diagnostic {
  return {
    filePath: 'package.json',
    engine: 'security-deep' as const,
    rule,
    severity,
    message,
    help,
    line: 1,
    column: 1,
    category: 'security' as const,
    fixable: opts?.fixable ?? false,
    suggestion: opts?.suggestion,
    detail: opts?.detail,
  }
}

// ── npm severity mapping ────────────────────────────────

export function mapNpmSeverity(s: string): Severity {
  const lower = s.toLowerCase()
  if (lower === 'critical' || lower === 'high') return 'error'
  if (lower === 'moderate' || lower === 'medium') return 'warning'
  return 'info'
}

// ── npm/pnpm shared JSON types ──────────────────────────

export interface NpmAuditAdvisory {
  severity: string
  title: string
  module_name: string
  vulnerable_versions: string
  patched_versions: string
  cwe?: string[]
  url: string
}

export interface NpmAuditVulnerability {
  name: string
  severity: string
  range: string
  via: Array<string | NpmAuditAdvisory>
  fixAvailable?: boolean | { name: string; version: string }
}

export interface NpmAuditOutput {
  advisories?: Record<string, NpmAuditAdvisory>
  vulnerabilities?: Record<string, NpmAuditVulnerability>
  metadata?: {
    vulnerabilities: Record<string, number>
  }
}
