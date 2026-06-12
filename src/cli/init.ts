// ── deep-slop init ──────────────────────────────────────
// Scaffold .deep-slop/ config directory + CI workflow

import { mkdirSync, existsSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { DEFAULT_CONFIG } from '../config/defaults.js'
import { style, styleBold } from '../output/theme.js'
import yaml from 'js-yaml'
import type { DeepSlopConfig } from '../config/schema.js'

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
    obj.ci = { failBelow: 75 }
  }

  return yaml.dump(obj, { lineWidth: -1, noRefs: true })
}

/** GitHub Actions CI workflow content */
function ciWorkflowContent(): string {
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
      - run: deep-slop ci --fail-below 70 .
      - run: deep-slop scan --sarif . > deep-slop-results.sarif
        if: always()
      - uses: github/codeql-action/upload-sarif@v3
        if: always()
        with:
          sarif_file: deep-slop-results.sarif
          category: deep-slop
`
}

export interface InitOptions {
  strict?: boolean
}

export function runInit(targetPath: string, opts: InitOptions = {}): void {
  const rootDir = resolve(targetPath)
  const configDir = join(rootDir, '.deep-slop')
  const configPath = join(configDir, 'config.yml')
  const workflowDir = join(rootDir, '.github', 'workflows')
  const workflowPath = join(workflowDir, 'deep-slop.yml')

  const created: string[] = []
  const skipped: string[] = []

  // Create .deep-slop/ directory + config.yml
  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true })
  }

  if (existsSync(configPath)) {
    skipped.push(configPath)
  } else {
    const content = configToYaml(DEFAULT_CONFIG, !!opts.strict)
    writeFileSync(configPath, content, 'utf-8')
    created.push(configPath)
  }

  // Create .github/workflows/deep-slop.yml
  if (!existsSync(workflowDir)) {
    mkdirSync(workflowDir, { recursive: true })
  }

  if (existsSync(workflowPath)) {
    skipped.push(workflowPath)
  } else {
    writeFileSync(workflowPath, ciWorkflowContent(), 'utf-8')
    created.push(workflowPath)
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
    console.log(`  ${style('suggestion', '→')} Strict mode: maxFunctionLoc=30, maxFileLoc=200, failBelow=75`)
  }

  console.log()
}
