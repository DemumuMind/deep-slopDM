// ── Fix Pipeline Types ─────────────────────────────────

/** A single fix step targeting a specific code range */
export interface FixStep {
  /** File path relative to root */
  filePath: string
  /** Start line of the range to replace (1-based) */
  startLine: number
  /** End line of the range to replace (1-based, inclusive) */
  endLine: number
  /** Original text to find and replace */
  oldText: string
  /** Replacement text */
  newText: string
  /** Rule that produced this fix (e.g. "ai-slop/narrative-comment") */
  rule: string
  /** Confidence level 0-1 from the diagnostic suggestion */
  confidence: number
}

/** A plan of fix steps to apply */
export interface FixPlan {
  /** Ordered list of fix steps (bottom-up within each file) */
  steps: FixStep[]
  /** Number of distinct files affected */
  fileCount: number
  /** Number of diagnostics addressed */
  diagnosticCount: number
}

/** Result of applying a fix plan */
export interface FixResult {
  /** Number of files modified */
  filesModified: number
  /** Number of diagnostics fixed */
  diagnosticsFixed: number
  /** Score before fixes were applied */
  scoreBefore: number
  /** Score after fixes were applied (same as scoreBefore if dryRun) */
  scoreAfter: number
  /** Whether a rollback was performed */
  rolledBack: boolean
  /** Errors encountered during fix application */
  errors: string[]
}

/** Options for the fix pipeline */
export interface FixOptions {
  /** 'safe' = only confidence >= 0.8, 'force' = all fixable */
  mode: 'safe' | 'force'
  /** If true, compute plan but don't modify files */
  dryRun: boolean
  /** If true, re-scan after fix and rollback if score worsened */
  verify: boolean
}
