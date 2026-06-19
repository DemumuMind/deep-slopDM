import { describe, it, expect } from 'vitest'
import { detectUnreachableAfterIfElseReturn } from './unreachable-after-if-else-return.js'

const FILE = 'src/app.ts'

describe('dead-flow/unreachable-after-if-else-return', () => {
  it('detects unreachable code after both branches return', () => {
    const content = `function demo() {
  if (x) {
    return 'yes'
  }
  else {
    return 'no'
  }
  console.log('never')
}`
    const diagnostics = detectUnreachableAfterIfElseReturn(content, FILE)
    expect(diagnostics).toHaveLength(1)
    expect(diagnostics[0].rule).toBe('dead-flow/unreachable-after-if-else-return')
    expect(diagnostics[0].line).toBe(8)
  })

  it('detects unreachable code after both branches throw', () => {
    const content = `function demo() {
  if (x) {
    throw new Error('yes')
  }
  else {
    throw new Error('no')
  }
  console.log('never')
}`
    const diagnostics = detectUnreachableAfterIfElseReturn(content, FILE)
    expect(diagnostics).toHaveLength(1)
    expect(diagnostics[0].rule).toBe('dead-flow/unreachable-after-if-else-return')
  })

  it('does not flag when only one branch terminates', () => {
    const content = `function demo() {
  if (x) {
    return 'yes'
  }
  else {
    console.log('no')
  }
  console.log('reachable')
}`
    const diagnostics = detectUnreachableAfterIfElseReturn(content, FILE)
    expect(diagnostics).toHaveLength(0)
  })

  it('does not flag when no else block exists', () => {
    const content = `function demo() {
  if (x) {
    return 'yes'
  }
  console.log('maybe reachable')
}`
    const diagnostics = detectUnreachableAfterIfElseReturn(content, FILE)
    expect(diagnostics).toHaveLength(0)
  })
})
