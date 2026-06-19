// ── Identical Block Detection (Calibrated) ───────
// Identical blocks across files are merged into regions and reported
// once per unique pair of regions.

import { relative } from 'node:path'
import type { Diagnostic } from '../../../types/index.js'
import { diag, type CodeBlock } from '../shared.js'

/** Merge overlapping blocks within each file into single regions.
 *  Two blocks overlap if they share >50% of their lines. */
function mergeOverlappingBlocks(blocks: CodeBlock[]): CodeBlock[] {
  const byFile = new Map<string, CodeBlock[]>()
  for (const b of blocks) {
    let arr = byFile.get(b.filePath)
    if (!arr) {
      arr = []
      byFile.set(b.filePath, arr)
    }
    arr.push(b)
  }

  const result: CodeBlock[] = []
  for (const [, fileBlocks] of byFile) {
    if (fileBlocks.length === 0) continue

    fileBlocks.sort((a, b) => a.startLine - b.startLine)

    const merged: CodeBlock[] = [{ ...fileBlocks[0] }]

    for (let i = 1; i < fileBlocks.length; i++) {
      const block = fileBlocks[i]
      const last = merged[merged.length - 1]

      const overlapStart = Math.max(block.startLine, last.startLine)
      const overlapEnd = Math.min(block.endLine, last.endLine)
      const overlapLines = Math.max(0, overlapEnd - overlapStart + 1)

      const blockLines = block.endLine - block.startLine + 1
      const lastLines = last.endLine - last.startLine + 1

      const sharesMajority = overlapLines > blockLines * 0.5 || overlapLines > lastLines * 0.5

      if (sharesMajority) {
        last.endLine = Math.max(last.endLine, block.endLine)
      } else {
        merged.push({ ...block })
      }
    }

    result.push(...merged)
  }

  return result
}

export function detectIdenticalBlocks(
  allBlocks: CodeBlock[],
  rootDir: string,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = []

  const groups = new Map<string, CodeBlock[]>()
  for (const block of allBlocks) {
    // Skip duplicated import/header boilerplate — not actionable copy-paste duplication
    if (block.isBoilerplate) continue

    let group = groups.get(block.normalizedText)
    if (!group) {
      group = []
      groups.set(block.normalizedText, group)
    }
    group.push(block)
  }

  for (const [, group] of groups) {
    const uniqueFiles = new Set(group.map((b) => b.filePath))
    if (group.length < 2 || uniqueFiles.size < 2) continue

    const merged = mergeOverlappingBlocks(group)
    if (merged.length < 2) continue

    const reportedPairs = new Set<string>()
    for (let i = 0; i < merged.length; i++) {
      for (let j = i + 1; j < merged.length; j++) {
        const a = merged[i]
        const b = merged[j]

        if (a.filePath === b.filePath) continue

        const pairKey = a.filePath < b.filePath
          ? `${a.filePath}:${a.startLine}-${a.endLine}|${b.filePath}:${b.startLine}-${b.endLine}`
          : `${b.filePath}:${b.startLine}-${b.endLine}|${a.filePath}:${a.startLine}-${a.endLine}`
        if (reportedPairs.has(pairKey)) continue
        reportedPairs.add(pairKey)

        const relA = relative(rootDir, a.filePath)
        const relB = relative(rootDir, b.filePath)

        diagnostics.push(
          diag({
            filePath: relA,
            rule: 'dup-detect/identical-block',
            severity: 'warning',
            message: `Identical code block (${a.endLine - a.startLine + 1} lines) duplicated in ${relB}:${b.startLine}`,
            help: 'Extract the duplicated block into a shared utility function or module to reduce maintenance burden.',
            line: a.startLine,
            column: 1,
            fixable: true,
            suggestion: {
              type: 'refactor',
              text: `// Extract the duplicated block into a shared function:\n// function extractedShared(...args) {\n//   ${relative(rootDir, a.filePath).replace(/\//g, '.')}:${a.startLine}-${a.endLine}\n// }`,
              range: {
                startLine: a.startLine,
                startCol: 1,
                endLine: a.endLine,
                endCol: 1,
              },
              confidence: 0.85,
              reason: 'Identical code blocks across files indicate copy-paste duplication that should be consolidated into a single reusable function.',
            },
            detail: {
              duplicateLocations: [
                { file: relA, startLine: a.startLine, endLine: a.endLine },
                { file: relB, startLine: b.startLine, endLine: b.endLine },
              ],
              lineCount: a.endLine - a.startLine + 1,
            },
          }),
        )
      }
    }
  }

  return diagnostics
}
