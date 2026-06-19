// ── Double Assertion Rule ──────────────────────────
// Detects `as unknown as X` double assertions that bypass type safety.
// Only flags primitive target types (string, number, boolean, ...).  Legitimate
// dynamic-data patterns — `as unknown as Record`, config/Engine casts in their
// natural directories, and non-primitive object/interface types — are skipped.

import type { Diagnostic } from '../../../types/index.js'
import { diag } from '../shared.js'

const RULES_DIR_PATTERN = /\/engines\/[^/]+\/rules\//

/** Config/interface types that are legitimate targets for dynamic JSON/config parsing. */
const CONFIG_INTERFACE_TYPES = new Set([
  'Record',
  'DeepSlopConfig',
  'FixStep',
  'Engine',
  'SpecificType',
])

/** Primitive-ish types that are truly suspicious when cast via `unknown`. */
const SUSPICIOUS_PRIMITIVE_TYPES = new Set([
  'string',
  'number',
  'boolean',
  'bigint',
  'symbol',
  'undefined',
  'null',
  'never',
  'void',
])

export function detectDoubleAssertion(
  lines: { num: number; text: string }[],
  filePath: string,
): Diagnostic[] {
  const results: Diagnostic[] = []

  if (filePath.includes('src/utils/pattern-docs.ts')) return results
  if (RULES_DIR_PATTERN.test(filePath)) return results

  const isConfigContext =
    /\/src\/(?:config\/|cli\/)/.test(filePath)
  const isPluginsFile = /\/src\/plugins\//.test(filePath)

  for (const { num, text } of lines) {
    const trimmed = text.trim()
    const doubleMatch = trimmed.match(/\bas\s+unknown\s+as\s+(\w+)/)
    if (!doubleMatch) continue

    const targetType = doubleMatch[1]

    // Standard pattern for dynamic JSON/config parsing — not a bypass.
    if (CONFIG_INTERFACE_TYPES.has(targetType)) continue

    // Config parsing contexts legitimately cast to config/interface types.
    if (isConfigContext) continue

    // Plugin loading is dynamic by nature.
    if (isPluginsFile && targetType === 'Engine') continue

    // Only primitive types are suspicious when reached through `unknown`.
    if (!SUSPICIOUS_PRIMITIVE_TYPES.has(targetType)) continue

    const col = text.indexOf('as unknown') + 1
    results.push(
      diag({
        filePath,
        rule: 'ast-slop/double-assertion',
        severity: 'warning',
        message: `Double type assertion: as unknown as ${targetType} — bypasses type safety`,
        help: 'Use a proper type guard, type predicate, or adjust the source/target types. Double assertions to primitive types defeat the purpose of TypeScript.',
        line: num,
        column: col,
        fixable: true,
        suggestion: {
          type: 'refactor',
          text: `as ${targetType}`,
          confidence: 0.5,
          reason: 'Prefer a direct cast with a type guard over bypassing the type system with double assertion.',
        },
      }),
    )
  }
  return results
}
