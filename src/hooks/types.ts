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

// ── Hook Types ──────────────────────────────────────────
// Type definitions for the deep-slop hook system

/** Supported hook providers (AI coding tools) */
export type HookProvider = 'claude' | 'cursor' | 'gemini' | 'cline'

/** Options for installing a hook */
export interface HookInstall {
  /** Which provider to install the hook for */
  provider: HookProvider
  /** Scope: global (user-level) or project-level */
  scope: 'global' | 'project'
  /** Whether to enable quality gate (score comparison against baseline) */
  qualityGate: boolean
}

/** Status of an installed hook */
export interface HookStatus {
  /** Which provider this status refers to */
  provider: HookProvider
  /** Whether the hook is installed */
  installed: boolean
  /** Scope of the installation ('global', 'project', or 'none') */
  scope: string
  /** Whether quality gate is enabled */
  qualityGate: boolean
  /** Path to the config file that contains the hook */
  path: string
}

/** Baseline data for quality gate comparisons */
export interface BaselineData {
  /** The score captured at baseline time */
  score: number
  /** ISO timestamp of when the baseline was captured */
  timestamp: string
  /** Summary of diagnostics at baseline */
  diagnostics: {
    total: number
    errors: number
    warnings: number
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
