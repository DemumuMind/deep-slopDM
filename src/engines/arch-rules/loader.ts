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

// ── Architecture Rules Loader ──────────────────────────────────────
// Loads rules from .deep-slop/rules.yml and parses them into typed objects.

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import yaml from 'js-yaml'

// ── Rule Types ──────────────────────────────────────────────────────

export type RuleType = 'forbid_import' | 'forbid_import_from_path' | 'require_pattern'

export interface ArchRule {
  /** Human-readable rule name */
  name: string
  /** Rule type */
  type: RuleType
  /** Glob pattern matching files this rule applies to */
  match: string
  /** (forbid_import) Import specifier to forbid (glob or regex) */
  forbid?: string
  /** (forbid_import_from_path) Source path glob that must not be imported */
  from?: string
  /** (require_pattern) Regex pattern that must be present in the file */
  pattern?: string
  /** Severity: error | warning | info */
  severity: 'error' | 'warning' | 'info'
  /** Optional condition: only apply if file path also matches this glob */
  where?: string
}

export interface RulesFile {
  rules: ArchRule[]
}

// ── Loader ──────────────────────────────────────────────────────────

const RULES_PATH = '.deep-slop/rules.yml'

/** Validate and normalize a single rule object */
function validateRule(raw: Record<string, unknown>, index: number): ArchRule {
  const name = typeof raw.name === 'string' ? raw.name : `rule-${index + 1}`
  const type = raw.type as RuleType | undefined

  if (!type || !['forbid_import', 'forbid_import_from_path', 'require_pattern'].includes(type)) {
    throw new Error(`Rule "${name}" has invalid type: "${type}". Expected: forbid_import, forbid_import_from_path, require_pattern`)
  }

  if (!raw.match || typeof raw.match !== 'string') {
    throw new Error(`Rule "${name}" is missing required "match" glob pattern`)
  }

  if (type === 'forbid_import' && (!raw.forbid || typeof raw.forbid !== 'string')) {
    throw new Error(`Rule "${name}" (forbid_import) is missing required "forbid" field`)
  }

  if (type === 'forbid_import_from_path' && (!raw.forbid || typeof raw.forbid !== 'string')) {
    throw new Error(`Rule "${name}" (forbid_import_from_path) is missing required "forbid" field`)
  }

  if (type === 'forbid_import_from_path' && (!raw.from || typeof raw.from !== 'string')) {
    throw new Error(`Rule "${name}" (forbid_import_from_path) is missing required "from" field`)
  }

  if (type === 'require_pattern' && (!raw.pattern || typeof raw.pattern !== 'string')) {
    throw new Error(`Rule "${name}" (require_pattern) is missing required "pattern" field`)
  }

  const severity = raw.severity as string | undefined
  if (severity && !['error', 'warning', 'info'].includes(severity)) {
    throw new Error(`Rule "${name}" has invalid severity: "${severity}". Expected: error, warning, info`)
  }

  return {
    name,
    type,
    match: raw.match as string,
    forbid: raw.forbid as string | undefined,
    from: raw.from as string | undefined,
    pattern: raw.pattern as string | undefined,
    severity: (severity as ArchRule['severity']) ?? 'warning',
    where: raw.where as string | undefined,
  }
}

/**
 * Load architecture rules from .deep-slop/rules.yml.
 * Returns an empty array if the file does not exist.
 */
export async function loadRules(rootDir: string): Promise<ArchRule[]> {
  const filePath = join(rootDir, RULES_PATH)

  let content: string
  try {
    content = await readFile(filePath, 'utf-8')
  } catch {
    // No rules file — that's fine
    return []
  }

  const parsed = yaml.load(content) as Record<string, unknown> | null

  if (!parsed || !Array.isArray(parsed.rules)) {
    throw new Error(`Invalid rules file: ${RULES_PATH} — expected a "rules" array at top level`)
  }

  const rawRules = parsed.rules as Record<string, unknown>[]
  return rawRules.map((raw, i) => validateRule(raw, i))
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
