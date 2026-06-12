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

// ── Telemetry Event Names ──────────────────────────────
// Centralized event name constants for telemetry tracking

export const EVENTS = {
  /** CLI command executed */
  COMMAND_RUN: 'command_run',
  /** Scan completed */
  SCAN_COMPLETE: 'scan_complete',
  /** Fix completed */
  FIX_COMPLETE: 'fix_complete',
  /** CI gate result */
  CI_RESULT: 'ci_result',
  /** Agent repair session completed */
  AGENT_REPAIR_COMPLETE: 'agent_repair_complete',
  /** Hook installed */
  HOOK_INSTALL: 'hook_install',
  /** Hook triggered */
  HOOK_TRIGGER: 'hook_trigger',
  /** Doctor check ran */
  DOCTOR_CHECK: 'doctor_check',
  /** Config initialized */
  INIT_CONFIG: 'init_config',
  /** Watch session started */
  WATCH_START: 'watch_start',
  /** Update notification shown */
  UPDATE_NOTIFICATION: 'update_notification',
} as const

export type EventName = (typeof EVENTS)[keyof typeof EVENTS]

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
