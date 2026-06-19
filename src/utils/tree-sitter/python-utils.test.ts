import { describe, it, expect } from 'vitest'
import type { ASTNode } from './types.js'
import { findPythonClasses, findPythonImports, detectPythonAIPatterns } from './python-utils.js'

function node(
  type: string,
  text = '',
  startRow = 0,
  children: ASTNode[] = [],
  fieldName: string | null = null,
): ASTNode {
  return {
    type,
    text,
    startRow,
    startCol: 0,
    endRow: startRow,
    endCol: text.length,
    children,
    parent: null,
    fieldName,
  }
}

describe('python-utils', () => {
  describe('findPythonClasses', () => {
    it('extracts class name, bases and methods', () => {
      const root = node('module', '', 0, [
        node('class_definition', 'class Foo(Bar):', 0, [
          node('identifier', 'Foo', 0, [], 'name'),
          node('argument_list', '(Bar)', 0, [
            node('identifier', 'Bar', 0),
          ]),
          node('block', '', 0, [
            node('function_definition', 'def baz(self): pass', 1, [
              node('identifier', 'baz', 1, [], 'name'),
              node('parameters', '(self)', 1, [
                node('identifier', 'self', 1),
              ]),
              node('block', 'pass', 1, [
                node('pass', 'pass', 1),
              ]),
            ]),
          ]),
        ]),
      ])

      const classes = findPythonClasses(root)
      expect(classes).toHaveLength(1)
      expect(classes[0].name).toBe('Foo')
      expect(classes[0].bases).toEqual(['Bar'])
      expect(classes[0].methods).toHaveLength(1)
      expect(classes[0].methods[0].name).toBe('baz')
      expect(classes[0].methods[0].parameters).toEqual(['self'])
    })

    it('returns empty for a module without classes', () => {
      const root = node('module', '', 0, [
        node('function_definition', 'def foo(): pass', 0),
      ])
      expect(findPythonClasses(root)).toEqual([])
    })
  })

  describe('findPythonImports', () => {
    it('extracts bare import statements', () => {
      const root = node('module', '', 0, [
        node('import_statement', 'import os', 0, [
          node('import', 'import', 0),
          node('dotted_name', 'os', 0),
        ]),
      ])
      const imports = findPythonImports(root)
      expect(imports).toHaveLength(1)
      expect(imports[0].module).toBe('os')
      expect(imports[0].symbols).toContain('os')
      expect(imports[0].isFromImport).toBe(false)
    })

    it('extracts from-import statements', () => {
      const root = node('module', '', 0, [
        node('import_from_statement', 'from os import path', 0, [
          node('from', 'from', 0),
          node('dotted_name', 'os', 0),
          node('import', 'import', 0),
          node('identifier', 'path', 0),
        ]),
      ])
      const imports = findPythonImports(root)
      expect(imports).toHaveLength(1)
      expect(imports[0].module).toBe('os')
      expect(imports[0].symbols).toContain('path')
      expect(imports[0].isFromImport).toBe(true)
    })
  })

  describe('detectPythonAIPatterns', () => {
    it('flags stub functions, bare excepts, TODO comments and print calls', () => {
      const root = node('module', '', 0, [
        node('function_definition', 'def foo():\n    pass', 0, [
          node('identifier', 'foo', 0, [], 'name'),
          node('parameters', '()', 0, []),
          node('block', '    pass', 0, [
            node('pass', 'pass', 1),
          ]),
        ]),
        node('try_statement', 'try:\n    pass\nexcept:', 2, [
          node('except_clause', 'except:', 3, [
            node('block', 'pass', 3),
          ]),
        ]),
        node('comment', '# TODO: fix this', 4),
        node('call', 'print(x)', 5, [
          node('identifier', 'print', 5),
          node('argument_list', '(x)', 5),
        ]),
      ])

      const findings = detectPythonAIPatterns(root)
      const types = findings.map((f) => f.type)
      expect(types).toContain('python-stub-function')
      expect(types).toContain('python-bare-except')
      expect(types).toContain('python-todo-stub')
      expect(types).toContain('python-print-leftover')
    })

    it('returns empty for an empty module', () => {
      const root = node('module', '', 0)
      expect(detectPythonAIPatterns(root)).toEqual([])
    })
  })
})
