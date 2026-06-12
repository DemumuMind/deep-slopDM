import type { Diagnostic, Severity } from '../types/index.js'
import type { ScoringConfig, ScoringMode, ScoringResult, ScoreLabel } from './types.js'
import { TIER_DEFAULTS, getRuleImpact } from './rule-impact.js'
import { SEVERITY_WEIGHTS } from './rule-severity.js'

/** Default scoring configuration */
export const DEFAULT_SCORING_CONFIG: ScoringConfig = {
  mode: 'logarithmic',
  severityWeights: { ...SEVERITY_WEIGHTS },
  defaultEngineWeight: 1.0,
  smoothing: 5000,
  maxPerRule: 5,
  tierDefaults: { ...TIER_DEFAULTS },
}

/**
 * Classify a score into a human-readable label.
 *   Healthy:   >= 75
 *   Needs Work: >= 50
 *   Critical:   < 50
 */
export function scoreLabel(score: number): ScoreLabel {
  if (score >= 75) return 'Healthy'
  if (score >= 50) return 'Needs Work'
  return 'Critical'
}

/**
 * Density-aware logarithmic scoring (aislop formula).
 *
 * density = min(1, diagnostics.length / (fileCount + smoothing))
 * totalDeduction = sum(severityWeight * ruleMultiplier * engineWeight) [skip if rule count > cap]
 * scaledDeduction = totalDeduction * density
 * score = round(100 - (100 * log1p(scaledDeduction)) / log1p(100 + scaledDeduction))
 */
function calculateLogarithmic(
  diagnostics: Diagnostic[],
  fileCount: number,
  config: ScoringConfig,
): ScoringResult {
  const smoothing = config.smoothing
  const maxPerRule = config.maxPerRule

  // Density: how concentrated are the *actionable* issues relative to the codebase size?
  // Only count error+warning for density — info/suggestion are informational and don't indicate poor quality
  const actionableCount = diagnostics.filter(d => d.severity === 'error' || d.severity === 'warning').length
  const density = Math.min(1, actionableCount / (fileCount + smoothing))

  // Track per-rule counts for capping
  const ruleCounts = new Map<string, number>()
  const ruleDeductions = new Map<string, number>()
  let totalDeduction = 0
  let cappedCount = 0

  for (const d of diagnostics) {
    const impact = getRuleImpact(d.rule)

    // Increment per-rule count
    const prev = ruleCounts.get(d.rule) ?? 0
    ruleCounts.set(d.rule, prev + 1)

    // Skip if this rule has exceeded its cap
    if (prev >= impact.cap) {
      cappedCount++
      continue
    }

    const severityWeight = config.severityWeights[d.severity]
    const ruleMultiplier = impact.multiplier
    const engineWeight = config.defaultEngineWeight

    const deduction = severityWeight * ruleMultiplier * engineWeight

    // Track per-rule deduction and cap at maxPerRule
    const prevDeduction = ruleDeductions.get(d.rule) ?? 0
    if (prevDeduction + deduction > maxPerRule) {
      const allowed = maxPerRule - prevDeduction
      if (allowed > 0) {
        totalDeduction += allowed
        ruleDeductions.set(d.rule, maxPerRule)
      }
      cappedCount++
    } else {
      totalDeduction += deduction
      ruleDeductions.set(d.rule, prevDeduction + deduction)
    }
  }

  // Scale by density — sparse issues in a large codebase are less concerning
  const scaledDeduction = totalDeduction * density

  // Logarithmic compression: diminishing returns as deduction grows
  // score = 100 - (100 * log1p(scaledDeduction)) / log1p(100 + scaledDeduction)
  const numerator = 100 * Math.log1p(scaledDeduction)
  const denominator = Math.log1p(100 + scaledDeduction)
  const rawScore = 100 - numerator / denominator
  const score = Math.round(Math.max(0, Math.min(100, rawScore)))

  return {
    score,
    label: scoreLabel(score),
    density,
    totalDeduction,
    scaledDeduction,
    cappedCount,
    mode: 'logarithmic',
  }
}

/**
 * Legacy linear scoring (old formula).
 * score = max(0, 100 - sum(penalties))
 * Each diagnostic contributes severityWeight * ruleMultiplier.
 */
function calculateLinear(
  diagnostics: Diagnostic[],
  config: ScoringConfig,
): ScoringResult {
  const ruleCounts = new Map<string, number>()
  let totalPenalty = 0
  let cappedCount = 0

  for (const d of diagnostics) {
    const impact = getRuleImpact(d.rule)

    const prev = ruleCounts.get(d.rule) ?? 0
    ruleCounts.set(d.rule, prev + 1)

    if (prev >= impact.cap) {
      cappedCount++
      continue
    }

    const severityWeight = config.severityWeights[d.severity]
    const ruleMultiplier = impact.multiplier
    totalPenalty += severityWeight * ruleMultiplier
  }

  const score = Math.max(0, Math.round(100 - totalPenalty))

  return {
    score,
    label: scoreLabel(score),
    density: 0,
    totalDeduction: totalPenalty,
    scaledDeduction: totalPenalty,
    cappedCount,
    mode: 'linear',
  }
}

/**
 * Calculate score using the configured mode.
 *
 * @param diagnostics - All diagnostics from the scan
 * @param fileCount - Number of files scanned (for density calculation)
 * @param config - Scoring configuration (uses defaults if omitted)
 * @returns Detailed scoring result
 */
export function calculateScore(
  diagnostics: Diagnostic[],
  fileCount: number,
  config: ScoringConfig = DEFAULT_SCORING_CONFIG,
): ScoringResult {
  if (config.mode === 'linear') {
    return calculateLinear(diagnostics, config)
  }
  return calculateLogarithmic(diagnostics, fileCount, config)
}

// Re-export types and helpers for convenience
export type { ScoringConfig, ScoringMode, ScoringResult, ScoreLabel, ImpactTier, RuleImpact } from './types.js'
export { getRuleImpact, RULE_IMPACT, TIER_DEFAULTS, DEFAULT_IMPACT } from './rule-impact.js'
export { SEVERITY_WEIGHTS, getSeverityWeight } from './rule-severity.js'
