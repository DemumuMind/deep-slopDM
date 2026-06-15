// ── Dead-Flow Engine ───────────────────────────────────────────────
// Detects dead/unreachable code using AST (tree-sitter) with regex fallback:
// unreachable code after terminators, dead conditionals, unused exports/variables,
// empty blocks, and dead switch cases.

import { readdir, stat } from "node:fs/promises"
import { join, relative } from "node:path"
import type { Engine, EngineContext, EngineResult, Diagnostic } from "../../types/index.js"
import { readFileContent } from "../../utils/file-utils.js"
import { detectAllAST, detectUnusedExportsASTWrapper, parseWithTreeSitter } from "./ast-detect.js"
import type { ASTNode } from "../../utils/tree-sitter.js"
import { isRelevantFile } from "./shared.js"
import { detectUnusedVariable } from "./rules/unused-variable.js"
import { detectUnusedExport } from "./rules/unused-export.js"
import { detectUnreachableAfterTerminator } from "./rules/unreachable-after-terminator.js"
import { detectUnreachableAfterIfElseReturn } from "./rules/unreachable-after-if-else-return.js"
import { detectDeadConditional } from "./rules/dead-conditional.js"
import { detectDeadSwitchCode } from "./rules/dead-switch-code.js"
import { detectDeadSwitchCaseAfterDefault } from "./rules/dead-switch-case-after-default.js"
import { detectEmptyBlock } from "./rules/empty-block.js"

// ── File collection ───────────────────────────────────────────────

async function collectFiles(root: string, exclude: string[]): Promise<string[]> {
  const results: string[] = []

  async function walk(dir: string): Promise<void> {
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const full = join(dir, entry.name)
      if (exclude.some((pat) => full.includes(pat))) continue
      if (entry.isDirectory()) {
        await walk(full)
      } else if (entry.isFile() && isRelevantFile(full)) {
        results.push(full)
      }
    }
  }

  await walk(root)
  return results
}

// ── AST/Regex dedup helper ────────────────────────────────────────

/** Merge AST and regex diagnostics, preferring AST when both match.
 *  AST-only rules always pass through. */
function mergeASTAndRegex(
  astDiags: Diagnostic[],
  regexDiags: Diagnostic[],
  astRulesRun: Set<string>,
): Diagnostic[] {
  const result: Diagnostic[] = []
  const seen = new Set<string>()

  for (const d of astDiags) {
    const key = `${d.filePath}:${d.line}:${d.rule}`
    if (!seen.has(key)) {
      seen.add(key)
      result.push(d)
    }
  }

  for (const d of regexDiags) {
    const key = `${d.filePath}:${d.line}:${d.rule}`
    if (seen.has(key)) continue

    const ruleBase = d.rule.replace("dead-flow/", "")
    if (astRulesRun.has(ruleBase)) continue

    seen.add(key)
    result.push(d)
  }

  return result
}

// ── Engine definition ─────────────────────────────────────────────

export const deadFlowEngine: Engine = {
  name: "dead-flow",
  description:
    "Detects dead/unreachable code using AST (tree-sitter) with regex fallback: unreachable code after terminators, dead conditionals, unused exports/variables, empty blocks, and dead switch cases",
  supportedLanguages: ["typescript", "javascript"],

  async run(context: EngineContext): Promise<EngineResult> {
    const start = Date.now()
    const { rootDirectory, config, files: specifiedFiles } = context

    const filePaths = specifiedFiles
      ? specifiedFiles.filter(isRelevantFile)
      : await collectFiles(rootDirectory, config.exclude)

    if (filePaths.length === 0) {
      return {
        engine: "dead-flow",
        diagnostics: [],
        elapsed: Date.now() - start,
        skipped: true,
        skipReason: "No TypeScript/JavaScript files found to analyze",
      }
    }

    const fileContents = new Map<string, string>()
    for (const fp of filePaths) {
      try {
        const content = await readFileContent(fp)
        fileContents.set(fp, content)
      } catch {
        // Skip unreadable files
      }
    }

    // ── Phase 1: AST detection (per-file) ────────────────────────
    const astDiagnostics: Diagnostic[] = []
    const astMap = new Map<string, ASTNode>()
    let astAvailable = false

    for (const [fp, content] of fileContents) {
      const relPath = relative(rootDirectory, fp)
      try {
        const astResult = await detectAllAST(content, relPath)
        if (astResult) {
          astAvailable = true
          astDiagnostics.push(...astResult.diagnostics)

          const ast = await parseWithTreeSitter(content, relPath)
          if (ast) astMap.set(relPath, ast)
        }
      } catch {
        // AST parsing failed — fall back to regex
      }
    }

    // ── Phase 2: AST cross-file detection (unused exports) ───────
    let astExportDiags: Diagnostic[] = []
    let astExportRulesRun = false
    if (config.deadCode.unusedExports && astMap.size > 0) {
      try {
        const relContents = new Map<string, string>()
        for (const [fp, content] of fileContents) {
          relContents.set(relative(rootDirectory, fp), content)
        }
        const exportResult = await detectUnusedExportsASTWrapper(astMap, relContents, rootDirectory)
        if (exportResult) {
          astExportDiags = exportResult
          astExportRulesRun = true
        }
      } catch {
        // AST export detection failed — fall back to regex
      }
    }

    // ── Phase 3: Regex detection (fallback) ────────────────────────
    const regexDiagnostics: Diagnostic[] = []

    for (const [fp, content] of fileContents) {
      const relPath = relative(rootDirectory, fp)

      if (config.deadCode.unreachableBranches) {
        regexDiagnostics.push(...detectUnreachableAfterTerminator(content, relPath))
        regexDiagnostics.push(...detectUnreachableAfterIfElseReturn(content, relPath))
        regexDiagnostics.push(...detectDeadConditional(content, relPath))
        regexDiagnostics.push(...detectDeadSwitchCode(content, relPath))
        regexDiagnostics.push(...detectDeadSwitchCaseAfterDefault(content, relPath))
      }

      if (config.deadCode.unusedVariables) {
        regexDiagnostics.push(...detectUnusedVariable(content, relPath))
      }

      regexDiagnostics.push(...detectEmptyBlock(content, relPath))
    }

    if (config.deadCode.unusedExports) {
      regexDiagnostics.push(...detectUnusedExport(fileContents, rootDirectory))
    }

    // ── Phase 4: Merge with dedup ─────────────────────────────────
    const globalASTRules = new Set<string>()
    if (astAvailable) {
      globalASTRules.add("unreachable-after-terminator")
      globalASTRules.add("unused-variable")
      globalASTRules.add("dead-conditional")
      globalASTRules.add("dead-after-throw")
      globalASTRules.add("dead-after-return")
      globalASTRules.add("dead-after-break")
    }
    if (astExportRulesRun) {
      globalASTRules.add("unused-export")
    }

    let merged = mergeASTAndRegex(
      [...astDiagnostics, ...astExportDiags],
      regexDiagnostics,
      globalASTRules,
    )

    const seen = new Set<string>()
    const unique = merged.filter((d) => {
      const key = `${d.filePath}:${d.line}:${d.rule}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })

    return {
      engine: "dead-flow",
      diagnostics: unique,
      elapsed: Date.now() - start,
      skipped: false,
    }
  },
}
