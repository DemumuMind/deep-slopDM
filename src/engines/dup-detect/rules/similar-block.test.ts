import { describe, it, expect } from 'vitest'
import { detectSimilarBlocks } from './similar-block.js'

const ROOT = '/project'

describe('dup-detect/similar-block', () => {
  it('detects similar blocks across files', () => {
    const blocks = [
      {
        filePath: '/project/src/a.ts',
        startLine: 1,
        endLine: 5,
        normalizedText: 'const a = 1\nconst b = 2\nconst c = 3\nconst d = 4\nreturn a + b + c + d',
        tokenSet: new Set(['const', 'a', '1', 'b', '2', 'c', '3', 'd', '4', 'return', '+']),
      },
      {
        filePath: '/project/src/b.ts',
        startLine: 10,
        endLine: 14,
        normalizedText: 'const a = 1\nconst b = 2\nconst c = 3\nconst d = 4\nreturn a + b + c + d + extra',
        tokenSet: new Set(['const', 'a', '1', 'b', '2', 'c', '3', 'd', '4', 'return', '+', 'extra']),
      },
    ]
    const diagnostics = detectSimilarBlocks(blocks, ROOT)
    expect(diagnostics).toHaveLength(1)
    expect(diagnostics[0].rule).toBe('dup-detect/similar-block')
    expect(diagnostics[0].message).toContain('Similar code block')
  })

  it('returns empty when blocks have no token set', () => {
    const blocks = [
      {
        filePath: '/project/src/a.ts',
        startLine: 1,
        endLine: 3,
        normalizedText: 'const a = 1\nconst b = 2\nreturn a + b',
      },
    ]
    const diagnostics = detectSimilarBlocks(blocks, ROOT)
    expect(diagnostics).toHaveLength(0)
  })

  it('does not report identical normalized text', () => {
    const blocks = [
      {
        filePath: '/project/src/a.ts',
        startLine: 1,
        endLine: 3,
        normalizedText: 'const a = 1\nconst b = 2\nreturn a + b',
        tokenSet: new Set(['const', 'a', '1', 'b', '2', 'return', '+']),
      },
      {
        filePath: '/project/src/b.ts',
        startLine: 10,
        endLine: 12,
        normalizedText: 'const a = 1\nconst b = 2\nreturn a + b',
        tokenSet: new Set(['const', 'a', '1', 'b', '2', 'return', '+']),
      },
    ]
    const diagnostics = detectSimilarBlocks(blocks, ROOT)
    expect(diagnostics).toHaveLength(0)
  })

  it('does not flag dissimilar blocks', () => {
    const blocks = [
      {
        filePath: '/project/src/a.ts',
        startLine: 1,
        endLine: 3,
        normalizedText: 'const a = 1\nconst b = 2\nreturn a + b',
        tokenSet: new Set(['const', 'a', '1', 'b', '2', 'return', '+']),
      },
      {
        filePath: '/project/src/b.ts',
        startLine: 10,
        endLine: 12,
        normalizedText: 'const q = "hello"\nconsole.log(q)\nreturn q',
        tokenSet: new Set(['const', 'q', 'hello', 'console', 'log', 'return']),
      },
    ]
    const diagnostics = detectSimilarBlocks(blocks, ROOT)
    expect(diagnostics).toHaveLength(0)
  })
})
