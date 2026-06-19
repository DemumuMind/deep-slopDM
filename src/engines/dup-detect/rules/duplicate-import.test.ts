import { describe, it, expect } from 'vitest'
import { detectDuplicateImports } from './duplicate-import.js'

const ROOT = '/project'

describe('dup-detect/duplicate-import', () => {
  it('detects a module imported across many files with common symbols', () => {
    const imports = []
    for (let i = 0; i < 15; i++) {
      imports.push({
        filePath: `/project/src/file${i}.ts`,
        line: 1,
        source: 'some-lib',
        symbols: ['alpha', 'beta', 'gamma', 'delta', 'epsilon'],
      })
    }
    const diagnostics = detectDuplicateImports(imports, ROOT)
    expect(diagnostics).toHaveLength(1)
    expect(diagnostics[0].rule).toBe('dup-detect/duplicate-import-across-files')
    expect(diagnostics[0].message).toContain('some-lib')
    expect(diagnostics[0].message).toContain('15 files')
  })

  it('ignores excluded sources like node: built-ins', () => {
    const imports = []
    for (let i = 0; i < 15; i++) {
      imports.push({
        filePath: `/project/src/file${i}.ts`,
        line: 1,
        source: 'node:path',
        symbols: ['join'],
      })
    }
    const diagnostics = detectDuplicateImports(imports, ROOT)
    expect(diagnostics).toHaveLength(0)
  })

  it('ignores modules imported in fewer than 15 files', () => {
    const imports = []
    for (let i = 0; i < 5; i++) {
      imports.push({
        filePath: `/project/src/file${i}.ts`,
        line: 1,
        source: 'some-lib',
        symbols: ['alpha', 'beta'],
      })
    }
    const diagnostics = detectDuplicateImports(imports, ROOT)
    expect(diagnostics).toHaveLength(0)
  })

  it('ignores modules with no common symbols', () => {
    const imports = []
    for (let i = 0; i < 15; i++) {
      imports.push({
        filePath: `/project/src/file${i}.ts`,
        line: 1,
        source: 'some-lib',
        symbols: [`unique${i}`],
      })
    }
    const diagnostics = detectDuplicateImports(imports, ROOT)
    expect(diagnostics).toHaveLength(0)
  })
})
