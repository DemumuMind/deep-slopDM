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

// ── deep-slop doctor ───────────────────────────────────
// Diagnose the project environment for deep-slop compatibility

import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { execSync } from 'node:child_process'
import { loadConfig, DEFAULT_CONFIG } from '../config/index.js'
import { initParser } from '../utils/tree-sitter.js'
import { style, styleBold } from '../output/theme.js'
import type { DeepSlopConfig } from '../config/schema.js'
import type { EngineName } from '../types/index.js'

/** Engine module paths for dynamic import check */
const ENGINE_MODULES: Record<EngineName, string> = {
  'ast-slop': '../engines/ast-slop/index.js',
  'import-intelligence': '../engines/import-intelligence/index.js',
  'dead-flow': '../engines/dead-flow/index.js',
  'type-safety': '../engines/type-safety/index.js',
  'syntax-deep': '../engines/syntax-deep/index.js',
  'security-deep': '../engines/security-deep/index.js',
  'arch-constraints': '../engines/arch-constraints/index.js',
  'dup-detect': '../engines/dup-detect/index.js',
  'perf-hints': '../engines/perf-hints/index.js',
  'i18n-lint': '../engines/i18n-lint/index.js',
  'config-lint': '../engines/config-lint/index.js',
  'meta-quality': '../engines/meta-quality/index.js',
  'arch-rules': '../engines/arch-rules/index.js',
  'lint-external': '../engines/lint-external/index.js',
  'knip': '../engines/knip/index.js',
  'format-lint': '../engines/format-lint/index.js',
}

/** ESLint config file candidates */
const ESLINT_CONFIGS = [
  'eslint.config.js',
  'eslint.config.mjs',
  'eslint.config.cjs',
  '.eslintrc.js',
  '.eslintrc.json',
  '.eslintrc.yml',
  '.eslintrc',
]

/** Prettier config file candidates */
const PRETTIER_CONFIGS = [
  '.prettierrc',
  '.prettierrc.json',
  '.prettierrc.yml',
  '.prettierrc.yaml',
  '.prettierrc.js',
  '.prettierrc.cjs',
  'prettier.config.js',
  'prettier.config.cjs',
]

interface CheckResult {
  label: string
  passed: boolean
  detail?: string
}

function pass(label: string, detail?: string): CheckResult {
  return { label, passed: true, detail }
}

function fail(label: string, detail?: string): CheckResult {
  return { label, passed: false, detail }
}

/** Run a shell command and return trimmed stdout, or null on error */
function runQuiet(cmd: string): string | null {
  try {
    return execSync(cmd, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim()
  } catch {
    return null
  }
}

export async function runDoctor(targetPath: string): Promise<void> {
  const rootDir = resolve(targetPath)
  const checks: CheckResult[] = []

  console.log()
  console.log(`  ${styleBold('info', 'deep-slop doctor')}`)
  console.log(`  ${style('muted', `Checking environment: ${rootDir}`)}`)
  console.log()

  // ── 1. Node.js version ────────────────────────────────
  const nodeVersion = process.version
  const major = parseInt(nodeVersion.slice(1).split('.')[0], 10)
  if (major >= 18) {
    checks.push(pass('Node.js version', `v${major} (${nodeVersion})`))
  } else {
    checks.push(fail('Node.js version', `v${major} (${nodeVersion}) — need >=18`))
  }

  // ── 2. TypeScript installed ────────────────────────────
  const tscVersion = runQuiet('npx tsc --version') ?? runQuiet('tsc --version')
  if (tscVersion) {
    checks.push(pass('TypeScript', tscVersion))
  } else {
    checks.push(fail('TypeScript', 'tsc not found — install with: npm i -D typescript'))
  }

  // ── 3. Config file exists and is valid ────────────────
  try {
    const config = loadConfig(rootDir)
    checks.push(pass('Config file', `.deep-slop/config.yml (valid, ${Object.keys(config.engines).length} engines)`))
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    checks.push(fail('Config file', msg))
  }

  // ── 4. Enabled engines can load ────────────────────────
  let config: DeepSlopConfig
  try {
    config = loadConfig(rootDir)
  } catch {
    config = DEFAULT_CONFIG
  }

  const enabledEngines = Object.entries(config.engines)
    .filter(([, enabled]) => enabled !== false)
    .map(([name]) => name as EngineName)

  let enginesOk = 0
  let enginesFail = 0
  const failedEngines: string[] = []

  for (const name of enabledEngines) {
    const modPath = ENGINE_MODULES[name]
    if (!modPath) {
      enginesFail++
      failedEngines.push(name)
      continue
    }
    try {
      await import(/* @vite-ignore */ modPath)
      enginesOk++
    } catch {
      enginesFail++
      failedEngines.push(name)
    }
  }

  if (enginesFail === 0) {
    checks.push(pass('Engine modules', `${enginesOk}/${enabledEngines.length} loaded`))
  } else {
    checks.push(fail('Engine modules', `${enginesOk}/${enabledEngines.length} loaded — failed: ${failedEngines.join(', ')}`))
  }

  // ── 5. Tree-sitter WASM ────────────────────────────────
  const tsAvailable = await initParser()
  if (tsAvailable) {
    checks.push(pass('Tree-sitter WASM', 'initialized successfully'))
  } else {
    checks.push(fail('Tree-sitter WASM', 'not available — AST features will use regex fallback'))
  }

  // ── 6. package.json exists ─────────────────────────────
  const pkgPath = join(rootDir, 'package.json')
  if (existsSync(pkgPath)) {
    checks.push(pass('package.json', 'found'))
  } else {
    checks.push(fail('package.json', 'not found — not a Node.js project?'))
  }

  // ── 7. ESLint config exists ────────────────────────────
  const eslintFound = ESLINT_CONFIGS.some((f) => existsSync(join(rootDir, f)))
  if (eslintFound) {
    checks.push(pass('ESLint config', 'found'))
  } else {
    checks.push(fail('ESLint config', 'not found — consider adding ESLint'))
  }

  // ── 8. Prettier config exists ──────────────────────────
  const prettierFound = PRETTIER_CONFIGS.some((f) => existsSync(join(rootDir, f)))
  if (prettierFound) {
    checks.push(pass('Prettier config', 'found'))
  } else {
    checks.push(fail('Prettier config', 'not found — consider adding Prettier'))
  }

  // ── Print results ──────────────────────────────────────
  for (const check of checks) {
    const icon = check.passed ? style('success', '✔') : style('danger', '✘')
    const label = check.passed ? check.label : style('danger', check.label)
    const detail = check.detail ? style('muted', ` — ${check.detail}`) : ''
    console.log(`  ${icon}  ${label}${detail}`)
  }

  // ── Summary ────────────────────────────────────────────
  const passed = checks.filter((c) => c.passed).length
  const total = checks.length
  console.log()
  if (passed === total) {
    console.log(`  ${styleBold('success', `${passed}/${total} checks passed`)} — environment ready`)
  } else {
    console.log(`  ${styleBold('warn', `${passed}/${total} checks passed`)} — fix issues above for best results`)
  }
  console.log()
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
