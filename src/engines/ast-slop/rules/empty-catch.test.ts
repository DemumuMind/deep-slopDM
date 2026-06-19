import { describe, it, expect } from 'vitest'
import { detectEmptyCatch } from './empty-catch.js'

const FILE = 'src/app.ts'

describe('ast-slop/empty-catch', () => {
  it('detects an empty single-line catch block', () => {
    const lines = [
      { num: 1, text: 'try {' },
      { num: 2, text: '  risky()' },
      { num: 3, text: '} catch {}' },
    ]
    const diagnostics = detectEmptyCatch(lines, FILE, 'typescript')
    expect(diagnostics).toHaveLength(1)
    expect(diagnostics[0].rule).toBe('ast-slop/swallowed-exception')
    expect(diagnostics[0].message).toContain('empty catch block')
  })

  it('detects an empty multi-line catch block', () => {
    const lines = [
      { num: 1, text: 'try {' },
      { num: 2, text: '  risky()' },
      { num: 3, text: '} catch (error) {' },
      { num: 4, text: '  // nothing' },
      { num: 5, text: '}' },
    ]
    const diagnostics = detectEmptyCatch(lines, FILE, 'typescript')
    expect(diagnostics).toHaveLength(1)
    expect(diagnostics[0].rule).toBe('ast-slop/swallowed-exception')
  })

  it('does not flag a catch block with handling', () => {
    const lines = [
      { num: 1, text: 'try {' },
      { num: 2, text: '  risky()' },
      { num: 3, text: '} catch (error) {' },
      { num: 4, text: '  console.error(error)' },
      { num: 5, text: '}' },
    ]
    const diagnostics = detectEmptyCatch(lines, FILE, 'typescript')
    expect(diagnostics).toHaveLength(0)
  })

  it('detects a swallowed python exception', () => {
    const lines = [
      { num: 1, text: 'try:' },
      { num: 2, text: '    risky()' },
      { num: 3, text: 'except Exception:' },
      { num: 4, text: '    pass' },
    ]
    const diagnostics = detectEmptyCatch(lines, FILE, 'python')
    expect(diagnostics).toHaveLength(1)
    expect(diagnostics[0].rule).toBe('ast-slop/swallowed-exception')
  })
})
