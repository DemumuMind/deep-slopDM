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

import type { Severity } from '../types/index.js'

/** Scoring mode — logarithmic (density-aware) or linear (legacy) */
export type ScoringMode = 'logarithmic' | 'linear'

/** Impact tier for a rule — determines multiplier and per-rule cap */
export type ImpactTier =
  | 'strict'          // security vulns, eval, secrets, unreachable code
  | 'standard'        // narrative comments, circular deps, as-any casts
  | 'maintainability' // high coupling, god files, deep nesting
  | 'mechanical'      // trivial comments, CRLF, config issues
  | 'style'           // decorative comments, console leftovers
  | 'advisory'        // React missing memo, i18n issues, perf hints

/** Per-rule impact configuration */
export interface RuleImpact {
  /** Which impact tier this rule belongs to */
  tier: ImpactTier
  /** Score multiplier applied to severity weight */
  multiplier: number
  /** Max number of diagnostics from this rule that count toward score */
  cap: number
  /** Human-readable explanation of the tier assignment */
  rationale: string
}

/** Full scoring configuration */
export interface ScoringConfig {
  /** Scoring mode to use */
  mode: ScoringMode
  /** Per-severity weight mapping */
  severityWeights: Record<Severity, number>
  /** Default engine weight (1.0 = no bias) */
  defaultEngineWeight: number
  /** Smoothing factor for density calculation (prevents div-by-zero) */
  smoothing: number
  /** Maximum deduction per rule (caps impact of noisy rules) */
  maxPerRule: number
  /** Per-tier defaults: multiplier and cap */
  tierDefaults: Record<ImpactTier, { multiplier: number; cap: number }>
}

/** Score band labels */
export type ScoreLabel = 'Healthy' | 'Needs Work' | 'Critical'

/** Result of scoring calculation */
export interface ScoringResult {
  /** Final score 0-100 */
  score: number
  /** Human-readable label */
  label: ScoreLabel
  /** Density factor (0-1) used in logarithmic mode */
  density: number
  /** Total deduction before scaling */
  totalDeduction: number
  /** Deduction after density scaling */
  scaledDeduction: number
  /** Number of diagnostics that were capped (skipped) */
  cappedCount: number
  /** Scoring mode used */
  mode: ScoringMode
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
