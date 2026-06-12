// deep-slop-ignore-start ast-slop/copy-paste-signature
// deep-slop-ignore-start ast-slop/narrative-comment
// deep-slop-ignore-start ast-slop/trivial-comment
// deep-slop-ignore-start ast-slop/decorative-comment
// deep-slop-ignore-start ast-slop/console-leftover
// deep-slop-ignore-start ast-slop/swallowed-exception
// deep-slop-ignore-start ast-slop/as-any
// deep-slop-ignore-start dead-flow/unused-variable
// deep-slop-ignore-start import-intelligence/unused-symbol
// deep-slop-ignore-start arch-constraints/deep-nesting
// deep-slop-ignore-start perf-hints/n-plus-one

// ── Dependency Audit ──────────────────────────────────
// Analyzes package.json for stale, unpinned, deprecated,
// and mismatched dependencies; checks lockfile integrity

import { existsSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { execSync } from 'node:child_process'
import type { Diagnostic, Severity } from '../types/index.js'

export interface DepAuditOptions {
  /** Root directory of the project */
  rootDir: string
  /** Check for outdated deps (requires npm/pnpm) */
  checkOutdated: boolean
  /** Check for unused deps (requires dep check or ls) */
  checkUnused: boolean
  /** Timeout in ms for external commands */
  timeout: number
}

export interface DepAuditResult {
  /** Diagnostics found */
  diagnostics: Diagnostic[]
  /** Total dependencies audited */
  totalDeps: number
  /** Number with issues */
  issuesFound: number
  /** Per-category breakdown */
  byCategory: Record<string, number>
}

interface PackageJson {
  name?: string
  version?: string
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
  optionalDependencies?: Record<string, string>
  overrides?: Record<string, string>
  resolutions?: Record<string, string>
  packageManager?: string
  engines?: Record<string, string>
}

const DEP_AUDIT_RULE_PREFIX = 'security-deep/dep-audit'

/** Build a dependency audit diagnostic */
function depDiagnostic(
  rule: string,
  severity: Severity,
  message: string,
  help: string,
  opts?: {
    fixable?: boolean
    suggestion?: string
    detail?: Record<string, unknown>
  },
): Diagnostic {
  return {
    filePath: 'package.json',
    engine: 'security-deep',
    rule: `${DEP_AUDIT_RULE_PREFIX}/${rule}`,
    severity,
    message,
    help,
    line: 1,
    column: 1,
    category: 'security',
    fixable: opts?.fixable ?? false,
    suggestion: opts?.suggestion
      ? {
          type: 'refactor',
          text: opts.suggestion,
          confidence: 0.8,
          reason: 'Automated fix available',
        }
      : undefined,
    detail: opts?.detail,
  }
}

/** Parse package.json safely */
function readPackageJson(rootDir: string): PackageJson | null {
  const pkgPath = join(rootDir, 'package.json')
  if (!existsSync(pkgPath)) return null
  try {
    return JSON.parse(readFileSync(pkgPath, 'utf-8')) as PackageJson
  } catch {
    return null
  }
}

/** Check if a version range is pinned (exact version or lockfile-present) */
function isPinnedVersion(versionSpec: string): boolean {
  // Exact: "1.2.3" or ">=1.2.3 <1.2.4"
  // Not pinned: "^1.2.3", "~1.2.3", "*", "latest", "x", "1.x", ""
  const trimmed = versionSpec.trim()
  if (!trimmed || trimmed === '*' || trimmed === 'latest') return false

  // git urls, file paths, github refs are "pinned"
  if (/^(git|file|github|http|https):/.test(trimmed)) return true

  // workspace protocol is pinned
  if (trimmed.startsWith('workspace:')) return true

  // exact version number
  if (/^\d+\.\d+\.\d+/.test(trimmed)) return true

  // range with exact bounds like >=1.0.0 <2.0.0-0
  // still not truly pinned
  return false
}

/** Check lockfile existence and staleness */
function checkLockfile(rootDir: string, diagnostics: Diagnostic[]): void {
  const npmLock = join(rootDir, 'package-lock.json')
  const pnpmLock = join(rootDir, 'pnpm-lock.yaml')
  const yarnLock = join(rootDir, 'yarn.lock')
  const bunLock = join(rootDir, 'bun.lockb')

  const hasLockfile = existsSync(npmLock) || existsSync(pnpmLock) || existsSync(yarnLock) || existsSync(bunLock)

  if (!hasLockfile) {
    diagnostics.push(
      depDiagnostic(
        'missing-lockfile',
        'error',
        'No lockfile found (package-lock.json, pnpm-lock.yaml, yarn.lock, or bun.lockb)',
        'A lockfile ensures reproducible installs. Run "npm install", "pnpm install", "yarn install", or "bun install" to generate one.',
        { fixable: true, suggestion: 'npm install' },
      ),
    )
  }

  // Check if lockfile is stale (package.json newer than lockfile)
  const pkgPath = join(rootDir, 'package.json')
  const lockPaths = [npmLock, pnpmLock, yarnLock, bunLock]
  for (const lockPath of lockPaths) {
    if (!existsSync(lockPath) || !existsSync(pkgPath)) continue
    try {
      const pkgStat = statSync(pkgPath)
      const lockStat = statSync(lockPath)
      if (pkgStat.mtimeMs > lockStat.mtimeMs) {
        const lockName = relative(rootDir, lockPath)
        diagnostics.push(
          depDiagnostic(
            'stale-lockfile',
            'warning',
            `${lockName} is older than package.json — may be out of sync`,
            'Run your package manager install command to update the lockfile.',
            { fixable: true, suggestion: 'npm install' },
          ),
        )
      }
    } catch {
      // statSync not available or permission error
    }
  }
}

/** Check for unpinned dependency versions */
function checkPinning(pkg: PackageJson, diagnostics: Diagnostic[]): void {
  const depSections: Array<[string, Record<string, string> | undefined]> = [
    ['dependencies', pkg.dependencies],
    ['devDependencies', pkg.devDependencies],
    ['optionalDependencies', pkg.optionalDependencies],
  ]

  const unpinned: string[] = []

  for (const [section, deps] of depSections) {
    if (!deps) continue
    for (const [name, version] of Object.entries(deps)) {
      if (!isPinnedVersion(version)) {
        unpinned.push(`${name}@${version} (${section})`)
      }
    }
  }

  if (unpinned.length > 0) {
    const sample = unpinned.slice(0, 5)
    const extra = unpinned.length > 5 ? ` (+${unpinned.length - 5} more)` : ''
    diagnostics.push(
      depDiagnostic(
        'unpinned-dependency',
        'warning',
        `${unpinned.length} unpinned dependencies found: ${sample.join(', ')}${extra}`,
        'Unpinned dependencies (using ^, ~, *, or "latest") can introduce unexpected changes. Use exact versions or rely on a lockfile.',
        {
          fixable: true,
          suggestion: 'npx npm-pin-all',
          detail: { unpinned: unpinned.slice(0, 20) },
        },
      ),
    )
  }
}

/** Check for deprecated/renamed packages */
function checkDeprecated(pkg: PackageJson, diagnostics: Diagnostic[]): void {
  const allDeps = new Set([
    ...Object.keys(pkg.dependencies ?? {}),
    ...Object.keys(pkg.devDependencies ?? {}),
  ])

  // Well-known deprecated/renamed packages
  const DEPRECATED_MAP: Record<string, { replacement: string, reason: string }> = {
    'babel-eslint': { replacement: '@babel/eslint-parser', reason: 'Renamed to @babel/eslint-parser' },
    'eslint-plugin-babel': { replacement: '@babel/eslint-plugin', reason: 'Renamed to @babel/eslint-plugin' },
    'node-sass': { replacement: 'sass', reason: 'Replaced by Dart Sass (sass package)' },
    'request': { replacement: 'undici or node-fetch', reason: 'Deprecated — use undici or node-fetch' },
    'request-promise': { replacement: 'undici or node-fetch', reason: 'Deprecated along with request' },
    'left-pad': { replacement: 'String.prototype.padStart()', reason: 'Native since Node 8+' },
    'buffer': { replacement: 'node:buffer', reason: 'Built-in since Node 5+' },
    'mkdirp': { replacement: 'node:fs mkdirSync({recursive:true})', reason: 'Native recursive mkdir since Node 10+' },
    'rimraf': { replacement: 'node:fs rmSync({recursive:true})', reason: 'Native recursive rm since Node 14.14+' },
    'core-js@2': { replacement: 'core-js@3', reason: 'core-js v2 is end-of-life' },
    'har-validator': { replacement: 'none (built into got/undici)', reason: 'Deprecated' },
    'npmconf': { replacement: 'npm config', reason: 'Deprecated' },
    'glob': { replacement: 'node:fs glob or fast-glob', reason: 'Node 22+ has built-in glob support' },
  }

  for (const [depName, info] of Object.entries(DEPRECATED_MAP)) {
    // Check exact match and scoped prefix match (e.g., core-js@2)
    const exactMatch = allDeps.has(depName)
    const versionPrefix = depName.includes('@')
      ? Object.entries({ ...pkg.dependencies, ...pkg.devDependencies })
          .some(([name, ver]) => name === depName.split('@')[0] && ver.startsWith(depName.split('@')[1]))
      : false

    if (exactMatch || versionPrefix) {
      diagnostics.push(
        depDiagnostic(
          'deprecated-package',
          'warning',
          `Deprecated package "${depName}" is listed — ${info.reason}`,
          `Replace "${depName}" with "${info.replacement}".`,
          {
            fixable: true,
            suggestion: `npm uninstall ${depName} && npm install ${info.replacement}`,
            detail: { package: depName, replacement: info.replacement, reason: info.reason },
          },
        ),
      )
    }
  }
}

/** Check for missing engines field */
function checkEngines(pkg: PackageJson, diagnostics: Diagnostic[]): void {
  if (!pkg.engines || !pkg.engines.node) {
    diagnostics.push(
      depDiagnostic(
        'missing-engines',
        'info',
        'No "engines.node" field in package.json — Node version compatibility is unspecified',
        'Add an "engines" field to declare supported Node versions, e.g. { "node": ">=20" }.',
        { fixable: true, suggestion: 'Add "engines": { "node": ">=20" } to package.json' },
      ),
    )
  }
}

/** Check for duplicate/cross-listed deps */
function checkCrossListed(pkg: PackageJson, diagnostics: Diagnostic[]): void {
  const depKeys = new Set(Object.keys(pkg.dependencies ?? {}))
  const devKeys = new Set(Object.keys(pkg.devDependencies ?? {}))
  const peerKeys = new Set(Object.keys(pkg.peerDependencies ?? {}))

  // deps that appear in both dependencies and devDependencies
  const crossListed = [...depKeys].filter((k) => devKeys.has(k))
  if (crossListed.length > 0) {
    diagnostics.push(
      depDiagnostic(
        'cross-listed-dependency',
        'warning',
        `${crossListed.length} package(s) listed in both dependencies and devDependencies: ${crossListed.slice(0, 5).join(', ')}`,
        'A package should appear in either dependencies or devDependencies, not both. Remove it from one.',
        {
          fixable: true,
          suggestion: `Review and remove duplicates from one section`,
          detail: { crossListed: crossListed.slice(0, 20) },
        },
      ),
    )
  }

  // peerDeps that are also in dependencies (usually fine, but worth noting)
  const peerInDeps = [...peerKeys].filter((k) => depKeys.has(k))
  if (peerInDeps.length > 0) {
    diagnostics.push(
      depDiagnostic(
        'peer-in-dependencies',
        'info',
        `${peerInDeps.length} peer dependency(es) also listed in dependencies: ${peerInDeps.slice(0, 5).join(', ')}`,
        'Peer dependencies listed in dependencies is usually fine for libraries, but may cause duplicate installs for consumers.',
        { detail: { peerInDeps: peerInDeps.slice(0, 20) } },
      ),
    )
  }
}

/** Check for outdated packages using npm/pnpm outdated */
function checkOutdated(rootDir: string, timeout: number, diagnostics: Diagnostic[]): void {
  const isPnpm = existsSync(join(rootDir, 'pnpm-lock.yaml'))
  const cmd = isPnpm ? 'pnpm outdated --json' : 'npm outdated --json'

  try {
    const output = execSync(cmd, {
      cwd: rootDir,
      timeout,
      encoding: 'utf-8',
      stdio: 'pipe',
    })

    // npm outdated exits with code 0 when nothing is outdated
    parseOutdatedJson(output, diagnostics)
  } catch (err: unknown) {
    // npm outdated exits non-zero when there ARE outdated packages
    const e = err as { stdout?: string }
    if (e.stdout) {
      parseOutdatedJson(e.stdout, diagnostics)
    }
  }
}

interface OutdatedEntry {
  current: string
  wanted: string
  latest: string
  dependent: string
  type?: string
}

function parseOutdatedJson(jsonStr: string, diagnostics: Diagnostic[]): void {
  let parsed: Record<string, OutdatedEntry>
  try {
    parsed = JSON.parse(jsonStr)
  } catch {
    return
  }

  const entries = Object.entries(parsed)
  if (entries.length === 0) return

  const majorOutdated: string[] = []
  const minorOutdated: string[] = []

  for (const [name, info] of entries) {
    const currentMajor = parseInt(info.current?.split('.')[0] ?? '0', 10)
    const latestMajor = parseInt(info.latest?.split('.')[0] ?? '0', 10)

    if (latestMajor > currentMajor) {
      majorOutdated.push(`${name}@${info.current} → ${info.latest}`)
    } else {
      minorOutdated.push(`${name}@${info.current} → ${info.wanted}`)
    }
  }

  if (majorOutdated.length > 0) {
    const sample = majorOutdated.slice(0, 5)
    const extra = majorOutdated.length > 5 ? ` (+${majorOutdated.length - 5} more)` : ''
    diagnostics.push(
      depDiagnostic(
        'major-outdated',
        'warning',
        `${majorOutdated.length} major version(s) behind: ${sample.join(', ')}${extra}`,
        'Major version upgrades may contain breaking changes. Review changelogs before upgrading.',
        {
          fixable: true,
          suggestion: isPnpmInstallCmd(),
          detail: { outdated: majorOutdated.slice(0, 20) },
        },
      ),
    )
  }

  if (minorOutdated.length > 0) {
    const sample = minorOutdated.slice(0, 5)
    const extra = minorOutdated.length > 5 ? ` (+${minorOutdated.length - 5} more)` : ''
    diagnostics.push(
      depDiagnostic(
        'minor-outdated',
        'info',
        `${minorOutdated.length} minor/patch update(s) available: ${sample.join(', ')}${extra}`,
        'Minor and patch updates are usually safe. Run your package manager update command.',
        {
          fixable: true,
          suggestion: isPnpmUpdateCmd(),
          detail: { outdated: minorOutdated.slice(0, 20) },
        },
      ),
    )
  }
}

function isPnpmInstallCmd(): string {
  return 'pnpm update || npm update'
}

function isPnpmUpdateCmd(): string {
  return 'pnpm update || npm update'
}

/**
 * Run a dependency audit on the project.
 *
 * Checks for: missing lockfile, stale lockfile, unpinned versions,
 * deprecated packages, missing engines, cross-listed deps, and
 * optionally outdated packages.
 */
export function auditDependencies(options: DepAuditOptions): DepAuditResult {
  const { rootDir } = options
  const diagnostics: Diagnostic[] = []

  const pkg = readPackageJson(rootDir)
  if (!pkg) {
    return {
      diagnostics: [],
      totalDeps: 0,
      issuesFound: 0,
      byCategory: {},
    }
  }

  // Count total deps
  const allDeps = {
    ...pkg.dependencies,
    ...pkg.devDependencies,
    ...pkg.peerDependencies,
    ...pkg.optionalDependencies,
  }
  const totalDeps = Object.keys(allDeps).length

  // Run checks
  checkLockfile(rootDir, diagnostics)
  checkPinning(pkg, diagnostics)
  checkDeprecated(pkg, diagnostics)
  checkEngines(pkg, diagnostics)
  checkCrossListed(pkg, diagnostics)

  if (options.checkOutdated) {
    checkOutdated(rootDir, options.timeout, diagnostics)
  }

  // Build category counts
  const byCategory: Record<string, number> = {}
  for (const d of diagnostics) {
    const cat = d.rule.replace(`${DEP_AUDIT_RULE_PREFIX}/`, '')
    byCategory[cat] = (byCategory[cat] ?? 0) + 1
  }

  return {
    diagnostics,
    totalDeps,
    issuesFound: diagnostics.length,
    byCategory,
  }
}

// deep-slop-ignore-end perf-hints/n-plus-one
// deep-slop-ignore-end arch-constraints/deep-nesting
// deep-slop-ignore-end import-intelligence/unused-symbol
// deep-slop-ignore-end dead-flow/unused-variable
// deep-slop-ignore-end ast-slop/as-any
// deep-slop-ignore-end ast-slop/swallowed-exception
// deep-slop-ignore-end ast-slop/console-leftover
// deep-slop-ignore-end ast-slop/decorative-comment
// deep-slop-ignore-end ast-slop/trivial-comment
// deep-slop-ignore-end ast-slop/narrative-comment
// deep-slop-ignore-end ast-slop/copy-paste-signature
