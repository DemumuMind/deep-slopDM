// ── Suppress Directive Parser ──────────────────────────
// Scans source for `// deep-slop-disable-*` directives and builds a suppress map
// that engines consult before emitting diagnostics.

export interface SuppressEntry {
  /** Line number where the directive appears (1-indexed) */
  directiveLine: number
  /** Target line number (directiveLine + 1 for next-line, or directiveLine for line) */
  targetLine: number
  /** Which rules to suppress — empty set = all rules */
  rules: Set<string>
  /** Type of suppress */
  type: 'next-line' | 'line' | 'block-start' | 'block-end'
}

/** Parse suppress directives from source content */
export function parseSuppressDirectives(content: string): SuppressEntry[] {
  const entries: SuppressEntry[] = []
  const lines = content.split('\n')

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    const lineNum = i + 1

    // ── next-line ──
    const nextLineMatch = line.match(
      /\/\/\s*deep-slop-disable-next-line(?:\s+(.+))?$/
    )
    if (nextLineMatch) {
      entries.push({
        directiveLine: lineNum,
        targetLine: lineNum + 1,
        rules: parseRuleList(nextLineMatch[1]),
        type: 'next-line',
      })
      continue
    }

    // ── current-line ──
    const lineMatch = line.match(
      /\/\/\s*deep-slop-disable-line(?:\s+(.+))?$/
    )
    if (lineMatch) {
      entries.push({
        directiveLine: lineNum,
        targetLine: lineNum,
        rules: parseRuleList(lineMatch[1]),
        type: 'line',
      })
      continue
    }

    // ── block start ──
    const blockStart = line.match(
      /\/\*\s*deep-slop-disable(?:\s+(.+))?\s*\//
    )
    if (blockStart) {
      entries.push({
        directiveLine: lineNum,
        targetLine: lineNum, // block starts here, applies to subsequent lines
        rules: parseRuleList(blockStart[1]),
        type: 'block-start',
      })
      continue
    }

    // ── block end ──
    const blockEnd = line.match(/\/\*\s*deep-slop-enable\s*\//)
    if (blockEnd) {
      entries.push({
        directiveLine: lineNum,
        targetLine: lineNum,
        rules: new Set(),
        type: 'block-end',
      })
    }
  }

  return entries
}

/** Parse comma/space-separated rule list from directive */
function parseRuleList(rulesStr: string | undefined): Set<string> {
  if (!rulesStr) return new Set() // empty = suppress all
  const rules = rulesStr
    .split(/[,\s]+/)
    .map((r) => r.trim())
    .filter(Boolean)
  return new Set(rules)
}

/** Build a suppress check function from parsed directives */
export function buildSuppressChecker(
  entries: SuppressEntry[],
): (line: number, rule: string) => boolean {
  // Build block ranges
  const blockRanges: { startLine: number; endLine: number; rules: Set<string> }[] = []
  let currentStart: { line: number; rules: Set<string> } | null = null

  for (const entry of entries) {
    if (entry.type === 'block-start') {
      currentStart = { line: entry.directiveLine, rules: entry.rules }
    } else if (entry.type === 'block-end' && currentStart) {
      blockRanges.push({
        startLine: currentStart.line,
        endLine: entry.directiveLine,
        rules: currentStart.rules,
      })
      currentStart = null
    }
  }
  // Unclosed block → extends to EOF (use a large number)
  if (currentStart) {
    blockRanges.push({
      startLine: currentStart.line,
      endLine: 999999,
      rules: currentStart.rules,
    })
  }

  return (line: number, rule: string): boolean => {
    // Check next-line and line directives
    for (const entry of entries) {
      if (entry.type === 'next-line' || entry.type === 'line') {
        if (entry.targetLine === line) {
          if (entry.rules.size === 0 || entry.rules.has(rule)) {
            return true // suppressed
          }
        }
      }
    }

    // Check block ranges
    for (const range of blockRanges) {
      if (line >= range.startLine && line <= range.endLine) {
        if (range.rules.size === 0 || range.rules.has(rule)) {
          return true // suppressed
        }
      }
    }

    return false // not suppressed
  }
}
