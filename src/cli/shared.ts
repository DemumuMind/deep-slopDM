// ── Shared CLI helpers ─────────────────────────────────────

import { style, styleBold, separator, severityBadge } from '../output/theme.js'
import type { RuleInfo } from '../engines/catalog.js'

export type OutputFormat = 'human' | 'json' | 'sarif'

/** Parse an optional integer option value */
export function parseOptInt(value: string | undefined): number | undefined {
  if (value === undefined) return undefined
  const parsed = parseInt(value, 10)
  return Number.isNaN(parsed) ? undefined : parsed
}

/** Truncate a code snippet for display */
export function truncateSnippet(text: string, maxLen: number): string {
  const oneLine = text.replace(/\n/g, '↵')
  if (oneLine.length <= maxLen) return oneLine
  return oneLine.slice(0, maxLen - 3) + '...'
}

/** Tier display badge */
function tierBadge(tier: string): string {
  const colors: Record<string, () => string> = {
    strict: () => styleBold('danger', 'STRICT'),
    standard: () => styleBold('danger', 'STD'),
    maintainability: () => styleBold('warn', 'MNTN'),
    mechanical: () => style('info', 'MECH'),
    style: () => style('muted', 'STYLE'),
    advisory: () => style('muted', 'ADVI'),
  }
  return (colors[tier] ?? (() => tier))()
}

/** Print a list of rules in columnar format */
export function printRuleList(rules: RuleInfo[], indent = '  '): void {
  for (const rule of rules) {
    const icon = rule.severity === 'error' ? style('danger', '✗')
      : rule.severity === 'warning' ? style('warn', '○')
      : style('muted', '·')
    const namePart = rule.id.includes('/') ? rule.id.split('/')[1] : rule.id
    const tierStr = tierBadge(rule.impactTier)
    const sevStr = severityBadge(rule.severity)
    const fixStr = rule.fixable ? style('success', 'fixable') : ''
    const namePad = namePart.padEnd(28)
    console.log(`${indent}${icon} ${namePad} ${tierStr}  ${sevStr}  ${fixStr}`)
  }
}
