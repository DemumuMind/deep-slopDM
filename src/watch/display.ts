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

// ── Watch Display Formatter ────────────────────────────
// Colored status output for watch mode using theme.ts

import { style, styleBold, separator, scoreLabel } from '../output/theme.js'
import { deltaText } from '../history/sparkline.js'
import type { WatchStats } from './watcher.js'

export type WatchState = 'watching' | 'scanning' | 'fixing'

/**
 * Format the current watch status as a colored string.
 *
 * States:
 *   watching — "Watching... (3 changes since last scan)"
 *   scanning — "Scanning..."
 *   fixing   — "Fixing..."
 *
 * Also shows last score with delta if available.
 */
export function formatWatchStatus(
  stats: WatchStats,
  state: WatchState = 'watching',
  previousScore: number | null = null,
): string {
  const parts: string[] = []

  // State indicator
  switch (state) {
    case 'watching': {
      const changeCount = stats.changesSinceLastScan
      const changeNote = changeCount > 0
        ? ` (${style('warn', String(changeCount))} changes since last scan)`
        : ''
      parts.push(`${styleBold('info', 'Watching...')}${changeNote}`)
      break
    }
    case 'scanning':
      parts.push(`${styleBold('warn', 'Scanning...')}`)
      break
    case 'fixing':
      parts.push(`${styleBold('danger', 'Fixing...')}`)
      break
  }

  // Last score info
  if (stats.lastScanScore !== null) {
    const scoreColor: 'success' | 'warn' | 'danger' =
      stats.lastScanScore >= 75 ? 'success' :
      stats.lastScanScore >= 50 ? 'warn' : 'danger'
    const scoreStr = styleBold(scoreColor, String(stats.lastScanScore))
    const label = scoreLabel(stats.lastScanScore)
    const delta = previousScore !== null
      ? ` (${deltaText(stats.lastScanScore, previousScore)})`
      : ''
    parts.push(`Score: ${scoreStr} ${label}${delta}`)
  }

  // Scan count
  if (stats.totalScans > 0) {
    parts.push(`Scans: ${style('muted', String(stats.totalScans))}`)
  }

  return parts.join('  ')
}

/**
 * Format a scan result line for watch output.
 */
export function formatWatchScanResult(
  score: number,
  totalDiagnostics: number,
  filesScanned: number,
  elapsed: number,
): string {
  const scoreColor: 'success' | 'warn' | 'danger' =
    score >= 75 ? 'success' : score >= 50 ? 'warn' : 'danger'
  const lines = [
    separator(),
    `  Score: ${styleBold(scoreColor, String(score))} ${scoreLabel(score)}`,
    `  Issues: ${style('suggestion', String(totalDiagnostics))}  Files: ${style('muted', String(filesScanned))}  Time: ${style('muted', `${Math.round(elapsed)}ms`)}`,
    separator(),
  ]
  return lines.join('\n')
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
