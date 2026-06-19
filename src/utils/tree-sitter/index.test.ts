import { describe, it, expect } from 'vitest'
import {
  parseFile,
  parsePython,
  clearParseCache,
  findNodesOfType,
  findNodesOfTypes,
  walkAST,
  findAncestor,
  findPythonImports,
  detectPythonAIPatterns,
  initParser,
  isAvailable,
} from './index.js'

describe('tree-sitter/index', () => {
  it('exports the expected parsing and traversal functions', () => {
    expect(typeof parseFile).toBe('function')
    expect(typeof parsePython).toBe('function')
    expect(typeof clearParseCache).toBe('function')
    expect(typeof findNodesOfType).toBe('function')
    expect(typeof findNodesOfTypes).toBe('function')
    expect(typeof walkAST).toBe('function')
    expect(typeof findAncestor).toBe('function')
    expect(typeof findPythonImports).toBe('function')
    expect(typeof detectPythonAIPatterns).toBe('function')
    expect(typeof initParser).toBe('function')
    expect(typeof isAvailable).toBe('function')
  })

  it('parseFile handles a simple TypeScript snippet without throwing', async () => {
    const result = await parseFile('const x = 1', false)
    expect(result === null || result.type === 'program').toBe(true)
  })

  it('parsePython returns a module or null gracefully', async () => {
    const result = await parsePython('def foo():\n    pass', 'test.py')
    expect(result === null || result.type === 'module').toBe(true)
  })

  it('clearParseCache and isAvailable are safe to call', () => {
    expect(() => clearParseCache()).not.toThrow()
    expect(typeof isAvailable()).toBe('boolean')
  })
})
