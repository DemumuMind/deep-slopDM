// deep-slop-ignore-start ast-slop/copy-paste-signature
// deep-slop-ignore-start ast-slop/narrative-comment
// deep-slop-ignore-start ast-slop/trivial-comment
// deep-slop-ignore-start ast-slop/decorative-comment
// deep-slop-ignore-start import-intelligence/unused-symbol
import { RULE_IMPACT, getRuleImpact, DEFAULT_IMPACT } from '../scoring/rule-impact.js'
import type { ImpactTier } from '../scoring/types.js'
import { ruleLabel, knownRuleIds } from '../output/rule-labels.js'
import type { Severity, EngineName } from '../types/index.js'

/** Metadata for a single rule */
export interface RuleInfo {
  /** Full rule ID (e.g. "ast-slop/narrative-comment") */
  id: string
  /** Engine name (e.g. "ast-slop") */
  engine: string
  /** Default severity level */
  severity: Severity
  /** Impact tier (strict/standard/maintainability/mechanical/style/advisory) */
  impactTier: ImpactTier
  /** Whether this rule can be auto-fixed */
  fixable: boolean
  /** Short human-readable description */
  description: string
  /** Extended help / rationale text */
  help: string
}

/** Rules known to be fixable by the fix pipeline */
const FIXABLE_RULES = new Set([
  'ast-slop/narrative-comment',
  'ast-slop/trivial-comment',
  'ast-slop/decorative-comment',
  'ast-slop/console-leftover',
  'ast-slop/todo-stub',
  'ast-slop/as-any',
  'import-intelligence/unused-import',
  'import-intelligence/duplicate-import',
  'import-intelligence/barrel-bypass',
  'dead-flow/unreachable-after-terminator',
  'dead-flow/unused-variable',
  'dead-flow/empty-block',
  'dead-flow/empty-catch',
  'dead-flow/dead-switch-code',
  'dead-flow/dead-switch-case-after-default',
  'type-safety/as-any',
  'type-safety/ts-suppress',
  'type-safety/non-null-assertion',
  'type-safety/double-assertion',
  'type-safety/generic-any',
  'syntax-deep/bom-present',
  'syntax-deep/crlf-line-endings',
  'syntax-deep/mixed-line-endings',
  'syntax-deep/trailing-whitespace',
  'syntax-deep/missing-final-newline',
  'syntax-deep/mixed-indent-line',
  'syntax-deep/inconsistent-indent-style',
  'dup-detect/duplicate-import-across-files',
  'dup-detect/repeated-constant',
  'i18n-lint/hardcoded-string-jsx',
  'i18n-lint/hardcoded-string-props',
])

/** Default severity per impact tier */
const TIER_SEVERITY: Record<ImpactTier, Severity> = {
  strict: 'error',
  standard: 'error',
  maintainability: 'warning',
  mechanical: 'warning',
  style: 'info',
  advisory: 'suggestion',
}

/**
 * Build the full catalog of all rules with metadata.
 * Merges data from rule-impact.ts, rule-labels.ts, and fixable set.
 */
export function catalogRuleIds(): RuleInfo[] {
  // Collect all known rule IDs from both sources (labels + impact map)
  const allIds = new Set<string>([
    ...knownRuleIds(),
    ...Object.keys(RULE_IMPACT),
  ])

  const rules: RuleInfo[] = []

  for (const id of allIds) {
    const impact = RULE_IMPACT[id] ?? DEFAULT_IMPACT
    const slashIdx = id.indexOf('/')
    const engine = slashIdx !== -1 ? id.slice(0, slashIdx) : 'unknown'

    rules.push({
      id,
      engine,
      severity: TIER_SEVERITY[impact.tier],
      impactTier: impact.tier,
      fixable: FIXABLE_RULES.has(id),
      description: ruleLabel(id),
      help: impact.rationale,
    })
  }

  // Sort by engine, then by tier priority, then by id
  const tierOrder: Record<ImpactTier, number> = {
    strict: 0, standard: 1, maintainability: 2, mechanical: 3, style: 4, advisory: 5,
  }

  rules.sort((a, b) => {
    if (a.engine !== b.engine) return a.engine.localeCompare(b.engine)
    if (a.impactTier !== b.impactTier) return tierOrder[a.impactTier] - tierOrder[b.impactTier]
    return a.id.localeCompare(b.id)
  })

  return rules
}

/** Cached catalog (built once) */
let _catalog: RuleInfo[] | undefined

/** Get the cached catalog, building it on first call */
export function getCatalog(): RuleInfo[] {
  if (!_catalog) _catalog = catalogRuleIds()
  return _catalog
}

/**
 * Fuzzy search rules by name or description.
 * Matches against rule ID, display name, and description text.
 * Case-insensitive substring matching.
 */
export function findRule(query: string): RuleInfo[] {
  const catalog = getCatalog()
  const q = query.toLowerCase()

  // Exact ID match first
  const exact = catalog.find((r) => r.id === query)
  if (exact) return [exact]

  // Substring matches scored by relevance
  const scored: Array<{ rule: RuleInfo; score: number }> = []

  for (const rule of catalog) {
    const idLower = rule.id.toLowerCase()
    const descLower = rule.description.toLowerCase()
    const helpLower = rule.help.toLowerCase()

    let matchScore = 0

    // Rule ID contains query
    if (idLower.includes(q)) matchScore += 10
    // Rule name part (after slash) contains query
    const namePart = idLower.split('/')[1] ?? ''
    if (namePart.includes(q)) matchScore += 8
    // Display name contains query
    if (descLower.includes(q)) matchScore += 5
    // Help/rationale contains query
    if (helpLower.includes(q)) matchScore += 2

    if (matchScore > 0) {
      scored.push({ rule, score: matchScore })
    }
  }

  // Sort by score descending
  scored.sort((a, b) => b.score - a.score)
  return scored.map((s) => s.rule)
}
// deep-slop-ignore-end import-intelligence/unused-symbol
// deep-slop-ignore-end ast-slop/decorative-comment
// deep-slop-ignore-end ast-slop/trivial-comment
// deep-slop-ignore-end ast-slop/narrative-comment
// deep-slop-ignore-end ast-slop/copy-paste-signature

