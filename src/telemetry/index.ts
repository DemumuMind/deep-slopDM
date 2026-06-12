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

// ── Telemetry (opt-in only) ────────────────────────────
// Privacy-respecting, fire-and-forget telemetry

import { APP_VERSION } from '../version.js'
import { EVENTS } from './events.js'

const TELEMETRY_ENDPOINT = 'https://telemetry.deep-slop.dev/v1/track'

/** Check if telemetry is enabled via env or config */
export function isTelemetryEnabled(): boolean {
  // Explicit opt-in required
  if (process.env.DEEP_SLOP_TELEMETRY === '1') return true

  // Check for DO_NOT_TRACK
  if (process.env.DO_NOT_TRACK === '1') return false

  // Disabled by default
  return false
}

/** Sanitize properties — strip PII and file paths */
function sanitizeProperties(
  properties?: Record<string, unknown>,
): Record<string, unknown> {
  if (!properties) return {}

  const sanitized: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(properties)) {
    // Skip any key that looks like it might contain paths or PII
    const lower = key.toLowerCase()
    if (lower.includes('path') || lower.includes('file') || lower.includes('dir')) continue
    if (lower.includes('name') || lower.includes('email') || lower.includes('user')) continue
    if (lower.includes('token') || lower.includes('key') || lower.includes('secret')) continue

    // For string values, strip anything that looks like a file path
    if (typeof value === 'string') {
      if (value.includes('/') || value.includes('\\')) continue
      if (value.includes('@') && value.includes('.')) continue // email-like
    }

    sanitized[key] = value
  }

  return sanitized
}

/** Build the base payload with non-PII metadata */
function buildPayload(
  name: string,
  properties?: Record<string, unknown>,
): Record<string, unknown> {
  return {
    event: name,
    version: APP_VERSION,
    os: process.platform,
    arch: process.arch,
    node: process.version,
    timestamp: new Date().toISOString(),
    ...sanitizeProperties(properties),
  }
}

/**
 * Track a telemetry event (fire-and-forget).
 *
 * No PII, no file paths — just: version, OS, command, engine counts, score bucket.
 * Respects DO_NOT_TRACK=1 and requires explicit opt-in.
 */
export function trackEvent(
  name: string,
  properties?: Record<string, unknown>,
): void {
  if (!isTelemetryEnabled()) return

  const payload = buildPayload(name, properties)

  // Fire-and-forget POST — never block the CLI
  try {
    fetch(TELEMETRY_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(3000),
    }).catch(() => {
      // Silently ignore telemetry failures
    })
  } catch {
    // Silently ignore
  }
}

// Re-export event names for convenience
export { EVENTS } from './events.js'
export type { EventName } from './events.js'

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
