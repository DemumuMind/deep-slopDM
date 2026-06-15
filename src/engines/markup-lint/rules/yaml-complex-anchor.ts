// ── YAML Complex Anchor Rule ───────────────────────────
// Complex YAML anchors/aliases that are hard to read.

import type { Diagnostic } from '../../../types/index.js'
import { makeDiagnostic } from '../shared.js'

export function detectYamlComplexAnchor(
  content: string,
  lines: { num: number; text: string }[],
  filePath: string,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = []

  const anchorPattern = /&(\w+)/g
  const aliasPattern = /\*(\w+)/g
  const anchors = new Map<string, { line: number; refCount: number }>()

  for (const { num, text } of lines) {
    let match: RegExpExecArray | null
    anchorPattern.lastIndex = 0
    while ((match = anchorPattern.exec(text)) !== null) {
      anchors.set(match[1], { line: num, refCount: 0 })
    }
  }

  for (const { text } of lines) {
    aliasPattern.lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = aliasPattern.exec(text)) !== null) {
      const anchor = anchors.get(match[1])
      if (anchor) anchor.refCount++
    }
  }

  for (const [name, info] of anchors) {
    if (info.refCount >= 3) {
      diagnostics.push(
        makeDiagnostic({
          filePath,
          rule: 'yaml/complex-anchor',
          message: `Anchor &${name} is aliased ${info.refCount} times — hard to trace data flow`,
          line: info.line,
          severity: 'info',
          category: 'architecture',
          help: 'Consider extracting shared values into a separate config file or reducing alias usage',
          fixable: false,
          detail: { anchorName: name, refCount: info.refCount },
        }),
      )
    }
  }

  return diagnostics
}
