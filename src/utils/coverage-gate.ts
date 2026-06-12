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

import type { Language } from '../types/index.js'

/** Supported languages that count toward scoreability */
const SCOREABLE_LANGUAGES: Set<Language> = new Set([
  'typescript',
  'javascript',
])

/** Coverage assessment result */
export interface CoverageInfo {
  /** Total source files detected */
  totalFiles: number
  /** Files in supported languages (TS/JS/TSX/JSX) */
  scoreableFiles: number
  /** Ratio of scoreable files to total files (0-1) */
  coverage: number
  /** The most common language among scoreable files */
  dominantLanguage: Language | null
  /** Whether the project has enough supported files to be scored */
  isScoreable: boolean
  /** If not scoreable, explains why */
  reason?: string
}

const COVERAGE_THRESHOLD = 0.3

/**
 * Assess whether a project has enough supported-language files
 * to produce a meaningful quality score.
 *
 * If supported files (TS/JS/TSX/JSX) are < 30% of total files,
 * the project is considered not scoreable.
 */
export function assessCoverage(
  languages: Language[],
  totalFiles: number,
): CoverageInfo {
  if (totalFiles === 0) {
    return {
      totalFiles: 0,
      scoreableFiles: 0,
      coverage: 0,
      dominantLanguage: null,
      isScoreable: false,
      reason: 'No source files found',
    }
  }

  const scoreableLangs = languages.filter((l) => SCOREABLE_LANGUAGES.has(l))
  const scoreableFiles = scoreableLangs.length > 0
    ? Math.round(totalFiles * (scoreableLangs.length / languages.length))
    : 0

  const coverage = scoreableFiles / totalFiles
  const dominantLanguage = scoreableLangs[0] ?? languages[0] ?? null

  if (coverage < COVERAGE_THRESHOLD) {
    return {
      totalFiles,
      scoreableFiles,
      coverage,
      dominantLanguage,
      isScoreable: false,
      reason: `Only ${Math.round(coverage * 100)}% of files are in supported languages (TS/JS/TSX/JSX). Threshold is ${COVERAGE_THRESHOLD * 100}%.`,
    }
  }

  return {
    totalFiles,
    scoreableFiles,
    coverage,
    dominantLanguage,
    isScoreable: true,
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
