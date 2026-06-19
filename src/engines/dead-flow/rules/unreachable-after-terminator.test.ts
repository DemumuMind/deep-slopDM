import { describe, it, expect } from 'vitest'
import { detectUnreachableAfterTerminator } from './unreachable-after-terminator.js'

const FILE = 'src/app.ts'

describe('dead-flow/unreachable-after-terminator', () => {
  it('detects code after a return statement', () => {
    const content = `function demo() {
  return 42;
  console.log('never')
}`
    const diagnostics = detectUnreachableAfterTerminator(content, FILE)
    expect(diagnostics).toHaveLength(1)
    expect(diagnostics[0].rule).toBe('dead-flow/unreachable-after-terminator')
    expect(diagnostics[0].message).toContain('return')
  })

  it('detects code after a throw statement', () => {
    const content = `function demo() {
  throw new Error('fail');
  console.log('never')
}`
    const diagnostics = detectUnreachableAfterTerminator(content, FILE)
    expect(diagnostics).toHaveLength(1)
    expect(diagnostics[0].rule).toBe('dead-flow/unreachable-after-terminator')
    expect(diagnostics[0].message).toContain('throw')
  })

  it('does not flag inside a callback terminator', () => {
    const content = `function demo() {
  items.forEach((item) => {
    return item;
  })
  console.log('reachable')
}`
    const diagnostics = detectUnreachableAfterTerminator(content, FILE)
    expect(diagnostics).toHaveLength(0)
  })

  it('ignores early-return guard patterns', () => {
    const content = `function demo() {
  if (!x) return;
  console.log('has x')
}`
    const diagnostics = detectUnreachableAfterTerminator(content, FILE)
    expect(diagnostics).toHaveLength(0)
  })
})
