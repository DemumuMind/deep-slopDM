// deep-slop-ignore-start ast-slop/copy-paste-signature
// deep-slop-ignore-start ast-slop/narrative-comment
// deep-slop-ignore-start ast-slop/trivial-comment
// deep-slop-ignore-start ast-slop/decorative-comment
// ── Rich Grouped Terminal Output ────────────────────────
// Groups diagnostics by engine, then by rule.
// Uses the theme system for all colors and maskSecrets for messages.

import type { ScanResult, Severity, Diagnostic, EngineName } from '../types/index.js'
import { style, styleBold, severityBadge, scoreLabel, separator } from './theme.js'
import { ruleLabel } from './rule-labels.js'
import { maskSecrets } from '../utils/source-mask.js'

/** Severity sort order */
const SEV_ORDER: Record<Severity, number> = { error: 0, warning: 1, info: 2, suggestion: 3 }

/** Group diagnostics by engine, then by rule */
function groupDiagnostics(diagnostics: Diagnostic[]): Map<string, Map<string, Diagnostic[]>> {
  const byEngine = new Map<string, Map<string, Diagnostic[]>>()

  for (const d of diagnostics) {
    let ruleMap = byEngine.get(d.engine)
    if (!ruleMap) {
      ruleMap = new Map()
      byEngine.set(d.engine, ruleMap)
    }
    let list = ruleMap.get(d.rule)
    if (!list) {
      list = []
      ruleMap.set(d.rule, list)
    }
    list.push(d)
  }

  return byEngine
}

/** Format a location as `file:line:col` */
function formatLoc(d: Diagnostic): string {
  return `${d.filePath}:${d.line}:${d.column}`
}

/** Get the worst severity in a list of diagnostics */
function worstSeverity(diags: Diagnostic[]): Severity {
  let worst: Severity = 'suggestion'
  for (const d of diags) {
    if (SEV_ORDER[d.severity] < SEV_ORDER[worst]) worst = d.severity
  }
  return worst
}

/** Format scan result for terminal output — grouped by engine, then by rule */
export function formatOutput(result: ScanResult): string {
  const lines: string[] = []

  // Header
  lines.push('')
  lines.push(separator())
  lines.push(styleBold('info', '  deep-slop scan results'))
  lines.push(separator())
  lines.push('')

  // Score + meta
  const scoreStr = `${result.score}/100`
  lines.push(`  ${scoreLabel(result.score)} Score: ${scoreStr}`)
  if (result.meta.diffScope) {
    lines.push(`  ${style('info', `Scanning ${result.meta.diffScope} file(s)`)}`)
  }
  lines.push(`  ${style('muted', 'Files:')} ${result.meta.filesScanned} | ${style('muted', 'Time:')} ${Math.round(result.meta.elapsed)}ms`)
  lines.push(`  ${style('muted', 'Languages:')} ${result.meta.languages.join(', ')}`)
  lines.push(`  ${style('muted', 'Frameworks:')} ${result.meta.frameworks.join(', ')}`)
  lines.push('')

  // Severity breakdown
  lines.push('  Issues by severity:')
  lines.push(`    ${severityBadge('error')}   ${result.bySeverity.error}`)
  lines.push(`    ${severityBadge('warning')}    ${result.bySeverity.warning}`)
  lines.push(`    ${severityBadge('info')}    ${result.bySeverity.info}`)
  lines.push(`    ${severityBadge('suggestion')}    ${result.bySeverity.suggestion}`)
  lines.push('')

  // Grouped diagnostics by engine, then rule
  const allDiags = result.engines
    .filter((e) => !e.skipped)
    .flatMap((e) => e.diagnostics)

  const grouped = groupDiagnostics(allDiags)

  if (grouped.size > 0) {
    for (const [engine, ruleMap] of grouped) {
      // Engine header
      const engineElapsed = result.engines.find((e) => e.engine === engine as EngineName)
      const elapsed = engineElapsed ? Math.round(engineElapsed.elapsed) : 0
      const diagCount = Array.from(ruleMap.values()).reduce((s, l) => s + l.length, 0)

      lines.push(`  ${styleBold('info', engine)} ${style('muted', `(${diagCount} issues, ${elapsed}ms)`)}`)
      lines.push('')

      // Sort rules by worst severity, then by count
      const sortedRules = Array.from(ruleMap.entries()).sort((a, b) => {
        const sevDiff = SEV_ORDER[worstSeverity(a[1])] - SEV_ORDER[worstSeverity(b[1])]
        if (sevDiff !== 0) return sevDiff
        return b[1].length - a[1].length
      })

      for (const [ruleId, diags] of sortedRules) {
        const label = ruleLabel(ruleId)
        const badge = severityBadge(worstSeverity(diags))
        const count = diags.length

        // Rule header
        lines.push(`    ${badge} ${styleBold('warn', label)} ${style('muted', `(${count})`)}`)

        // Top 3 locations
        const topDiags = diags.slice(0, 3)
        for (const d of topDiags) {
          const msg = maskSecrets(d.message)
          lines.push(`      ${style('muted', formatLoc(d))} ${msg}`)
        }

        // "+N more" if there are additional occurrences
        if (count > 3) {
          lines.push(style('muted', `      +${count - 3} more`))
        }

        lines.push('')
      }
    }
  } else {
    lines.push(`  ${styleBold('success', 'No issues found! Code looks clean.')}`)
    lines.push('')
  }

  // Skipped engines
  const skipped = result.engines.filter((e) => e.skipped)
  if (skipped.length > 0) {
    lines.push(style('muted', '  Skipped engines:'))
    for (const e of skipped) {
      lines.push(style('muted', `    ${e.engine}: ${e.skipReason}`))
    }
    lines.push('')
  }

  // Final summary
  lines.push(separator())
  lines.push(`  ${scoreLabel(result.score)} ${result.score}/100 — ${result.totalDiagnostics} total diagnostics`)
  lines.push(separator())
  lines.push('')

  return lines.join('\n')
}
// deep-slop-ignore-end ast-slop/decorative-comment
// deep-slop-ignore-end ast-slop/trivial-comment
// deep-slop-ignore-end ast-slop/narrative-comment
// deep-slop-ignore-end ast-slop/copy-paste-signature

