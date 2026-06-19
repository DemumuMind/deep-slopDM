import { describe, it, expect } from 'vitest'
import { detectGenericNaming } from './generic-naming.js'

const FILE = 'src/app.ts'

describe('ast-slop/generic-naming', () => {
  it('detects generic variable name "temp"', () => {
    const lines = [
      { num: 1, text: 'const temp = fetchUser()' },
    ]
    const diagnostics = detectGenericNaming(lines, FILE, 'typescript')
    expect(diagnostics).toHaveLength(1)
    expect(diagnostics[0].rule).toBe('ast-slop/generic-name')
    expect(diagnostics[0].message).toContain('temp')
  })

  it('detects generic variable name "x"', () => {
    const lines = [
      { num: 1, text: 'const x = 42' },
    ]
    const diagnostics = detectGenericNaming(lines, FILE, 'typescript')
    expect(diagnostics).toHaveLength(1)
    expect(diagnostics[0].rule).toBe('ast-slop/generic-name')
    expect(diagnostics[0].message).toContain('x"')
  })

  it('does not flag descriptive names', () => {
    const lines = [
      { num: 1, text: 'const userCount = 42' },
    ]
    const diagnostics = detectGenericNaming(lines, FILE, 'typescript')
    expect(diagnostics).toHaveLength(0)
  })

  it('allows acceptable generic names in API response contexts', () => {
    const lines = [
      { num: 1, text: 'const { data: x } = await axios.get("/api")' },
    ]
    const diagnostics = detectGenericNaming(lines, FILE, 'typescript')
    expect(diagnostics).toHaveLength(0)
  })

  it('detects generic python variable names', () => {
    const lines = [
      { num: 1, text: 'foo = 42' },
    ]
    const diagnostics = detectGenericNaming(lines, FILE, 'python')
    expect(diagnostics).toHaveLength(1)
    expect(diagnostics[0].rule).toBe('ast-slop/generic-name')
  })
})
