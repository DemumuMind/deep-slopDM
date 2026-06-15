// ── Similar Block Detection (Calibrated) ─────────────────
// Cross-file only, 90% Jaccard similarity threshold.

import { relative } from 'node:path'
import type { Diagnostic } from '../../../types/index.js'
import { diag, jaccardSimilarity, SIMILARITY_THRESHOLD, type CodeBlock } from '../shared.js'

export function detectSimilarBlocks(
  allBlocks: CodeBlock[],
  rootDir: string,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = []
  const reported = new Set<string>()

  const blocksWithTokens = allBlocks.filter((b) => b.tokenSet)
  if (blocksWithTokens.length === 0) return diagnostics

  const byFile = new Map<string, CodeBlock[]>()
  for (const block of blocksWithTokens) {
    let arr = byFile.get(block.filePath)
    if (!arr) {
      arr = []
      byFile.set(block.filePath, arr)
    }
    arr.push(block)
  }

  const files = [...byFile.keys()]

  const normalizedKeys = new Map<CodeBlock, string>()
  for (const block of blocksWithTokens) {
    normalizedKeys.set(block, block.normalizedText)
  }

  for (let fi = 0; fi < files.length; fi++) {
    for (let fj = fi + 1; fj < files.length; fj++) {
      const blocksA = byFile.get(files[fi])!
      const blocksB = byFile.get(files[fj])!

      for (const a of blocksA) {
        for (const b of blocksB) {
          if (normalizedKeys.get(a) === normalizedKeys.get(b)) continue

          const similarity = jaccardSimilarity(a.tokenSet!, b.tokenSet!)
          if (similarity >= SIMILARITY_THRESHOLD) {
            const key = [a.filePath, a.startLine, b.filePath, b.startLine].sort().join(':')
            if (reported.has(key)) continue
            reported.add(key)

            const relA = relative(rootDir, a.filePath)
            const relB = relative(rootDir, b.filePath)
            const pct = Math.round(similarity * 100)

            diagnostics.push(
              diag({
                filePath: relA,
                rule: 'dup-detect/similar-block',
                severity: 'info',
                message: `Similar code block (${pct}% token overlap) found in ${relB}:${b.startLine}`,
                help: 'Consider extracting shared logic into a common utility. Similar blocks often diverge over time, creating maintenance issues.',
                line: a.startLine,
                column: 1,
                fixable: false,
                suggestion: {
                  type: 'refactor',
                  text: `Extract shared logic from ${relA}:${a.startLine}-${a.endLine} and ${relB}:${b.startLine}-${b.endLine} into a parameterized utility.`,
                  confidence: 0.6,
                  reason: `Jaccard similarity of ${pct}% suggests substantial code overlap that could be consolidated.`,
                },
                detail: {
                  similarity: pct,
                  duplicateLocations: [
                    { file: relA, startLine: a.startLine, endLine: a.endLine },
                    { file: relB, startLine: b.startLine, endLine: b.endLine },
                  ],
                },
              }),
            )
          }
        }
      }
    }
  }

  return diagnostics
}
