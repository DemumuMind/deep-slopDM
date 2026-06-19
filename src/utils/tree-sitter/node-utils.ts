// ── Node Utilities ─────────────────────────────────────────────────────

import type { ASTNode } from './types.js'

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

  function collectImportSymbols(node: ASTNode) {
    if (
      node.type === 'identifier' ||
      node.type === 'type_identifier'
    ) {
      symbols.push(node.text)
      return
    }

    if (node.type === 'import_specifier') {
      const identifiers = node.children.filter(
        (c) => c.type === 'identifier' || c.type === 'type_identifier',
      )
      // For `import { X as Y }`, identifiers = [X, Y]
      // For `import { X }`, identifiers = [X]
      // We need the ORIGINAL exported name (first identifier)
      // so the unused-export check can match it correctly
      const name = identifiers[0]?.text
      if (name) symbols.push(name)
      return
    }

    if (node.type === 'namespace_import') {
      const id = node.children.find(
        (c) => c.type === 'identifier' || c.type === 'type_identifier',
      )
      if (id) symbols.push(id.text)
      return
    }

    if (
      node.type === 'import_clause' ||
      node.type === 'named_imports'
    ) {
      for (const child of node.children) {
        collectImportSymbols(child)
      }
    }
  }

  for (const child of node.children) {
    collectImportSymbols(child)
  }

  return { source, symbols, line: node.startRow + 1, isTypeOnly }
}
