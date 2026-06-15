// ── AST Types ────────────────────────────────────────────

/** Lightweight, serialisable tree-sitter node representation. */
export interface ASTNode {
  type: string
  text: string
  startRow: number
  startCol: number
  endRow: number
  endCol: number
  children: ASTNode[]
  parent: ASTNode | null
  fieldName: string | null
}

/** 1-indexed line/column range. */
export interface ASTRange {
  startRow: number
  startCol: number
  endRow: number
  endCol: number
}

/** Info extracted from a Python function definition */
export interface PythonFunctionInfo {
  /** Function name */
  name: string
  /** Decorators applied (e.g. '@staticmethod') */
  decorators: string[]
  /** Parameter names */
  parameters: string[]
  /** Whether the function is async */
  isAsync: boolean
  /** Start line (1-indexed) */
  line: number
  /** End line (1-indexed) */
  endLine: number
  /** Full text of the function */
  text: string
}

/** Info extracted from a Python class definition */
export interface PythonClassInfo {
  /** Class name */
  name: string
  /** Base classes (inheritance) */
  bases: string[]
  /** Decorators applied */
  decorators: string[]
  /** Methods defined within the class */
  methods: PythonFunctionInfo[]
  /** Start line (1-indexed) */
  line: number
  /** End line (1-indexed) */
  endLine: number
  /** Full text of the class */
  text: string
}

/** Info extracted from a Python import statement */
export interface PythonImportInfo {
  /** Module being imported from */
  module: string
  /** Symbols imported */
  symbols: string[]
  /** Whether this is a from-import (vs bare import) */
  isFromImport: boolean
  /** Start line (1-indexed) */
  line: number
  /** Full text of the import */
  text: string
}
