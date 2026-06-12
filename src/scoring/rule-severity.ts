import type { Severity } from '../types/index.js'

/**
 * Per-severity weight mapping.
 * Errors hurt most, suggestions are mild.
 * These weights are multiplied by the rule's impact multiplier
 * to get the per-diagnostic deduction.
 */
export const SEVERITY_WEIGHTS: Record<Severity, number> = {
  error: 10,
  warning: 1,
  info: 0,
  suggestion: 0,
}

/** Get the weight for a severity level */
export function getSeverityWeight(severity: Severity): number {
  return SEVERITY_WEIGHTS[severity]
}
