// ── Language Detection / Parsing ────────────────────────

import type { Node as TSNode } from 'web-tree-sitter'
import type { ASTNode } from './types.js'
import { parserInstance, tsLang, tsxLang, initParser } from './wasm.js'
import {
  pyLang,
  goLang,
  rustLang,
  phpLang,
  csharpLang,
  swiftLang,
  initPythonParser,
  initGoParser,
  initRustParser,
  initPhpParser,
  initCsharpParser,
  initSwiftParser,
} from './grammar-loading.js'

// ── AST Parse Cache ────────────────────────────────────
// Caches parsed ASTNode trees by (filePath) key so multiple
// engines sharing the same file don't re-parse. Cleared between
// scan runs via clearParseCache().
const parseCache = new Map<string, ASTNode | null>()

/** Clear the AST parse cache. Call at the start of each scan run. */
export function clearParseCache(): void {
  parseCache.clear()
}

/** Get a cached AST for a file path, if previously parsed. */
export function getCachedAST(filePath: string): ASTNode | null | undefined {
  return parseCache.get(filePath)
}

/** Store a parsed AST in the cache. */
export function setCachedAST(filePath: string, ast: ASTNode | null): void {
  parseCache.set(filePath, ast)
}

/**
 * Parse a source file into an AST tree.
 * Returns null if tree-sitter is not available or parsing fails.
 *
 * When `filePath` is provided, routes to the correct language parser
 * based on file extension (.go, .rs, .php, .cs, .swift, .py, .tsx, .jsx).
 * When omitted, parses as TypeScript (or TSX when `isTsx` is true).
 */
export async function parseFile(
  content: string,
  isTsx = false,
  filePath?: string,
): Promise<ASTNode | null> {
  // Check cache if filePath provided
  if (filePath) {
    const cacheKey = `${filePath}:${isTsx ? 'tsx' : 'ts'}`
    const cached = parseCache.get(cacheKey)
    if (cached !== undefined) return cached
  }

  // Route to language-specific parser when filePath is provided
  if (filePath) {
    const ext = filePath.toLowerCase()
    if (ext.endsWith('.go')) return parseGoFile(content, filePath)
    if (ext.endsWith('.rs')) return parseRustFile(content, filePath)
    if (ext.endsWith('.php')) return parsePhpFile(content, filePath)
    if (ext.endsWith('.cs')) return parseCsharpFile(content, filePath)
    if (ext.endsWith('.swift')) return parseSwiftFile(content, filePath)
    if (ext.endsWith('.py')) return parsePython(content, filePath)
  }

  // Default: TypeScript / TSX
  if (!parserInstance || (!tsLang && !tsxLang)) {
    const ok = await initParser()
    if (!ok) return null
  }

  try {
    const lang = isTsx ? tsxLang! : tsLang!
    parserInstance!.setLanguage(lang)
    const tree = parserInstance!.parse(content)
    if (!tree) return null
    const result = convertNode(tree.rootNode, null)
    // Cache result
    if (filePath) {
      parseCache.set(`${filePath}:${isTsx ? 'tsx' : 'ts'}`, result)
    }
    return result
  } catch {
    if (filePath) parseCache.set(`${filePath}:${isTsx ? 'tsx' : 'ts'}`, null)
    return null
  }
}

/**
 * Parse Python source content into an AST tree.
 * Returns null if tree-sitter-python is not available or parsing fails.
 */
export async function parsePython(content: string, filePath?: string): Promise<ASTNode | null> {
  if (filePath) {
    const cached = parseCache.get(`py:${filePath}`)
    if (cached !== undefined) return cached
  }
  if (!pyLang) {
    const ok = await initPythonParser()
    if (!ok) return null
  }

  if (!parserInstance) {
    const ok = await initParser()
    if (!ok) return null
  }

  try {
    parserInstance!.setLanguage(pyLang!)
    const tree = parserInstance!.parse(content)
    if (!tree) {
      if (filePath) parseCache.set(`py:${filePath}`, null)
      return null
    }
    const result = convertNode(tree.rootNode, null)
    if (filePath) parseCache.set(`py:${filePath}`, result)
    return result
  } catch {
    if (filePath) parseCache.set(`py:${filePath}`, null)
    return null
  }
}

