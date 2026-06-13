/** Options for computing the CI exit code */
export interface ExitCodeOptions {
  /** Whether any error-severity diagnostics were found */
  hasErrors: boolean
  /** Whether failOnErrors is enabled */
  failOnErrors: boolean
  /** Whether the project is scoreable (sufficient TS/JS coverage) */
  scoreable: boolean
  /** The quality score (0-100), or null if not scoreable */
  score: number | null
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

  if (options.score !== null && options.score < options.failBelow) {
    return 1
  }

  return 0
}

