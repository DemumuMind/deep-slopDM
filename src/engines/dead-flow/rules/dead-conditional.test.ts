import { describe, it, expect } from 'vitest'
import { detectDeadConditional } from './dead-conditional.js'

const FILE = 'src/app.ts'

describe('dead-flow/dead-conditional', () => {
  it('detects always-truthy condition', () => {
    const content = `function demo() {
  if (true) {
    return 'yes'
  } else {
    return 'no'
  }
}`
    const diagnostics = detectDeadConditional(content, FILE)
    expect(diagnostics).toHaveLength(1)
    expect(diagnostics[0].rule).toBe('dead-flow/dead-conditional')
    expect(diagnostics[0].message).toContain('`true`')
    expect(diagnostics[0].message).toContain('else-block')
  })

  it('detects always-falsy condition', () => {
    const content = `function demo() {
  if (false) {
    return 'yes'
  } else {
    return 'no'
  }
}`
    const diagnostics = detectDeadConditional(content, FILE)
    expect(diagnostics).toHaveLength(1)
    expect(diagnostics[0].rule).toBe('dead-flow/dead-conditional')
    expect(diagnostics[0].message).toContain('`false`')
    expect(diagnostics[0].message).toContain('if-block')
  })

  it('ignores complex comparisons', () => {
    const content = `function demo(x: number) {
  if (x > 0) {
    return 'yes'
  } else {
    return 'no'
  }
}`
    const diagnostics = detectDeadConditional(content, FILE)
    expect(diagnostics).toHaveLength(0)
  })

  it('ignores logical operators', () => {
    const content = `function demo(a: boolean, b: boolean) {
  if (a && b) {
    return 'yes'
  }
}`
    const diagnostics = detectDeadConditional(content, FILE)
    expect(diagnostics).toHaveLength(0)
  })
})