/**
 * Parse Go source content into an AST tree.
 * Returns null if tree-sitter-go is not available or parsing fails.
 */
export async function parseGoFile(content: string, filePath?: string): Promise<ASTNode | null> {
  if (filePath) {
    const cached = parseCache.get(`go:${filePath}`)
    if (cached !== undefined) return cached
  }
  if (!goLang) {
    const ok = await initGoParser()
    if (!ok) return null
  }

  if (!parserInstance) {
    const ok = await initParser()
    if (!ok) return null
  }

  try {
    parserInstance!.setLanguage(goLang!)
    const tree = parserInstance!.parse(content)
    if (!tree) {
      if (filePath) parseCache.set(`go:${filePath}`, null)
      return null
    }
    const result = convertNode(tree.rootNode, null)
    if (filePath) parseCache.set(`go:${filePath}`, result)
    return result
  } catch {
    if (filePath) parseCache.set(`go:${filePath}`, null)
    return null
  }
}

/**
 * Parse Rust source content into an AST tree.
 * Returns null if tree-sitter-rust is not available or parsing fails.
 */
export async function parseRustFile(content: string, filePath?: string): Promise<ASTNode | null> {
  if (filePath) {
    const cached = parseCache.get(`rs:${filePath}`)
    if (cached !== undefined) return cached
  }
  if (!rustLang) {
    const ok = await initRustParser()
    if (!ok) return null
  }

  if (!parserInstance) {
    const ok = await initParser()
    if (!ok) return null
  }

  try {
    parserInstance!.setLanguage(rustLang!)
    const tree = parserInstance!.parse(content)
    if (!tree) {
      if (filePath) parseCache.set(`rs:${filePath}`, null)
      return null
    }
    const result = convertNode(tree.rootNode, null)
    if (filePath) parseCache.set(`rs:${filePath}`, result)
    return result
  } catch {
    if (filePath) parseCache.set(`rs:${filePath}`, null)
    return null
  }
}

/**
 * Parse PHP source content into an AST tree.
 * Returns null if tree-sitter-php is not available or parsing fails.
 */
export async function parsePhpFile(content: string, filePath?: string): Promise<ASTNode | null> {
  if (filePath) {
    const cached = parseCache.get(`php:${filePath}`)
    if (cached !== undefined) return cached
  }
  if (!phpLang) {
    const ok = await initPhpParser()
    if (!ok) return null
  }

  if (!parserInstance) {
    const ok = await initParser()
    if (!ok) return null
  }

  try {
    parserInstance!.setLanguage(phpLang!)
    const tree = parserInstance!.parse(content)
    if (!tree) {
      if (filePath) parseCache.set(`php:${filePath}`, null)
      return null
    }
    const result = convertNode(tree.rootNode, null)
    if (filePath) parseCache.set(`php:${filePath}`, result)
    return result
  } catch {
    if (filePath) parseCache.set(`php:${filePath}`, null)
    return null
  }
}

/**
 * Parse C# source content into an AST tree.
 * Returns null if tree-sitter-c-sharp is not available or parsing fails.
 */
export async function parseCsharpFile(content: string, filePath?: string): Promise<ASTNode | null> {
  if (filePath) {
    const cached = parseCache.get(`cs:${filePath}`)
    if (cached !== undefined) return cached
  }
  if (!csharpLang) {
    const ok = await initCsharpParser()
    if (!ok) return null
  }

  if (!parserInstance) {
    const ok = await initParser()
    if (!ok) return null
  }

  try {
    parserInstance!.setLanguage(csharpLang!)
    const tree = parserInstance!.parse(content)
    if (!tree) {
      if (filePath) parseCache.set(`cs:${filePath}`, null)
      return null
    }
    const result = convertNode(tree.rootNode, null)
    if (filePath) parseCache.set(`cs:${filePath}`, result)
    return result
  } catch {
    if (filePath) parseCache.set(`cs:${filePath}`, null)
    return null
  }
}

/**
 * Parse Swift source content into an AST tree.
 * Returns null if tree-sitter-swift is not available or parsing fails.
 */
