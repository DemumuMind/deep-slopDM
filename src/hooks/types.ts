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

/** Dependency audit options (re-exported for convenience) */
export type DepAuditOptions = import('./dep-audit.js').DepAuditOptions

/** Dependency audit result (re-exported for convenience) */
export type DepAuditResult = import('./dep-audit.js').DepAuditResult

/** Sentinel check options (re-exported for convenience) */
export type SentinelOptions = import('./sentinel.js').SentinelOptions

/** Sentinel check result (re-exported for convenience) */
export type SentinelCheckResult = import('./sentinel.js').SentinelCheckResult

/** Sentinel issue (re-exported for convenience) */
export type SentinelIssue = import('./sentinel.js').SentinelIssue

