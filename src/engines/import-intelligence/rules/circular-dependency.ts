// ── Circular Dependency Rule ───────────────────────────────────────────
// Detects cycles in the relative import graph between project files.

import { dirname, relative, resolve } from 'node:path'
import type { Diagnostic } from '../../../types/index.js'
import { diag, type ImportGraph, type ParsedImport } from '../shared.js'

export function buildImportGraph(
  fileImports: Map<string, ParsedImport[]>,
  rootDir: string,
): ImportGraph {
  const adjacency = new Map<string, Set<string>>()
  const reverse = new Map<string, Set<string>>()

  for (const [filePath, imports] of fileImports) {
    const deps = new Set<string>()
    for (const imp of imports) {
      if (imp.source.startsWith('.')) {
        const resolved = resolve(dirname(filePath), imp.source)
        deps.add(resolved)
      }
    }
    adjacency.set(filePath, deps)
    for (const dep of deps) {
      if (!reverse.has(dep)) reverse.set(dep, new Set())
      reverse.get(dep)!.add(filePath)
    }
  }

  return { adjacency, reverse }
}

function detectCycles(
  graph: ImportGraph,
  maxDepth: number,
): { cycle: string[]; depth: number }[] {
  const cycles: { cycle: string[]; depth: number }[] = []
  const visited = new Set<string>()
  const inStack = new Set<string>()
  const stack: string[] = []

  function dfs(node: string): void {
    if (inStack.has(node)) {
      const cycleStart = stack.indexOf(node)
      if (cycleStart !== -1) {
        const cyclePath = stack.slice(cycleStart)
        cyclePath.push(node)
        cycles.push({ cycle: cyclePath, depth: cyclePath.length - 1 })
      }
      return
    }
    if (visited.has(node)) return

    visited.add(node)
    inStack.add(node)
    stack.push(node)

    if (stack.length <= maxDepth) {
      const neighbors = graph.adjacency.get(node) ?? new Set()
      for (const neighbor of neighbors) {
        dfs(neighbor)
      }
    }

    stack.pop()
    inStack.delete(node)
  }

  for (const node of graph.adjacency.keys()) {
    dfs(node)
  }

  const seen = new Set<string>()
  const unique: typeof cycles = []
  for (const c of cycles) {
    const key = [...c.cycle.slice(0, -1)].sort().join('→')
    if (!seen.has(key)) {
      seen.add(key)
      unique.push(c)
    }
  }

  return unique
}

export function detectCircularDependency(
  fileImports: Map<string, ParsedImport[]>,
  rootDir: string,
  maxDepth: number,
  hasASTImports: boolean,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = []
  const graph = buildImportGraph(fileImports, rootDir)
  const cycles = detectCycles(graph, maxDepth)

  for (const { cycle, depth } of cycles) {
    const chain = cycle.map((p) => relative(rootDir, p) || p).join(' → ')
    const involvedFiles = cycle.slice(0, -1)
    const firstFile = involvedFiles[0] ?? ''
    const relFirst = relative(rootDir, firstFile) || firstFile

    diagnostics.push(
      diag(relFirst, 'import-intelligence/circular-dependency', 'warning',
        `Circular dependency detected: ${chain}`,
        1,
        'Break the cycle by extracting shared logic into a separate module that both files can import without creating a loop.',
        {
          fixable: false,
          detail: {
            cycle: involvedFiles.map((p) => relative(rootDir, p)),
            depth,
            astConfirmed: hasASTImports,
          },
          suggestion: {
            type: 'refactor',
            text: `/* Circular: ${chain} — extract shared code to break the cycle */`,
            confidence: hasASTImports ? 0.97 : 0.95,
            reason: `Circular dependencies create fragile coupling, can cause initialization order bugs, and make the module graph harder to reason about. Extracting the shared dependency into a third module breaks the cycle cleanly.${hasASTImports ? ' AST analysis also checked lazy imports inside function bodies.' : ''}`,
          },
        },
      ),
    )
  }

  return diagnostics
}
