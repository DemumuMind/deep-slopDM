import { describe, it, expect } from 'vitest'
import { detectTodoLeftover } from './todo-leftover.js'

const lines = [
  { num: 1, text: '// TODO: implement this later' },
  { num: 2, text: 'function stub() { return null }' },
]

describe('ast-slop/todo-leftover', () => {
  it('detects a TODO comment without a ticket', () => {
    const diagnostics = detectTodoLeftover(lines, 'src/utils/helper.ts', 'typescript')
    expect(diagnostics).toHaveLength(1)
    expect(diagnostics[0].rule).toBe('ast-slop/todo-stub')
    expect(diagnostics[0].message).toContain('TODO')
  })

  it('detects a FIXME comment', () => {
    const fixmeLines = [
      { num: 1, text: '// FIXME: this is broken' },
    ]
    const diagnostics = detectTodoLeftover(fixmeLines, 'src/utils/helper.ts', 'typescript')
    expect(diagnostics).toHaveLength(1)
    expect(diagnostics[0].rule).toBe('ast-slop/todo-stub')
    expect(diagnostics[0].detail?.tag).toBe('FIXME')
  })

  it('ignores TODO comments with a ticket reference', () => {
    const ticketLines = [
      { num: 1, text: '// TODO(#123): implement this later' },
    ]
    const diagnostics = detectTodoLeftover(ticketLines, 'src/utils/helper.ts', 'typescript')
    expect(diagnostics).toHaveLength(0)
  })

  it('skips rule definition files', () => {
    const diagnostics = detectTodoLeftover(lines, 'src/engines/ast-slop/rules/todo-leftover.ts', 'typescript')
    expect(diagnostics).toHaveLength(0)
  })

  it('does not flag non-comment lines', () => {
    const codeLines = [
      { num: 1, text: 'const todo = "later"' },
    ]
    const diagnostics = detectTodoLeftover(codeLines, 'src/utils/helper.ts', 'typescript')
    expect(diagnostics).toHaveLength(0)
  })
})
