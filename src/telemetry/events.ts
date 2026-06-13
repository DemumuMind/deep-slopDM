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

