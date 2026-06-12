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
  /** Diff hunks for dry-run display (populated when dryRun=true) */
  diffs: FixDiff[]
}

/** Options for the fix pipeline */
export interface FixOptions {
  /** 'safe' = only confidence >= 0.8, 'force' = all fixable */
  mode: 'safe' | 'force'
  /** If true, compute plan but don't modify files */
  dryRun: boolean
  /** If true, re-scan after fix and rollback if score worsened */
  verify: boolean
  /** If true, show detailed plan with before/after snippets and confirmation prompt */
  plan?: boolean
  /** If set, only fix diagnostics matching these rule IDs (e.g. ['ast-slop/console-leftover']) */
  rules?: string[]
}

/** A single diff hunk for dry-run display */
export interface FixDiff {
  /** File path relative to root */
  filePath: string
  /** Rule that produced this fix */
  rule: string
  /** Line being changed (1-based) */
  line: number
  /** Original content of the line(s) */
  before: string
  /** Replacement content (empty string for deletions) */
  after: string
  /** Confidence of this fix */
  confidence: number
}

/** A single item in the preview plan output */
export interface PlanPreviewItem {
  /** File path relative to root */
  filePath: string
  /** Rule that produced this fix */
  rule: string
  /** Original code (before) snippet */
  before: string
  /** Replacement code (after) snippet */
  after: string
  /** Confidence of the fix */
  confidence: number
  /** Start line (1-based) */
  startLine: number
  /** End line (1-based) */
  endLine: number
}

/** Result of a plan preview run */
export interface PlanPreviewResult {
  /** Items in the plan */
  items: PlanPreviewItem[]
  /** Distinct files that will be modified */
  filesAffected: string[]
  /** Total number of diagnostics addressed */
  diagnosticsAddressed: number
  /** Current score */
  scoreBefore: number
  /** Estimated score after applying all fixes */
  estimatedScoreAfter: number
  /** Estimated effort level */
  estimatedEffort: 'low' | 'medium' | 'high'
}
