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
import { auditDependencies, type DepAuditResult } from './dep-audit.js'

const TMP = join(process.cwd(), '.test-dep-audit-tmp')

function setupProject(pkg: Record<string, unknown>, extraFiles?: Record<string, string>) {
  mkdirSync(TMP, { recursive: true })
  writeFileSync(join(TMP, 'package.json'), JSON.stringify(pkg, null, 2) + '\n', 'utf-8')
  if (extraFiles) {
    for (const [name, content] of Object.entries(extraFiles)) {
      const dir = join(TMP, name)
      mkdirSync(join(TMP, name.split('/').slice(0, -1).join('/')), { recursive: true })
      writeFileSync(dir, content, 'utf-8')
    }
  }
}

function teardown() {
  if (existsSync(TMP)) rmSync(TMP, { recursive: true, force: true })
}

describe('auditDependencies', () => {
  beforeEach(() => teardown())
  afterEach(() => teardown())

  it('returns empty result when no package.json exists', () => {
    mkdirSync(TMP, { recursive: true })
    const result = auditDependencies({ rootDir: TMP, checkOutdated: false, checkUnused: false, timeout: 5000 })
    expect(result.diagnostics).toEqual([])
    expect(result.totalDeps).toBe(0)
    expect(result.issuesFound).toBe(0)
  })

  it('reports missing lockfile', () => {
    setupProject({ name: 'test', version: '1.0.0', dependencies: { lodash: '^4.17.21' } })
    const result = auditDependencies({ rootDir: TMP, checkOutdated: false, checkUnused: false, timeout: 5000 })
    expect(result.issuesFound).toBeGreaterThan(0)
    const lockIssue = result.diagnostics.find((d) => d.rule.includes('missing-lockfile'))
    expect(lockIssue).toBeDefined()
    expect(lockIssue?.severity).toBe('error')
  })

  it('reports unpinned dependencies', () => {
    setupProject(
      { name: 'test', version: '1.0.0', dependencies: { lodash: '^4.17.21' } },
      { 'package-lock.json': '{}' },
    )
    const result = auditDependencies({ rootDir: TMP, checkOutdated: false, checkUnused: false, timeout: 5000 })
    const unpinned = result.diagnostics.find((d) => d.rule.includes('unpinned-dependency'))
    expect(unpinned).toBeDefined()
    expect(unpinned?.severity).toBe('warning')
  })

  it('does not report pinned dependencies as unpinned', () => {
    setupProject(
      { name: 'test', version: '1.0.0', dependencies: { lodash: '4.17.21' } },
      { 'package-lock.json': '{}' },
    )
    const result = auditDependencies({ rootDir: TMP, checkOutdated: false, checkUnused: false, timeout: 5000 })
    const unpinned = result.diagnostics.find((d) => d.rule.includes('unpinned-dependency'))
    expect(unpinned).toBeUndefined()
  })

  it('reports deprecated packages', () => {
    setupProject(
      { name: 'test', version: '1.0.0', dependencies: { request: '^2.88.0', node_sass: '^7.0.0' }, devDependencies: { 'babel-eslint': '^10.1.0' } },
      { 'package-lock.json': '{}' },
    )
    const result = auditDependencies({ rootDir: TMP, checkOutdated: false, checkUnused: false, timeout: 5000 })
    const deprecated = result.diagnostics.filter((d) => d.rule.includes('deprecated-package'))
    expect(deprecated.length).toBeGreaterThanOrEqual(2)
  })

  it('reports missing engines field', () => {
    setupProject(
      { name: 'test', version: '1.0.0', dependencies: {} },
      { 'package-lock.json': '{}' },
    )
    const result = auditDependencies({ rootDir: TMP, checkOutdated: false, checkUnused: false, timeout: 5000 })
    const engines = result.diagnostics.find((d) => d.rule.includes('missing-engines'))
    expect(engines).toBeDefined()
    expect(engines?.severity).toBe('info')
  })

  it('does not report missing engines when present', () => {
    setupProject(
      { name: 'test', version: '1.0.0', dependencies: {}, engines: { node: '>=20' } },
      { 'package-lock.json': '{}' },
    )
    const result = auditDependencies({ rootDir: TMP, checkOutdated: false, checkUnused: false, timeout: 5000 })
    const engines = result.diagnostics.find((d) => d.rule.includes('missing-engines'))
    expect(engines).toBeUndefined()
  })

  it('reports cross-listed dependencies', () => {
    setupProject(
      { name: 'test', version: '1.0.0', dependencies: { lodash: '4.17.21' }, devDependencies: { lodash: '4.17.21' } },
      { 'package-lock.json': '{}' },
    )
    const result = auditDependencies({ rootDir: TMP, checkOutdated: false, checkUnused: false, timeout: 5000 })
    const cross = result.diagnostics.find((d) => d.rule.includes('cross-listed-dependency'))
    expect(cross).toBeDefined()
    expect(cross?.severity).toBe('warning')
  })

  it('counts total deps correctly', () => {
    setupProject(
      { name: 'test', version: '1.0.0', dependencies: { a: '1.0.0', b: '2.0.0' }, devDependencies: { c: '3.0.0' } },
      { 'package-lock.json': '{}' },
    )
    const result = auditDependencies({ rootDir: TMP, checkOutdated: false, checkUnused: false, timeout: 5000 })
    expect(result.totalDeps).toBe(3)
  })

  it('groups issues by category in byCategory', () => {
    setupProject({ name: 'test', version: '1.0.0', dependencies: { request: '^2.88.0' } })
    const result = auditDependencies({ rootDir: TMP, checkOutdated: false, checkUnused: false, timeout: 5000 })
    expect(Object.keys(result.byCategory).length).toBeGreaterThan(0)
  })

  it('produces diagnostics with correct engine field', () => {
    setupProject({ name: 'test', version: '1.0.0', dependencies: {} })
    const result = auditDependencies({ rootDir: TMP, checkOutdated: false, checkUnused: false, timeout: 5000 })
    for (const d of result.diagnostics) {
      expect(d.engine).toBe('security-deep')
      expect(d.category).toBe('security')
      expect(d.filePath).toBe('package.json')
    }
  })
})

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
