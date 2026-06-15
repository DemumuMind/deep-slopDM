// ── Query Execution / AST Traversal ───────────────────────────

import type { ASTNode } from './types.js'

/**
 * Find all descendant nodes of a given type.
 */
export function findNodesOfType(
  root: ASTNode,
  type: string,
): ASTNode[] {
  const results: ASTNode[] = []
  function walk(node: ASTNode) {
    if (node.type === type) results.push(node)
    for (const child of node.children) walk(child)
  }
  walk(root)
  return results
}

/**
 * Find all descendant nodes matching any of the given types.
 */
export function findNodesOfTypes(
  root: ASTNode,
  types: string[],
): ASTNode[] {
  const typeSet = new Set(types)
  const results: ASTNode[] = []
  function walk(node: ASTNode) {
    if (typeSet.has(node.type)) results.push(node)
    for (const child of node.children) walk(child)
  }
  walk(root)
  return results
}

/**
 * Walk the AST depth-first, calling visitor on each node.
 * Return false from visitor to skip children.
 */
export function walkAST(
  root: ASTNode,
  visitor: (node: ASTNode) => boolean | void,
): void {
  function walk(node: ASTNode) {
    const result = visitor(node)
    if (result !== false) {
      for (const child of node.children) walk(child)
    }
  }
  walk(root)
}
