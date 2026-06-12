// ── Multi-language vulnerability auditing ────────────────
// Runs external audit tools (npm audit, pip-audit, etc.) with timeout,
// parses their JSON output, and returns Diagnostic[].

import { execSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { Diagnostic, Severity, Suggestion } from '../types/index.js'

// ── Helper: run a command with timeout ──────────────────

interface RunResult {
  stdout: string
  stderr: string
  status: number | null
  timedOut: boolean
}

function runWithTimeout(
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

// ── Helper: build a diagnostic ──────────────────────────

function makeAuditDiagnostic(
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

// ── npm audit ───────────────────────────────────────────

interface NpmAuditAdvisory {
  severity: string
  title: string
  module_name: string
  vulnerable_versions: string
  patched_versions: string
  cwe?: string[]
  url: string
}

interface NpmAuditVulnerability {
  name: string
  severity: string
  range: string
  via: Array<string | NpmAuditAdvisory>
  fixAvailable?: boolean | { name: string; version: string }
}

interface NpmAuditOutput {
  advisories?: Record<string, NpmAuditAdvisory>
  vulnerabilities?: Record<string, NpmAuditVulnerability>
  metadata?: {
    vulnerabilities: Record<string, number>
  }
}

function mapNpmSeverity(s: string): Severity {
  const lower = s.toLowerCase()
  if (lower === 'critical' || lower === 'high') return 'error'
  if (lower === 'moderate' || lower === 'medium') return 'warning'
  return 'info'
}

export function npmAudit(rootDir: string, timeout: number): Diagnostic[] {
  const lockFile = join(rootDir, 'package-lock.json')
  if (!existsSync(lockFile) && !existsSync(join(rootDir, 'package.json'))) {
    return []
  }

  const result = runWithTimeout('npm audit --json', rootDir, timeout)
  if (result.timedOut) {
    return [
      makeAuditDiagnostic(
        'security-deep/dependency-vulnerability',
        'warning',
        'npm audit timed out',
        'Increase security.auditTimeout or check network connectivity.'
      ),
    ]
  }

  let parsed: NpmAuditOutput
  try {
    parsed = JSON.parse(result.stdout)
  } catch {
    return [
      makeAuditDiagnostic(
        'security-deep/dependency-vulnerability',
        'warning',
        'npm audit produced non-JSON output',
        'Ensure npm is installed and the project has a valid package-lock.json.'
      ),
    ]
  }

  const diagnostics: Diagnostic[] = []

  // Advisories format (npm 6)
  if (parsed.advisories) {
    for (const [, adv] of Object.entries(parsed.advisories)) {
      diagnostics.push(
        makeAuditDiagnostic(
          'security-deep/dependency-vulnerability',
          mapNpmSeverity(adv.severity),
          `Vulnerability in ${adv.module_name}: ${adv.title}`,
          `Update ${adv.module_name} to ${adv.patched_versions || 'a patched version'}. ${adv.url}`,
          {
            fixable: !!adv.patched_versions,
            suggestion: {
              type: 'refactor' as const,
              text: `npm update ${adv.module_name}`,
              confidence: 0.9,
              reason: `Patched version available: ${adv.patched_versions || 'unknown'}`,
            },
            detail: {
              module: adv.module_name,
              vulnerableVersions: adv.vulnerable_versions,
              patchedVersions: adv.patched_versions,
              cwe: adv.cwe,
              auditTool: 'npm',
            },
          }
        )
      )
    }
  }

  // Vulnerabilities format (npm 7+)
  if (parsed.vulnerabilities) {
    for (const [, vuln] of Object.entries(parsed.vulnerabilities)) {
      const isFixable = vuln.fixAvailable !== false && vuln.fixAvailable != null
      diagnostics.push(
        makeAuditDiagnostic(
          'security-deep/dependency-vulnerability',
          mapNpmSeverity(vuln.severity),
          `Vulnerability in ${vuln.name} (${vuln.range})`,
          isFixable
            ? `Run 'npm audit fix' to apply available fixes for ${vuln.name}.`
            : `No automatic fix available for ${vuln.name}. Review and update manually.`,
          {
            fixable: isFixable,
            suggestion: {
              type: 'refactor' as const,
              text: isFixable ? 'npm audit fix' : `npm update ${vuln.name}`,
              confidence: isFixable ? 0.9 : 0.5,
              reason: isFixable
                ? 'npm audit fix can resolve this automatically'
                : 'Manual review and update required',
            },
            detail: {
              module: vuln.name,
              range: vuln.range,
              fixAvailable: vuln.fixAvailable,
              auditTool: 'npm',
            },
          }
        )
      )
    }
  }

  return diagnostics
}

// ── pnpm audit ──────────────────────────────────────────

export function pnpmAudit(rootDir: string, timeout: number): Diagnostic[] {
  if (!existsSync(join(rootDir, 'pnpm-lock.yaml'))) {
    // Fallback to npm audit
    return npmAudit(rootDir, timeout)
  }

  const result = runWithTimeout('pnpm audit --json', rootDir, timeout)
  if (result.timedOut) {
    return npmAudit(rootDir, timeout)
  }

  // pnpm audit --json may not be supported in all versions;
  // if it fails, fall back to npm audit
  if (result.status !== 0 && !result.stdout.trim()) {
    return npmAudit(rootDir, timeout)
  }

  let parsed: NpmAuditOutput
  try {
    parsed = JSON.parse(result.stdout)
  } catch {
    return npmAudit(rootDir, timeout)
  }

  const diagnostics: Diagnostic[] = []

  if (parsed.advisories) {
    for (const [, adv] of Object.entries(parsed.advisories)) {
      diagnostics.push(
        makeAuditDiagnostic(
          'security-deep/dependency-vulnerability',
          mapNpmSeverity(adv.severity),
          `Vulnerability in ${adv.module_name}: ${adv.title}`,
          `Update ${adv.module_name} to ${adv.patched_versions || 'a patched version'}.`,
          {
            fixable: !!adv.patched_versions,
            suggestion: {
              type: 'refactor' as const,
              text: `pnpm update ${adv.module_name}`,
              confidence: 0.9,
              reason: `Patched version available: ${adv.patched_versions || 'unknown'}`,
            },
            detail: {
              module: adv.module_name,
              vulnerableVersions: adv.vulnerable_versions,
              patchedVersions: adv.patched_versions,
              auditTool: 'pnpm',
            },
          }
        )
      )
    }
  }

  if (parsed.vulnerabilities) {
    for (const [, vuln] of Object.entries(parsed.vulnerabilities)) {
      const isFixable = vuln.fixAvailable !== false && vuln.fixAvailable != null
      diagnostics.push(
        makeAuditDiagnostic(
          'security-deep/dependency-vulnerability',
          mapNpmSeverity(vuln.severity),
          `Vulnerability in ${vuln.name} (${vuln.range})`,
          isFixable
            ? `Run 'pnpm audit --fix' to apply available fixes for ${vuln.name}.`
            : `No automatic fix available for ${vuln.name}. Review and update manually.`,
          {
            fixable: isFixable,
            suggestion: {
              type: 'refactor' as const,
              text: isFixable ? 'pnpm audit --fix' : `pnpm update ${vuln.name}`,
              confidence: isFixable ? 0.9 : 0.5,
              reason: isFixable
                ? 'pnpm audit --fix can resolve this automatically'
                : 'Manual review and update required',
            },
            detail: {
              module: vuln.name,
              range: vuln.range,
              fixAvailable: vuln.fixAvailable,
              auditTool: 'pnpm',
            },
          }
        )
      )
    }
  }

  return diagnostics
}

// ── pip audit ───────────────────────────────────────────

interface PipAuditVulnerability {
  id: string
  description: string
  fixed_versions?: string[]
  aliases?: string[]
}

interface PipAuditDependency {
  package: string
  version: string
  vulns: Array<{
    vuln: PipAuditVulnerability
    fix_versions: string[]
  }>
}

interface PipAuditOutput {
  dependencies?: PipAuditDependency[]
  vulnerabilities?: Array<{
    name?: string
    version?: string
    id?: string
    description?: string
    fixed_versions?: string[]
  }>
}

export function pipAudit(rootDir: string, timeout: number): Diagnostic[] {
  if (!existsSync(join(rootDir, 'requirements.txt')) &&
      !existsSync(join(rootDir, 'Pipfile')) &&
      !existsSync(join(rootDir, 'pyproject.toml'))) {
    return []
  }

  const result = runWithTimeout('pip-audit --format=json', rootDir, timeout)
  if (result.timedOut) {
    return [
      makeAuditDiagnostic(
        'security-deep/dependency-vulnerability',
        'warning',
        'pip-audit timed out',
        'Increase security.auditTimeout or check network connectivity.'
      ),
    ]
  }

  if (result.status !== 0 && !result.stdout.trim()) {
    return []
  }

  let parsed: PipAuditOutput
  try {
    parsed = JSON.parse(result.stdout)
  } catch {
    return []
  }

  const diagnostics: Diagnostic[] = []

  // pip-audit 0.2+ format with dependencies array
  if (parsed.dependencies) {
    for (const dep of parsed.dependencies) {
      for (const v of dep.vulns) {
        const fixVersions = v.fix_versions?.join(', ') ?? v.vuln.fixed_versions?.join(', ')
        const hasFix = (v.fix_versions?.length ?? 0) > 0 || (v.vuln.fixed_versions?.length ?? 0) > 0
        diagnostics.push(
          makeAuditDiagnostic(
            'security-deep/dependency-vulnerability',
            'error',
            `Vulnerability in ${dep.package}@${dep.version}: ${v.vuln.id} - ${v.vuln.description}`,
            hasFix
              ? `Update ${dep.package} to ${fixVersions || 'a patched version'}.`
              : `No patched version available for ${dep.package}. Review and mitigate manually.`,
            {
              fixable: hasFix,
              suggestion: {
                type: 'refactor' as const,
                text: `pip install --upgrade ${dep.package}`,
                confidence: hasFix ? 0.85 : 0.3,
                reason: hasFix
                  ? `Fix available in version(s): ${fixVersions}`
                  : 'No known fix — review and apply mitigations',
              },
              detail: {
                module: dep.package,
                version: dep.version,
                vulnId: v.vuln.id,
                aliases: v.vuln.aliases,
                fixVersions: v.fix_versions ?? v.vuln.fixed_versions,
                auditTool: 'pip-audit',
              },
            }
          )
        )
      }
    }
  }

  // Fallback: flat vulnerabilities array
  if (parsed.vulnerabilities) {
    for (const vuln of parsed.vulnerabilities) {
      const hasFix = (vuln.fixed_versions?.length ?? 0) > 0
      const pkgName = vuln.name ?? 'unknown'
      const pkgVer = vuln.version ?? 'unknown'
      diagnostics.push(
        makeAuditDiagnostic(
          'security-deep/dependency-vulnerability',
          'error',
          `Vulnerability in ${pkgName}@${pkgVer}: ${vuln.id ?? 'unknown'} - ${vuln.description ?? 'no description'}`,
          hasFix
            ? `Update ${pkgName} to ${vuln.fixed_versions?.join(', ') ?? 'a patched version'}.`
            : `No patched version available for ${pkgName}. Review and mitigate manually.`,
          {
            fixable: hasFix,
            suggestion: {
              type: 'refactor' as const,
              text: `pip install --upgrade ${pkgName}`,
              confidence: hasFix ? 0.85 : 0.3,
              reason: hasFix
                ? `Fix available in version(s): ${vuln.fixed_versions?.join(', ')}`
                : 'No known fix — review and apply mitigations',
            },
            detail: {
              module: pkgName,
              version: pkgVer,
              vulnId: vuln.id,
              fixVersions: vuln.fixed_versions,
              auditTool: 'pip-audit',
            },
          }
        )
      )
    }
  }

  return diagnostics
}

// ── govulncheck ─────────────────────────────────────────

interface GoVulnFinding {
  osv?: string
  fixed?: string
  trace?: Array<{
    module?: string
    version?: string
    package?: string
    function?: string
  }>
}

export function goVulnCheck(rootDir: string, timeout: number): Diagnostic[] {
  if (!existsSync(join(rootDir, 'go.mod'))) {
    return []
  }

  const result = runWithTimeout('govulncheck -json ./...', rootDir, timeout)
  if (result.timedOut) {
    return [
      makeAuditDiagnostic(
        'security-deep/dependency-vulnerability',
        'warning',
        'govulncheck timed out',
        'Increase security.auditTimeout or check network connectivity.'
      ),
    ]
  }

  if (!result.stdout.trim()) {
    return []
  }

  const diagnostics: Diagnostic[] = []

  // govulncheck JSON is newline-delimited JSON
  for (const line of result.stdout.split('\n')) {
    if (!line.trim()) continue
    let entry: Record<string, unknown>
    try {
      entry = JSON.parse(line)
    } catch {
      continue
    }

    // Only process "finding" entries
    if (entry.finding) {
      const finding = entry.finding as GoVulnFinding
      const module = finding.trace?.[0]?.module ?? 'unknown'
      const version = finding.trace?.[0]?.version ?? 'unknown'
      const hasFix = !!finding.fixed
      diagnostics.push(
        makeAuditDiagnostic(
          'security-deep/dependency-vulnerability',
          'error',
          `Vulnerability in ${module}@${version}: ${finding.osv ?? 'unknown OSV'}`,
          hasFix
            ? `Update ${module} to ${finding.fixed}.`
            : `No patched version available for ${module}. Review and mitigate manually.`,
          {
            fixable: hasFix,
            suggestion: {
              type: 'refactor' as const,
              text: `go get ${module}@${finding.fixed ?? 'latest'}`,
              confidence: hasFix ? 0.85 : 0.3,
              reason: hasFix
                ? `Fix available in version: ${finding.fixed}`
                : 'No known fix — review and apply mitigations',
            },
            detail: {
              module,
              version,
              osv: finding.osv,
              fixed: finding.fixed,
              auditTool: 'govulncheck',
            },
          }
        )
      )
    }
  }

  return diagnostics
}

// ── cargo audit ─────────────────────────────────────────

interface CargoAuditVulnerability {
  advisory: {
    id: string
    title: string
    severity?: string
    url: string
    patched_versions?: string
  }
  versions: {
    patched?: string[]
    unaffected?: string[]
  }
  package: string
}

interface CargoAuditOutput {
  vulnerabilities?: {
    list?: CargoAuditVulnerability[]
  }
}

export function cargoAudit(rootDir: string, timeout: number): Diagnostic[] {
  if (!existsSync(join(rootDir, 'Cargo.lock'))) {
    return []
  }

  const result = runWithTimeout('cargo audit --json', rootDir, timeout)
  if (result.timedOut) {
    return [
      makeAuditDiagnostic(
        'security-deep/dependency-vulnerability',
        'warning',
        'cargo audit timed out',
        'Increase security.auditTimeout or check network connectivity.'
      ),
    ]
  }

  if (result.status !== 0 && !result.stdout.trim()) {
    return []
  }

  let parsed: CargoAuditOutput
  try {
    parsed = JSON.parse(result.stdout)
  } catch {
    return []
  }

  const diagnostics: Diagnostic[] = []

  if (parsed.vulnerabilities?.list) {
    for (const vuln of parsed.vulnerabilities.list) {
      const hasFix = (vuln.versions.patched?.length ?? 0) > 0
      const severity = vuln.advisory.severity?.toLowerCase() ?? 'high'
      const mappedSeverity: Severity = severity === 'low' ? 'warning' : 'error'
      diagnostics.push(
        makeAuditDiagnostic(
          'security-deep/dependency-vulnerability',
          mappedSeverity,
          `Vulnerability in ${vuln.package}: ${vuln.advisory.id} - ${vuln.advisory.title}`,
          hasFix
            ? `Update ${vuln.package} to ${vuln.versions.patched?.join(', ') ?? 'a patched version'}. ${vuln.advisory.url}`
            : `No patched version available for ${vuln.package}. ${vuln.advisory.url}`,
          {
            fixable: hasFix,
            suggestion: {
              type: 'refactor' as const,
              text: `cargo update -p ${vuln.package}`,
              confidence: hasFix ? 0.85 : 0.3,
              reason: hasFix
                ? `Fix available in version(s): ${vuln.versions.patched?.join(', ')}`
                : 'No known fix — review and apply mitigations',
            },
            detail: {
              module: vuln.package,
              advisoryId: vuln.advisory.id,
              title: vuln.advisory.title,
              patchedVersions: vuln.versions.patched,
              url: vuln.advisory.url,
              auditTool: 'cargo-audit',
            },
          }
        )
      )
    }
  }

  return diagnostics
}
