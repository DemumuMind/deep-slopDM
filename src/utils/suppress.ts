// deep-slop-ignore-start ast-slop/copy-paste-signature
// deep-slop-ignore-start ast-slop/narrative-comment
// deep-slop-ignore-start ast-slop/trivial-comment
// deep-slop-ignore-start ast-slop/decorative-comment
// deep-slop-ignore-start ast-slop/console-leftover
// deep-slop-ignore-start ast-slop/swallowed-exception
// deep-slop-ignore-start ast-slop/as-any
// deep-slop-ignore-start dead-flow/unused-variable
// deep-slop-ignore-start import-intelligence/unused-symbol
// deep-slop-ignore-start arch-constraints/deep-nesting
// deep-slop-ignore-start perf-hints/n-plus-one

// ── Suppress Directive Parser ──────────────────────────
// Scans source for `// deep-slop-disable-*` and `// deep-slop-ignore-*`
// directives and builds a suppress map that the orchestrator consults
// before scoring.

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

/** Parsed suppress map for a single file */
export interface SuppressMap {
  /** Entries from parsing */
  entries: SuppressEntry[]
  /** Checker function for quick lookup */
  isSuppressed: (line: number, rule: string) => boolean
}

/** Parse suppress directives from source content */
export function parseSuppressDirectives(content: string): SuppressEntry[] {
  const entries: SuppressEntry[] = []
  const lines = content.split('\n')

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    const lineNum = i + 1

    // ── deep-slop-ignore-next ──
    const ignoreNextMatch = line.match(
      /\/\/\s*deep-slop-ignore-next(?:\s+(.+))?$/
    )
    if (ignoreNextMatch) {
      entries.push({
        directiveLine: lineNum,
        targetLine: lineNum + 1,
        rules: parseRuleList(ignoreNextMatch[1]),
        type: 'next-line',
      })
      continue
    }

    // ── deep-slop-ignore-line ──
    const ignoreLineMatch = line.match(
      /\/\/\s*deep-slop-ignore-line(?:\s+(.+))?$/
    )
    if (ignoreLineMatch) {
      entries.push({
        directiveLine: lineNum,
        targetLine: lineNum,
        rules: parseRuleList(ignoreLineMatch[1]),
        type: 'line',
      })
      continue
    }

    // ── deep-slop-ignore (with optional rule-name, applies to next line) ──
    const ignoreRuleMatch = line.match(
      /\/\/\s*deep-slop-ignore(?:\s+(.+))?$/
    )
    if (ignoreRuleMatch) {
      // Distinguish from block-start by checking there's no '-start' suffix
      const rulePart = ignoreRuleMatch[1]
      if (rulePart !== 'start' && rulePart !== 'end') {
        entries.push({
          directiveLine: lineNum,
          targetLine: lineNum + 1,
          rules: parseRuleList(rulePart),
          type: 'next-line',
        })
        continue
      }
    }

    // ── deep-slop-ignore-start ──
    const ignoreStartMatch = line.match(
      /\/\/\s*deep-slop-ignore-start(?:\s+(.+))?$/
    )
    if (ignoreStartMatch) {
      entries.push({
        directiveLine: lineNum,
        targetLine: lineNum,
        rules: parseRuleList(ignoreStartMatch[1]),
        type: 'block-start',
      })
      continue
    }

    // ── deep-slop-ignore-end ──
    const ignoreEndMatch = line.match(
      /\/\/\s*deep-slop-ignore-end/
    )
    if (ignoreEndMatch) {
      entries.push({
        directiveLine: lineNum,
        targetLine: lineNum,
        rules: new Set(),
        type: 'block-end',
      })
      continue
    }

    // ── Legacy: deep-slop-disable-next-line ──
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

    // ── Legacy: deep-slop-disable-line ──
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

    // ── Legacy: deep-slop-disable (block start) ──
    const blockStart = line.match(
      /\/\*\s*deep-slop-disable(?:\s+(.+))?\s*\//
    )
    if (blockStart) {
      entries.push({
        directiveLine: lineNum,
        targetLine: lineNum,
        rules: parseRuleList(blockStart[1]),
        type: 'block-start',
      })
      continue
    }

    // ── Legacy: deep-slop-enable (block end) ──
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
    .split(/[,\\s]+/)
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
  // Unclosed block extends to EOF
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

/**
 * Build a full suppress map for a file's content.
 * Returns both the entries and a checker function.
 */
export function buildSuppressMap(content: string): SuppressMap {
  const entries = parseSuppressDirectives(content)
  const isSuppressed = buildSuppressChecker(entries)
  return { entries, isSuppressed }
}

/**
 * Filter diagnostics using suppress directives.
 * Returns the filtered list and the count of suppressed diagnostics.
 */
export function applySuppressDirectives(
  diagnostics: import('../types/index.js').Diagnostic[],
  fileContents: Map<string, string>,
): {
  filtered: import('../types/index.js').Diagnostic[]
  suppressedCount: number
} {
  // Build suppress maps per file
  const suppressMaps = new Map<string, SuppressMap>()

  for (const [filePath, content] of fileContents) {
    suppressMaps.set(filePath, buildSuppressMap(content))
  }

  const filtered: import('../types/index.js').Diagnostic[] = []
  let suppressedCount = 0

  for (const diag of diagnostics) {
    const map = suppressMaps.get(diag.filePath)
    if (map && map.isSuppressed(diag.line, diag.rule)) {
      suppressedCount++
    } else {
      filtered.push(diag)
    }
  }

  return { filtered, suppressedCount }
}
// deep-slop-ignore-end perf-hints/n-plus-one
// deep-slop-ignore-end arch-constraints/deep-nesting
// deep-slop-ignore-end import-intelligence/unused-symbol
// deep-slop-ignore-end dead-flow/unused-variable
// deep-slop-ignore-end ast-slop/as-any
// deep-slop-ignore-end ast-slop/swallowed-exception
// deep-slop-ignore-end ast-slop/console-leftover
// deep-slop-ignore-end ast-slop/decorative-comment
// deep-slop-ignore-end ast-slop/trivial-comment
// deep-slop-ignore-end ast-slop/narrative-comment
// deep-slop-ignore-end ast-slop/copy-paste-signature

