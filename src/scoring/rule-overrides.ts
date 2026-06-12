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

import type { Diagnostic, Severity } from '../types/index.js'

/** Valid severity override values */
export type RuleSeverityOverride = 'error' | 'warning' | 'info' | 'off'

/**
 * Apply per-rule severity overrides to a list of diagnostics.
 *
 * - If a rule's override is "off": the diagnostic is removed (filtered out).
 * - If a rule's override is "error"/"warning"/"info": the diagnostic's severity is rewritten.
 * - Override keys ending with "/*" act as wildcard prefixes, matching all rules
 *   that start with that prefix (e.g. "ast-slop/*" matches "ast-slop/narrative-comment").
 *
 * Exact-match overrides take precedence over wildcard overrides.
 * CLI overrides (passed separately) should be merged into the overrides map
 * before calling this function, with CLI values taking priority.
 *
 * @param diagnostics - Raw diagnostics from all engines
 * @param overrides - Map of rule-id (or prefix with /*) to severity override
 * @returns Filtered and re-severitized diagnostics
 */
export function applyRuleSeverities(
  diagnostics: Diagnostic[],
  overrides: Record<string, RuleSeverityOverride>,
): Diagnostic[] {
  if (!overrides || Object.keys(overrides).length === 0) {
    return diagnostics
  }

  // Separate wildcard overrides from exact overrides
  const wildcardPrefixes: Array<{ prefix: string; severity: RuleSeverityOverride }> = []
  const exactOverrides: Record<string, RuleSeverityOverride> = {}

  for (const [key, severity] of Object.entries(overrides)) {
    if (key.endsWith('/*')) {
      wildcardPrefixes.push({ prefix: key.slice(0, -2), severity })
    } else {
      exactOverrides[key] = severity
    }
  }

  const severityMap: Record<string, Severity> = {
    error: 'error',
    warning: 'warning',
    info: 'info',
  }

  const result: Diagnostic[] = []

  for (const d of diagnostics) {
    // Check exact match first (takes precedence)
    let override = exactOverrides[d.rule]

    // Fall back to wildcard match if no exact match
    if (!override) {
      for (const wc of wildcardPrefixes) {
        if (d.rule.startsWith(wc.prefix)) {
          override = wc.severity
          break
        }
      }
    }

    // No override found — keep diagnostic as-is
    if (!override) {
      result.push(d)
      continue
    }

    // "off" means remove the diagnostic entirely
    if (override === 'off') {
      continue
    }

    // Rewrite severity
    const newSeverity = severityMap[override]
    if (newSeverity && newSeverity !== d.severity) {
      result.push({ ...d, severity: newSeverity })
    } else {
      result.push(d)
    }
  }

  return result
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
