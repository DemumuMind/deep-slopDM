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

// ── Terminal Color Theme ────────────────────────────────
// Named color palette using picocolors with NO_COLOR / --no-color support

import pc from 'picocolors'

/** Whether color output is disabled */
const noColor =
  process.env.NO_COLOR !== undefined ||
  process.argv.includes('--no-color')

/** Named theme colors */
const palette = {
  danger: pc.red,
  warn: pc.yellow,
  success: pc.green,
  muted: pc.gray,
  bold: pc.bold,
  info: pc.blue,
  suggestion: pc.cyan,
} as const

export type ThemeName = keyof typeof palette

/**
 * Apply a named theme color to text.
 * Respects NO_COLOR env var and --no-color CLI flag.
 */
export function style(name: ThemeName, text: string): string {
  if (noColor) return text
  return palette[name](text)
}

/** Bold + color combo */
export function styleBold(name: ThemeName, text: string): string {
  if (noColor) return text
  return pc.bold(palette[name](text))
}

/** Severity badge with color */
export function severityBadge(severity: string): string {
  switch (severity) {
    case 'error': return styleBold('danger', 'ERROR')
    case 'warning': return styleBold('warn', 'WARN')
    case 'info': return styleBold('info', 'INFO')
    case 'suggestion': return styleBold('suggestion', 'SUGG')
    default: return severity.toUpperCase()
  }
}

/** Score label with color */
export function scoreLabel(score: number): string {
  if (score >= 75) return styleBold('success', 'Healthy')
  if (score >= 50) return styleBold('warn', 'Needs Work')
  return styleBold('danger', 'Critical')
}

/** Muted separator line */
export function separator(): string {
  return style('muted', '  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
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
