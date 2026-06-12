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

/** Options for computing the CI exit code */
export interface ExitCodeOptions {
  /** Whether any error-severity diagnostics were found */
  hasErrors: boolean
  /** Whether failOnErrors is enabled */
  failOnErrors: boolean
  /** Whether the project is scoreable (sufficient TS/JS coverage) */
  scoreable: boolean
  /** The quality score (0-100) */
  score: number
  /** Score threshold below which to fail */
  failBelow: number
}

/**
 * Compute the exit code for CI mode.
 *
 * - If hasErrors AND failOnErrors: return 1
 * - If scoreable AND score < failBelow: return 1
 * - If !scoreable: return 0 (can't judge — no penalty)
 * - Else: return 0
 */
export function computeExitCode(options: ExitCodeOptions): number {
  if (options.hasErrors && options.failOnErrors) {
    return 1
  }

  if (!options.scoreable) {
    return 0
  }

  if (options.score < options.failBelow) {
    return 1
  }

  return 0
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
