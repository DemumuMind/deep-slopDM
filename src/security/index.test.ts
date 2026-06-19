import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { runSecurityAudits } from './index.js'
import * as providers from './providers.js'

vi.mock('./providers.js', () => ({
  npmAudit: vi.fn(() => []),
  pnpmAudit: vi.fn(() => []),
  pipAudit: vi.fn(() => []),
  goVulnCheck: vi.fn(() => []),
  cargoAudit: vi.fn(() => []),
}))

const baseTmp = join(tmpdir(), 'deep-slop-security-' + process.pid)

describe('security/index', () => {
  let root: string

  beforeEach(() => {
    root = mkdtempSync(baseTmp)
    vi.clearAllMocks()
  })

  afterEach(() => {
    try { rmSync(root, { recursive: true, force: true }) } catch {}
  })

  it('dispatches to pnpmAudit when pnpm-lock.yaml exists and typescript is detected', () => {
    writeFileSync(join(root, 'pnpm-lock.yaml'), '')
    const result = runSecurityAudits(root, ['typescript'], 5000)
    expect(providers.pnpmAudit).toHaveBeenCalledWith(root, 5000)
    expect(providers.npmAudit).not.toHaveBeenCalled()
    expect(result).toEqual([])
  })

  it('falls back to npmAudit when pnpm-lock.yaml is missing', () => {
    writeFileSync(join(root, 'package-lock.json'), '')
    runSecurityAudits(root, ['typescript'], 5000)
    expect(providers.npmAudit).toHaveBeenCalledWith(root, 5000)
    expect(providers.pnpmAudit).not.toHaveBeenCalled()
  })

  it('runs pipAudit for python projects', () => {
    writeFileSync(join(root, 'requirements.txt'), '')
    runSecurityAudits(root, ['python'], 5000)
    expect(providers.pipAudit).toHaveBeenCalledWith(root, 5000)
  })

  it('runs goVulnCheck for go projects', () => {
    writeFileSync(join(root, 'go.mod'), '')
    runSecurityAudits(root, ['go'], 5000)
    expect(providers.goVulnCheck).toHaveBeenCalledWith(root, 5000)
  })

  it('runs cargoAudit for rust projects', () => {
    writeFileSync(join(root, 'Cargo.lock'), '')
    runSecurityAudits(root, ['rust'], 5000)
    expect(providers.cargoAudit).toHaveBeenCalledWith(root, 5000)
  })

  it('returns empty diagnostics when no languages match', () => {
    const result = runSecurityAudits(root, [], 5000)
    expect(result).toEqual([])
    expect(providers.npmAudit).not.toHaveBeenCalled()
    expect(providers.pnpmAudit).not.toHaveBeenCalled()
    expect(providers.pipAudit).not.toHaveBeenCalled()
    expect(providers.goVulnCheck).not.toHaveBeenCalled()
    expect(providers.cargoAudit).not.toHaveBeenCalled()
  })
})
