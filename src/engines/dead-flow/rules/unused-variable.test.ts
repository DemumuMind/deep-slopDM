import { describe, it, expect } from 'vitest'
import { detectUnusedVariable } from './unused-variable.js'

const FILE = 'src/app.ts'

describe('dead-flow/unused-variable', () => {
  it('detects an unused const variable', () => {
    const content = `const unused = 42
console.log('hello')`
    const diagnostics = detectUnusedVariable(content, FILE)
    expect(diagnostics).toHaveLength(1)
    expect(diagnostics[0].rule).toBe('dead-flow/unused-variable')
    expect(diagnostics[0].message).toContain('unused')
  })

  it('detects an unused function declaration', () => {
    const content = `function helper() {
  return 1
}
helper()`
    const diagnostics = detectUnusedVariable(content, FILE)
    expect(diagnostics).toHaveLength(0)
  })

  it('detects an unused function when not referenced', () => {
    const content = `function helper() {
  return 1
}`
    const diagnostics = detectUnusedVariable(content, FILE)
    expect(diagnostics).toHaveLength(1)
    expect(diagnostics[0].rule).toBe('dead-flow/unused-variable')
    expect(diagnostics[0].message).toContain('helper')
  })

  it('does not flag variables that are used', () => {
    const content = `const used = 42
console.log(used)`
    const diagnostics = detectUnusedVariable(content, FILE)
    expect(diagnostics).toHaveLength(0)
  })

  it('does not flag exported variables', () => {
    const content = `export const exported = 42`
    const diagnostics = detectUnusedVariable(content, FILE)
    expect(diagnostics).toHaveLength(0)
  })

  it('does not flag underscore-prefixed variables', () => {
    const content = `const _ignored = 42`
    const diagnostics = detectUnusedVariable(content, FILE)
    expect(diagnostics).toHaveLength(0)
  })
})
