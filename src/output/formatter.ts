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
  const scoreStr = result.score !== null ? `${result.score}/100` : '\u2014'
  const scoreDisplay = result.score !== null ? result.score : 0
  lines.push(`  ${scoreLabel(scoreDisplay)} Score: ${scoreStr}${result.score === null ? ' (majority of files in unsupported languages)' : ''}`)
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
  if (result.suppressedCount > 0) {
    lines.push(`    ||suppressed||    ${result.suppressedCount} (hidden by .deep-slop-ignore or inline suppress)`)
  }
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

  // Top 10 findings section
  if (allDiags.length > 0) {
    lines.push(separator())
    lines.push(styleBold('info', '  Top findings'))
    lines.push('')

    // Aggregate by rule
    const ruleAgg = new Map<string, { count: number, severity: Severity, fixable: number }>()
    for (const d of allDiags) {
      const existing = ruleAgg.get(d.rule)
      if (!existing) {
        ruleAgg.set(d.rule, { count: 1, severity: d.severity, fixable: d.fixable ? 1 : 0 })
      } else {
        existing.count++
        // Keep worst severity
        if (SEV_ORDER[d.severity] < SEV_ORDER[existing.severity]) {
          existing.severity = d.severity
        }
        if (d.fixable) existing.fixable++
      }
    }

    const topFindings = Array.from(ruleAgg.entries())
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 10)

    for (const [ruleId, info] of topFindings) {
      const label = ruleLabel(ruleId)
      const badge = severityBadge(info.severity)
      const fixStr = info.fixable > 0 ? style('success', ` (${info.fixable} fixable)`) : ''
      lines.push(`    ${badge} ${styleBold('warn', label)} ${style('muted', `(${info.count})`)}${fixStr}`)
    }
    lines.push('')
  }

  // Final summary
  const summaryScoreStr = result.score !== null ? `${result.score}/100` : '\u2014'
  const summaryScoreDisplay = result.score !== null ? result.score : 0
  lines.push(separator())
  lines.push(`  ${scoreLabel(summaryScoreDisplay)} ${summaryScoreStr} — ${result.totalDiagnostics} total diagnostics${result.score === null ? ' (score withheld: unsupported languages)' : ''}`)
  lines.push(separator())
  lines.push('')

  return lines.join('\n')
}

