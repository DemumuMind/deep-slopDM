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

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { runSentinel, formatSentinelResults, type SentinelCheckResult } from './sentinel.js'

const TMP = join(process.cwd(), '.test-sentinel-tmp')

function setupDir() {
  mkdirSync(TMP, { recursive: true })
}

function teardown() {
  if (existsSync(TMP)) rmSync(TMP, { recursive: true, force: true })
}

function writeGeminiConfig(rootDir: string, config: Record<string, unknown>) {
  const dir = join(rootDir, '.gemini')
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'config.json'), JSON.stringify(config, null, 2) + '\n', 'utf-8')
}

function writeClinerules(rootDir: string, content: string) {
  writeFileSync(join(rootDir, '.clinerules'), content, 'utf-8')
}

function writeCursorRule(rootDir: string, content: string) {
  const dir = join(rootDir, '.cursor', 'rules')
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'deep-slop-quality.mdc'), content, 'utf-8')
}

describe('runSentinel', () => {
  beforeEach(() => { teardown(); setupDir() })
  afterEach(() => teardown())

  it('reports missing config for all providers when nothing is installed', () => {
    const results = runSentinel({
      autoRepair: false,
      checkCommand: false,
      rootDir: TMP,
    })

    expect(results.length).toBe(4)
    for (const r of results) {
      expect(r.healthy).toBe(false)
      expect(r.issues.length).toBeGreaterThan(0)
    }
  })

  it('checks only specified providers', () => {
    const results = runSentinel({
      providers: ['gemini', 'cline'],
      autoRepair: false,
      checkCommand: false,
      rootDir: TMP,
    })

    expect(results.length).toBe(2)
    const providerNames = results.map((r) => r.provider)
    expect(providerNames).toContain('gemini')
    expect(providerNames).toContain('cline')
    expect(providerNames).not.toContain('claude')
    expect(providerNames).not.toContain('cursor')
  })

  it('detects healthy gemini hook', () => {
    writeGeminiConfig(TMP, {
      postEditCommand: 'deep-slop scan --staged --exclude node_modules dist',
    })

    const results = runSentinel({
      providers: ['gemini'],
      autoRepair: false,
      checkCommand: false,
      rootDir: TMP,
    })

    expect(results.length).toBe(1)
    expect(results[0].provider).toBe('gemini')
    expect(results[0].healthy).toBe(true)
    expect(results[0].issues).toEqual([])
  })

  it('detects command drift in gemini hook', () => {
    writeGeminiConfig(TMP, {
      postEditCommand: 'some-other-linter --check',
    })

    const results = runSentinel({
      providers: ['gemini'],
      autoRepair: false,
      checkCommand: false,
      rootDir: TMP,
    })

    expect(results[0].healthy).toBe(false)
    const drift = results[0].issues.find((i) => i.type === 'command-drift')
    expect(drift).toBeDefined()
    expect(drift?.message).toContain('does not reference deep-slop')
  })

  it('detects corrupted gemini config', () => {
    const dir = join(TMP, '.gemini')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'config.json'), '{invalid json', 'utf-8')

    const results = runSentinel({
      providers: ['gemini'],
      autoRepair: false,
      checkCommand: false,
      rootDir: TMP,
    })

    expect(results[0].healthy).toBe(false)
    const corrupted = results[0].issues.find((i) => i.type === 'corrupted-config')
    expect(corrupted).toBeDefined()
  })

  it('detects healthy cline hook', () => {
    writeClinerules(TMP, '# deep-slop quality check\nAfter editing files, run: deep-slop scan --staged --exclude node_modules dist\n')

    const results = runSentinel({
      providers: ['cline'],
      autoRepair: false,
      checkCommand: false,
      rootDir: TMP,
    })

    expect(results[0].healthy).toBe(true)
  })

  it('detects deep-sleep autocorrect in cline rules', () => {
    writeClinerules(TMP, '# deep-sleep quality check\nRun: deep-sleep scan\n')

    const results = runSentinel({
      providers: ['cline'],
      autoRepair: false,
      checkCommand: false,
      rootDir: TMP,
    })

    const typo = results[0].issues.find((i) => i.message.includes('deep-sleep'))
    expect(typo).toBeDefined()
    expect(typo?.type).toBe('command-drift')
  })

  it('detects healthy cursor hook', () => {
    writeCursorRule(TMP, '---\ndescription: deep-slop quality gate\n---\nAlways run deep-slop scan after editing files.\n')

    const results = runSentinel({
      providers: ['cursor'],
      autoRepair: false,
      checkCommand: false,
      rootDir: TMP,
    })

    expect(results[0].healthy).toBe(true)
  })

  it('detects truncated cursor rule', () => {
    writeCursorRule(TMP, '---')

    const results = runSentinel({
      providers: ['cursor'],
      autoRepair: false,
      checkCommand: false,
      rootDir: TMP,
    })

    const truncated = results[0].issues.find((i) => i.type === 'corrupted-config')
    expect(truncated).toBeDefined()
  })
})

describe('formatSentinelResults', () => {
  it('formats healthy results', () => {
    const results: SentinelCheckResult[] = [
      { provider: 'gemini', healthy: true, issues: [], repaired: false },
    ]
    const output = formatSentinelResults(results)
    expect(output).toContain('gemini')
    expect(output).toContain('healthy')
  })

  it('formats results with issues', () => {
    const results: SentinelCheckResult[] = [
      {
        provider: 'claude',
        healthy: false,
        issues: [
          { type: 'missing-config', message: 'No config found', severity: 'warning', repaired: false },
        ],
        repaired: false,
      },
    ]
    const output = formatSentinelResults(results)
    expect(output).toContain('claude')
    expect(output).toContain('issues found')
    expect(output).toContain('No config found')
  })

  it('shows repaired tag when issues were repaired', () => {
    const results: SentinelCheckResult[] = [
      {
        provider: 'claude',
        healthy: false,
        issues: [
          { type: 'missing-config', message: 'No config found', severity: 'warning', repaired: true },
        ],
        repaired: true,
      },
    ]
    const output = formatSentinelResults(results)
    expect(output).toContain('repaired')
  })

  it('shows summary counts', () => {
    const results: SentinelCheckResult[] = [
      { provider: 'gemini', healthy: true, issues: [], repaired: false },
      { provider: 'cline', healthy: true, issues: [], repaired: false },
    ]
    const output = formatSentinelResults(results)
    expect(output).toContain('2/2 hooks healthy')
    expect(output).toContain('0 issue(s)')
  })
})

// deep-slop-ignore-end perf-hints/n-plus-one
// deep-slop-ignore-end arch-constraints/deep-nesting
// deep-slop-ignore-end import-intelligence/unused-symbol
// deep-slop-ignore-end dead-flow/unused-variable
// deep-slop-ignore-end ast-slop/as-any
// deep-slop-ignore-end ast-slop/swallowed-exception
// deep-slop-ignore-end ast-slop/console-leftoffer
// deep-slop-ignore-end ast-slop/decorative-comment
// deep-slop-ignore-end ast-slop/trivial-comment
// deep-slop-ignore-end ast-slop/narrative-comment
// deep-slop-ignore-end ast-slop/copy-paste-signature
