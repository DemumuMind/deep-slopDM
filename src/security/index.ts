// ── Multi-language vulnerability auditing ─────────────────
// Runs external audit tools (npm audit, pip-audit, etc.) with timeout,
// parses their JSON output, and returns Diagnostic[].

import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { Diagnostic } from '../types/index.js'

export {
  npmAudit,
  pnpmAudit,
  pipAudit,
  goVulnCheck,
  cargoAudit,
} from './providers.js'

export {
  runWithTimeout,
  makeAuditDiagnostic,
  mapNpmSeverity,
  type RunResult,
  type NpmAuditOutput,
} from './helpers.js'

import { cargoAudit, goVulnCheck, npmAudit, pipAudit, pnpmAudit } from './providers.js'

/**
 * Run dependency audits for the detected project languages.
 * Dispatches to npm/pnpm, pip, govulncheck, or cargo audit as appropriate.
 */
export function runSecurityAudits(
  rootDir: string,
  languages: string[],
  timeout: number
): Diagnostic[] {
  const diagnostics: Diagnostic[] = []

  // npm/pnpm audit for JS/TS projects
  if (languages.includes('typescript') || languages.includes('javascript')) {
    diagnostics.push(
      ...(existsSync(join(rootDir, 'pnpm-lock.yaml'))
        ? pnpmAudit(rootDir, timeout)
        : npmAudit(rootDir, timeout))
    )
  }

  // pip-audit for Python projects
  if (languages.includes('python')) {
    diagnostics.push(...pipAudit(rootDir, timeout))
  }

  // govulncheck for Go projects
  if (languages.includes('go')) {
    diagnostics.push(...goVulnCheck(rootDir, timeout))
  }

  // cargo audit for Rust projects
  if (languages.includes('rust')) {
    diagnostics.push(...cargoAudit(rootDir, timeout))
  }

  return diagnostics
}
