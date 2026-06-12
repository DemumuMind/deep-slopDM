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

// ── Finding Assessment ──────────────────────────────────
// Assess diagnostic complexity and estimated effort

import type { Diagnostic } from '../types/index.js'

export type Complexity = 'trivial' | 'simple' | 'moderate' | 'complex'

export interface DiagnosticAssessment {
  complexity: Complexity
  estimatedEffort: string
  priority: number
}

export interface AssessmentSummary {
  total: number
  byComplexity: Record<Complexity, number>
  estimatedTotalEffort: string
  topPriority: number
}

/**
 * Assess a single diagnostic's complexity and effort.
 *
 * - trivial: fixable suggestions with confidence > 0.8 (~1 min)
 * - simple: fixable with lower confidence or remove-only (~5 min)
 * - moderate: requires code change + test (~15 min)
 * - complex: architectural change needed (~60 min)
 */
export function assessDiagnostic(diag: Diagnostic): DiagnosticAssessment {
  const hasSuggestion = diag.suggestion != null
  const confidence = diag.suggestion?.confidence ?? 0
  const isDelete = diag.suggestion?.type === 'delete'
  const isFixable = diag.fixable
  const severity = diag.severity
  const category = diag.category

  // Complex: architectural issues, non-fixable security/architecture errors
  if (
    category === 'architecture' ||
    (severity === 'error' && !isFixable) ||
    (severity === 'error' && category === 'security')
  ) {
    return { complexity: 'complex', estimatedEffort: '60 min', priority: 4 }
  }

  // Moderate: fixable errors, or non-trivial warnings requiring code + test
  if (
    severity === 'error' ||
    (severity === 'warning' && isFixable && !hasSuggestion) ||
    (severity === 'warning' && category === 'security') ||
    (severity === 'warning' && category === 'performance')
  ) {
    return { complexity: 'moderate', estimatedEffort: '15 min', priority: 3 }
  }

  // Simple: fixable with lower confidence or remove-only suggestions
  if (
    (isFixable && hasSuggestion && confidence <= 0.8) ||
    isDelete ||
    (severity === 'warning' && !isFixable) ||
    (severity === 'info' && !isFixable)
  ) {
    return { complexity: 'simple', estimatedEffort: '5 min', priority: 2 }
  }

  // Trivial: fixable suggestions with high confidence
  if (isFixable && hasSuggestion && confidence > 0.8) {
    return { complexity: 'trivial', estimatedEffort: '1 min', priority: 1 }
  }

  // Default fallback: info/suggestion level
  return { complexity: 'simple', estimatedEffort: '5 min', priority: 2 }
}

const EFFORT_MINUTES: Record<Complexity, number> = {
  trivial: 1,
  simple: 5,
  moderate: 15,
  complex: 60,
}

function formatEffort(totalMinutes: number): string {
  if (totalMinutes < 60) {
    return `${totalMinutes} min`
  }
  const hours = Math.floor(totalMinutes / 60)
  const mins = totalMinutes % 60
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`
}

/**
 * Summarize assessments across all diagnostics.
 */
export function summarizeAssessments(diagnostics: Diagnostic[]): AssessmentSummary {
  const assessments = diagnostics.map(assessDiagnostic)

  const byComplexity: Record<Complexity, number> = {
    trivial: 0,
    simple: 0,
    moderate: 0,
    complex: 0,
  }

  let totalMinutes = 0
  let topPriority = 0

  for (const a of assessments) {
    byComplexity[a.complexity]++
    totalMinutes += EFFORT_MINUTES[a.complexity]
    if (a.priority > topPriority) {
      topPriority = a.priority
    }
  }

  return {
    total: diagnostics.length,
    byComplexity,
    estimatedTotalEffort: formatEffort(totalMinutes),
    topPriority,
  }
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
