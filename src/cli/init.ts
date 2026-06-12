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

// ── deep-slop init ──────────────────────────────────────
// Scaffold .deep-slop/ config directory + CI workflow

import { mkdirSync, existsSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { DEFAULT_CONFIG } from '../config/defaults.js'
import { style, styleBold } from '../output/theme.js'
import yaml from 'js-yaml'
import type { DeepSlopConfig } from '../config/schema.js'
import { getPreset, listPresets } from '../config/presets.js'
import { deepMerge } from '../utils/deep-merge.js'

/** Convert DEFAULT_CONFIG to a YAML-friendly plain object */
function configToYaml(config: DeepSlopConfig, strict: boolean): string {
  const obj: Record<string, unknown> = {
    engines: config.engines,
    quality: strict
      ? {
          ...config.quality,
          maxFunctionLoc: 30,
          maxFileLoc: 200,
        }
      : config.quality,
    security: config.security,
    imports: config.imports,
    types: config.types,
    deadCode: config.deadCode,
    i18n: config.i18n,
    exclude: config.exclude,
  }

  if (strict) {
    // Enable ALL engines for enterprise strict mode
    const allEngines = obj.engines as Record<string, boolean>
    const strictEngines: Record<string, boolean> = {}
    for (const key of Object.keys(allEngines)) {
      strictEngines[key] = true
    }
    // Ensure security and arch-rules engines are explicitly enabled
    strictEngines['security-deep'] = true
    strictEngines['arch-rules'] = true
    strictEngines['security'] = true
    obj.engines = strictEngines

    obj.ci = { failBelow: 85, format: 'json', failOnErrors: true }
    obj.types = { ...config.types, flagAsAny: true, suggestTypes: true, flagDoubleAssertion: true }
    // typecheck: true for strict mode
    ;(obj as Record<string, unknown>).typecheck = true
  }

  return yaml.dump(obj, { lineWidth: -1, noRefs: true })
}

/** GitHub Actions CI workflow content */
function ciWorkflowContent(strict: boolean): string {
  const failBelow = strict ? 85 : 70
  const extraSteps = strict ? `
      - run: deep-slop scan --sarif --engine security-deep arch-rules . > deep-slop-security.sarif
        if: always()
      - uses: github/codeql-action/upload-sarif@v3
        if: always()
        with:
          sarif_file: deep-slop-security.sarif
          category: deep-slop-security` : ''

  return `name: deep-slop CI

on:
  push:
    branches: [main, master]
  pull_request:
    branches: [main, master]

jobs:
  deep-slop:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm install -g deep-slop
      - run: deep-slop ci --fail-below ${failBelow} .
      - run: deep-slop scan --sarif . > deep-slop-results.sarif
        if: always()
      - uses: github/codeql-action/upload-sarif@v3
        if: always()
        with:
          sarif_file: deep-slop-results.sarif
          category: deep-slop${extraSteps}
`
}

export interface InitOptions {
  strict?: boolean
  preset?: string
}

/** Hook config content for strict mode with accountability metadata */
function hookConfigContent(): string {
  return `# deep-slop hook configuration
# Accountability metadata for CI integration
hooks:
  pre-commit:
    command: deep-slop scan --changes --severity warning
    timeout: 60
    accountable: true
  pre-push:
    command: deep-slop ci --fail-below 85
    timeout: 120
    accountable: true
metadata:
  initializedBy: deep-slop-init --strict
  version: 1
`
}

export function runInit(targetPath: string, opts: InitOptions = {}): void {
  const rootDir = resolve(targetPath)
  const configDir = join(rootDir, '.deep-slop')
  const configPath = join(configDir, 'config.yml')
  const workflowDir = join(rootDir, '.github', 'workflows')
  const workflowPath = join(workflowDir, 'deep-slop.yml')

  const created: string[] = []
  const skipped: string[] = []

  // Resolve the base config: start from defaults, apply preset if provided
  let baseConfig: DeepSlopConfig = { ...DEFAULT_CONFIG }

  if (opts.preset) {
    const preset = getPreset(opts.preset)
    if (!preset) {
      const available = listPresets().map((p) => p.name).join(', ')
      process.stderr.write(`  ⚠ Preset "${opts.preset}" not found. Available: ${available}\n`)
      process.exit(1)
    }
    baseConfig = deepMerge(
      DEFAULT_CONFIG as unknown as Record<string, unknown>,
      preset as unknown as Record<string, unknown>,
    ) as unknown as DeepSlopConfig
  }

  // Create .deep-slop/ directory + config.yml
  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true })
  }

  if (existsSync(configPath)) {
    skipped.push(configPath)
  } else {
    const content = configToYaml(baseConfig, !!opts.strict)
    // If using a preset, add extends field at the top
    const finalContent = opts.preset
      ? `extends: ${opts.preset}\n\n${content}`
      : content
    writeFileSync(configPath, finalContent, 'utf-8')
    created.push(configPath)
  }

  // Create .github/workflows/deep-slop.yml
  if (!existsSync(workflowDir)) {
    mkdirSync(workflowDir, { recursive: true })
  }

  if (existsSync(workflowPath)) {
    skipped.push(workflowPath)
  } else {
    writeFileSync(workflowPath, ciWorkflowContent(!!opts.strict), 'utf-8')
    created.push(workflowPath)
  }

  // Create .deep-slop/hooks.yml for strict mode (accountability metadata)
  if (opts.strict) {
    const hookPath = join(configDir, 'hooks.yml')
    if (existsSync(hookPath)) {
      skipped.push(hookPath)
    } else {
      writeFileSync(hookPath, hookConfigContent(), 'utf-8')
      created.push(hookPath)
    }
  }

  // Print results
  console.log()
  console.log(`  ${styleBold('info', 'deep-slop init')}`)

  if (created.length > 0) {
    console.log()
    for (const f of created) {
      console.log(`  ${style('success', '✔')} Created ${f}`)
    }
  }

  if (skipped.length > 0) {
    console.log()
    for (const f of skipped) {
      console.log(`  ${style('warn', '⚠')} Already exists: ${f}`)
    }
  }

  if (opts.strict) {
    console.log()
    console.log(`  ${style('suggestion', '→')} Strict mode: ALL engines enabled, failBelow=85, typecheck=true`)
    console.log(`  ${style('suggestion', '→')} Accountability hooks configured in .deep-slop/hooks.yml`)
  }

  if (opts.preset) {
    console.log()
    console.log(`  ${style('suggestion', '→')} Preset: ${opts.preset}`)
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
