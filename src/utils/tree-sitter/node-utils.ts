// ── Node Utilities ─────────────────────────────────────────────────────

import type { ASTNode, ASTRange } from './types.js'

/**
 * Get the text content of a node.
 */
export function getNodeText(node: ASTNode): string {
  return node.text
}

/**
 * Get the source range of a node (1-indexed lines).
 */
export function getNodeRange(node: ASTNode): ASTRange {
  return {
    startRow: node.startRow + 1, // Convert 0-indexed to 1-indexed
    startCol: node.startCol,
    endRow: node.endRow + 1,
    endCol: node.endCol,
  }
}

/**
 * Find the nearest ancestor of a node matching a type predicate.
 */
export function findAncestor(
  node: ASTNode,
  predicate: (n: ASTNode) => boolean,
): ASTNode | null {
  let current = node.parent
  while (current) {
    if (predicate(current)) return current
    current = current.parent
  }
  return null
}

/** Find ancestor of specific type */
export function findAncestorOfType(
  node: ASTNode,
  type: string,
): ASTNode | null {
  return findAncestor(node, (n) => n.type === type)
}

/**
 * Check if a node is inside a function of a certain kind.
 */
export function isInsideFunction(node: ASTNode): boolean {
  return findAncestor(node, (n) =>
    ['function_declaration', 'function', 'arrow_function', 'method_definition', 'generator_function_declaration'].includes(n.type),
  ) !== null
}

/**
 * Check if a node is inside a try/catch block.
 */
export function isInsideCatch(node: ASTNode): boolean {
  return findAncestor(node, (n) => n.type === 'catch_clause') !== null
}

/** Get next named sibling that is not a comment */
export function nextNamedNonCommentSibling(node: ASTNode): ASTNode | null {
  if (!node.parent) return null
  const siblings = node.parent.children.filter(
    (c) => c.type !== 'comment' && c.type !== '//' && c.type !== '/*',
  )
  const idx = siblings.indexOf(node)
  return idx >= 0 && idx < siblings.length - 1 ? siblings[idx + 1] : null
}

/** Get previous named sibling that is not a comment */
export function prevNamedNonCommentSibling(node: ASTNode): ASTNode | null {
  if (!node.parent) return null
  const siblings = node.parent.children.filter(
    (c) => c.type !== 'comment' && c.type !== '//' && c.type !== '/*',
  )
  const idx = siblings.indexOf(node)
  return idx > 0 ? siblings[idx - 1] : null
}

/** Check if a catch clause body is empty (only contains comments or whitespace) */
export function isCatchBodyEmpty(catchNode: ASTNode): boolean {
  if (catchNode.type !== 'catch_clause') return false
  const body = catchNode.children.find(
    (c) => c.type === 'statement_block' || c.type === 'block',
  )
  if (!body) return true
  const nonTrivial = body.children.filter(
    (c) =>
      c.type !== 'comment' &&
      c.type !== '//' &&
      c.type !== '/*' &&
      c.type !== '{' &&
      c.type !== '}' &&
      c.text.trim() !== '',
  )
  return nonTrivial.length === 0
}

/** Get the type annotation from an `as` expression (e.g., `x as any` → "any") */
export function getAsExpressionType(node: ASTNode): string | null {
  if (node.type !== 'as_expression') return null
  const typeChild = node.children.find((c) => c.fieldName === 'type')
  return typeChild?.text ?? null
}

/** Get context of an `as` expression — returns 'catch', 'orm', 'json', or 'unknown' */
export function getAsExpressionContext(node: ASTNode): string {
  if (isInsideCatch(node)) return 'catch'
  const funcAncestor = findAncestor(node, (n) =>
    ['function_declaration', 'arrow_function', 'method_definition'].includes(n.type),
  )
  if (funcAncestor) {
    const text = funcAncestor.text.toLowerCase()
    if (/prisma|drizzle|sequelize|mongoose|typeorm|knex|supabase/.test(text))
      return 'orm'
    if (/json\.parse|parse\(/.test(text)) return 'json'
  }
  return 'unknown'
}

/** Extract import info from an import_statement or import_declaration node */
export function extractImportFromNode(node: ASTNode): {
  source: string
  symbols: string[]
  line: number
  isTypeOnly: boolean
} | null {
  if (node.type !== 'import_statement' && node.type !== 'import_declaration')
    return null

  const sourceNode = node.children.find(
    (c) => c.type === 'string' || c.fieldName === 'source',
  )
  if (!sourceNode) return null
  const source = sourceNode.text.replace(/^['"]|['"]$/g, '')

  const isTypeOnly = node.text.includes('import type ')

  const symbols: string[] = []
  const namedImport = node.children.find(
    (c) => c.type === 'named_imports' || c.type === 'import_clause',
  )
  if (namedImport) {
    for (const child of namedImport.children) {
      if (
        child.type === 'identifier' ||
        child.type === 'type_identifier' ||
        child.type === 'import_specifier'
      ) {
        symbols.push(child.text)
      }
    }
  }

  return { source, symbols, line: node.startRow + 1, isTypeOnly }
}

/** Check if a node is in an HTML attribute context (JSX attribute value) */
export function isHtmlAttributeContext(node: ASTNode): boolean {
  const attr = findAncestor(node, (n) =>
    n.type === 'jsx_attribute' || n.type === 'attribute',
  )
  return attr !== null
}

/** Check if a name is a destructured API binding (e.g., `const { data } = useSWR()`) */
export function isDestructuredApiBinding(node: ASTNode): boolean {
  const objPattern = findAncestor(node, (n) =>
    n.type === 'object_pattern',
  )
  if (!objPattern) return false
  const declarator = findAncestor(objPattern, (n) =>
    n.type === 'variable_declarator',
  )
  if (!declarator) return false
  const callExpr = declarator.children.find(
    (c) => c.type === 'call_expression',
  )
  if (callExpr) {
    const text = callExpr.text
    return /^(useSWR|useQuery|useMutation|fetch|axios|prisma|db)\./.test(text)
  }
  return false
}
