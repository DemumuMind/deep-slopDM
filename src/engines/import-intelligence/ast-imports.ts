// ── Import Intelligence AST Import Parsing ──────────────────
// Tree-sitter based parsing of import statements and barrel-file detection.

import {
  initParser,
  parseFile,
  extractImportFromNode,
  findNodesOfTypes,
  walkAST,
  type ASTNode,
} from '../../utils/tree-sitter/index.js'
import {
  type ParsedImport,
  type BarrelFile,
  type LazyImport,
  SIDE_EFFECT_RE,
  NAMESPACE_IMPORT_RE,
  DEFAULT_IMPORT_RE,
} from './shared.js'

/** Parse imports from a file using tree-sitter AST. */
export async function parseImportsAST(
  content: string,
  filePath: string,
  astRoot?: ASTNode,
): Promise<ParsedImport[] | null> {
  let ast: ASTNode | null = astRoot ?? null
  if (!ast) {
    const ok = await initParser()
    if (!ok) return null

    const isTsx = filePath.endsWith('.tsx') || filePath.endsWith('.jsx')
    ast = await parseFile(content, isTsx)
    if (!ast) return null
  }

  const importNodes = findNodesOfTypes(ast, [
    'import_statement',
    'import_declaration',
  ])

  const results: ParsedImport[] = []

  for (const node of importNodes) {
    const extracted = extractImportFromNode(node)
    if (!extracted) continue

    const raw = node.text.trim()
    const isSideEffect = SIDE_EFFECT_RE.test(raw)
    const isNamespace = NAMESPACE_IMPORT_RE.test(raw)
    const nsMatch = raw.match(NAMESPACE_IMPORT_RE)
    const namespaceAlias = nsMatch ? nsMatch[1] : ''

    const defaultMatch = raw.match(DEFAULT_IMPORT_RE)
    const isDefault = !!(defaultMatch && !raw.includes('{'))

    results.push({
      line: extracted.line,
      source: extracted.source,
      raw,
      isTypeOnly: extracted.isTypeOnly,
      isDefault,
      isDynamic: false,
      symbols: extracted.symbols,
      isSideEffect,
      isNamespace,
      namespaceAlias,
      viaAST: true,
    })
  }

  const lazyImports = findLazyImportsAST(ast)
  for (const lazy of lazyImports) {
    results.push({
      line: lazy.line,
      source: lazy.source,
      raw: `import('${lazy.source}')`,
      isTypeOnly: false,
      isDefault: false,
      isDynamic: true,
      symbols: [],
      isSideEffect: false,
      isNamespace: false,
      namespaceAlias: '',
      viaAST: true,
    })
  }

  return results
}

/** Walk AST to find dynamic import() calls inside function bodies. */
function findLazyImportsAST(ast: ASTNode): LazyImport[] {
  const lazyImports: LazyImport[] = []

  walkAST(ast, (node) => {
    if (node.type === 'call_expression') {
      const func = node.children[0]
      if (func && func.type === 'import') {
        const args = node.children.find((c) => c.type === 'arguments')
        if (args) {
          const stringArg = args.children.find(
            (c) => c.type === 'string' || c.type === 'template_string',
          )
          if (stringArg) {
            const source = stringArg.text.replace(/^['"]|['"]$/g, '')
            lazyImports.push({
              source,
              line: node.startRow + 1,
              insideFunction: true,
              isDynamic: true,
            })
          }
        }
        return false
      }
    }
    return undefined
  })

  return lazyImports
}

/** AST-enhanced barrel file detection. */
export async function detectBarrelFileAST(content: string, filePath: string): Promise<BarrelFile | null> {
  const ok = await initParser()
  if (!ok) return null

  const isTsx = filePath.endsWith('.tsx') || filePath.endsWith('.jsx')
  const ast = await parseFile(content, isTsx)
  if (!ast) return null

  const reExports: BarrelFile['reExports'] = []
  let hasNonExportCode = false

  const programNode = ast.type === 'program' ? ast : null
  if (programNode) {
    for (const child of programNode.children) {
      const t = child.type
      const text = child.text.trim()

      if (!text || t === 'comment' || t === '//' || t === '/*') continue

      if (t === 'export_statement' || t === 'export_declaration') {
        const parsed = parseExportNodeAST(child)
        if (parsed) {
          reExports.push(parsed)
          continue
        }
      }

      hasNonExportCode = true
      break
    }
  }

  if (reExports.length > 0 && !hasNonExportCode) {
    return { filePath: '', reExports }
  }
  return null
}

/** Parse an export AST node into a re-export descriptor. */
function parseExportNodeAST(node: ASTNode): BarrelFile['reExports'][0] | null {
  const text = node.text.trim()

  if (/\bexport\s+\*\s+from\s+/.test(text)) {
    const sourceMatch = text.match(/from\s+['"]([^'"]+)['"]/)
    if (sourceMatch) {
      return { source: sourceMatch[1], symbols: [], isWildcard: true }
    }
  }

  const isTypeOnly = /\bexport\s+type\s+\{/.test(text)

  const namedExport = text.match(/\bexport\s+(?:type\s+)?\{([^}]+)\}\s+from\s+['"]([^'"]+)['"]/)
  if (namedExport) {
    const symbols = namedExport[1].split(',').map((s) => s.trim()).filter(Boolean)
    return { source: namedExport[2], symbols, isWildcard: false, isTypeOnly }
  }

  const localExport = text.match(/\bexport\s+(?:type\s+)?\{([^}]+)\}/)
  if (localExport && !text.includes('from')) {
    const symbols = localExport[1].split(',').map((s) => s.trim()).filter(Boolean)
    return { source: '.', symbols, isWildcard: false, isTypeOnly }
  }

  return null
}

/** AST-enhanced unused symbol detection. */
export function findUsedSymbolsAST(ast: ASTNode, symbolNames: string[]): Set<string> {
  const usedSymbols = new Set<string>()
  if (symbolNames.length === 0) return usedSymbols
  const symbolSet = new Set(symbolNames)

  const importTypes = new Set([
    'import_statement',
    'import_declaration',
    'named_imports',
    'import_clause',
    'import_specifier',
  ])

  walkAST(ast, (node) => {
    const name = node.text
    if (symbolSet.has(name)) {
      const parent = node.parent
      if (parent && importTypes.has(parent.type)) {
        return undefined
      }
      usedSymbols.add(name)
    }

    return undefined
  })

  return usedSymbols
}
