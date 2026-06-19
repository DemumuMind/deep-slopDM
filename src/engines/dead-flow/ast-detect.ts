import { type ASTNode, parseFile } from '../../utils/tree-sitter/index.js'
import type { Diagnostic } from '../../types/index.js'

export * from './rules.js'

// ── Parse a file with tree-sitter ───────────────────────────────

export async function parseWithTreeSitter(
  content: string,
  filePath: string,
): Promise<ASTNode | null> {
  const isTsx = filePath.endsWith('.tsx')
  return parseFile(content, isTsx)
}

// ── All AST detections combined ─────────────────────────────

import {
  detectDeadAfterThrow,
  detectDeadAfterReturn,
  detectDeadAfterBreak,
  detectUnreachableAfterTerminatorAST,
  detectUnusedVariablesAST,
  detectUnusedExportsAST,
  detectDeadBranchesAST,
} from './rules.js'

export interface ASTDetectionResult {
  diagnostics: Diagnostic[]
  /** Rules that were successfully run via AST */
  astRules: Set<string>
  /** Whether AST parsing succeeded */
  astAvailable: boolean
}

/** Run all AST-enhanced detections on a single file.
 * Returns null if tree-sitter is unavailable. */
export async function detectAllAST(
  content: string,
  filePath: string,
): Promise<ASTDetectionResult | null> {
  const ast = await parseWithTreeSitter(content, filePath)
  if (!ast) return null

  const diagnostics: Diagnostic[] = []
  const astRules = new Set<string>()

  const deadThrow = detectDeadAfterThrow(ast, filePath)
  diagnostics.push(...deadThrow)
  if (deadThrow.length > 0) astRules.add('dead-after-throw')

  const deadReturn = detectDeadAfterReturn(ast, filePath)
  diagnostics.push(...deadReturn)
  if (deadReturn.length > 0) astRules.add('dead-after-return')

  const deadBreak = detectDeadAfterBreak(ast, filePath)
  diagnostics.push(...deadBreak)
  if (deadBreak.length > 0) astRules.add('dead-after-break')

  const unreachable = detectUnreachableAfterTerminatorAST(ast, filePath)
  diagnostics.push(...unreachable)
  astRules.add('unreachable-after-terminator')

  const unusedVars = detectUnusedVariablesAST(ast, filePath)
  diagnostics.push(...unusedVars)
  astRules.add('unused-variable')

  const deadBranches = detectDeadBranchesAST(ast, filePath)
  diagnostics.push(...deadBranches)
  astRules.add('dead-conditional')

  return { diagnostics, astRules, astAvailable: true }
}

/** Run AST cross-file detections (unused exports).
 * Returns null if tree-sitter is unavailable. */
export async function detectUnusedExportsASTWrapper(
  astMap: Map<string, ASTNode>,
  contents: Map<string, string>,
  rootDir: string,
): Promise<Diagnostic[] | null> {
  if (astMap.size === 0) return null
  return detectUnusedExportsAST(astMap, contents, rootDir)
}