export async function parseSwiftFile(content: string, filePath?: string): Promise<ASTNode | null> {
  if (filePath) {
    const cached = parseCache.get(`swift:${filePath}`)
    if (cached !== undefined) return cached
  }
  if (!swiftLang) {
    const ok = await initSwiftParser()
    if (!ok) return null
  }

  if (!parserInstance) {
    const ok = await initParser()
    if (!ok) return null
  }

  try {
    parserInstance!.setLanguage(swiftLang!)
    const tree = parserInstance!.parse(content)
    if (!tree) {
      if (filePath) parseCache.set(`swift:${filePath}`, null)
      return null
    }
    const result = convertNode(tree.rootNode, null)
    if (filePath) parseCache.set(`swift:${filePath}`, result)
    return result
  } catch {
    if (filePath) parseCache.set(`swift:${filePath}`, null)
    return null
  }
}

/**
 * Generic file parser that routes to the correct language parser
 * based on file extension. Returns null if the appropriate grammar
 * is not available or parsing fails.
 */
export async function parseAnyFile(
  filePath: string,
  content: string,
): Promise<ASTNode | null> {
  const ext = filePath.toLowerCase()

  if (ext.endsWith('.go')) return parseGoFile(content, filePath)
  if (ext.endsWith('.rs')) return parseRustFile(content, filePath)
  if (ext.endsWith('.php')) return parsePhpFile(content, filePath)
  if (ext.endsWith('.cs')) return parseCsharpFile(content, filePath)
  if (ext.endsWith('.swift')) return parseSwiftFile(content, filePath)
  if (ext.endsWith('.py')) return parsePython(content, filePath)

  // TypeScript / JavaScript variants
  const isTsx = ext.endsWith('.tsx') || ext.endsWith('.jsx')
  return parseFile(content, isTsx, filePath)
}

// ── Node selectors (TypeScript / language-specific) ────

/**
 * Parse a TypeScript/TSX file and return a specific AST node
 * selected by a visitor callback. Returns null on failure or
 * when the visitor never returns a node.
 */
export async function getASTNode(
  content: string,
  isTsx: boolean,
  selector: (root: ASTNode) => ASTNode | null,
): Promise<ASTNode | null> {
  const root = await parseFile(content, isTsx)
  if (!root) return null
  return selector(root)
}

/**
 * Parse a Go file and return a specific AST node
 * selected by a visitor callback.
 */
export async function getGoASTNode(
  content: string,
  selector: (root: ASTNode) => ASTNode | null,
): Promise<ASTNode | null> {
  const root = await parseGoFile(content)
  if (!root) return null
  return selector(root)
}

/**
 * Parse a Rust file and return a specific AST node
 * selected by a visitor callback.
 */
export async function getRustASTNode(
  content: string,
  selector: (root: ASTNode) => ASTNode | null,
): Promise<ASTNode | null> {
  const root = await parseRustFile(content)
  if (!root) return null
  return selector(root)
}

/**
 * Parse a PHP file and return a specific AST node
 * selected by a visitor callback.
 */
export async function getPhpASTNode(
  content: string,
  selector: (root: ASTNode) => ASTNode | null,
): Promise<ASTNode | null> {
  const root = await parsePhpFile(content)
  if (!root) return null
  return selector(root)
}

/**
 * Parse a C# file and return a specific AST node
 * selected by a visitor callback.
 */
export async function getCsharpASTNode(
  content: string,
  selector: (root: ASTNode) => ASTNode | null,
): Promise<ASTNode | null> {
  const root = await parseCsharpFile(content)
  if (!root) return null
  return selector(root)
}

/**
 * Parse a Swift file and return a specific AST node
 * selected by a visitor callback.
 */
export async function getSwiftASTNode(
  content: string,
  selector: (root: ASTNode) => ASTNode | null,
): Promise<ASTNode | null> {
  const root = await parseSwiftFile(content)
  if (!root) return null
  return selector(root)
}

// ── Internal ───────────────────────────────────────────

function convertNode(node: TSNode, parent: ASTNode | null): ASTNode {
  const children: ASTNode[] = []
  const astNode: ASTNode = {
    type: node.type,
    text: node.text,
    startRow: node.startPosition.row,
    startCol: node.startPosition.column,
    endRow: node.endPosition.row,
    endCol: node.endPosition.column,
    children,
    parent,
    fieldName: null,
  }

  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i)
    if (child) {
      const converted = convertNode(child, astNode)
      converted.fieldName = node.fieldNameForChild(i) ?? null
      children.push(converted)
    }
  }

  return astNode
}
