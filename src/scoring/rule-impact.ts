import type { RuleImpact, ImpactTier } from './types.js'

/** Tier defaults: multiplier and per-rule cap */
export const TIER_DEFAULTS: Record<ImpactTier, { multiplier: number; cap: number }> = {
  strict:          { multiplier: 1.0,  cap: 40 },
  standard:        { multiplier: 1.0,  cap: 30 },
  maintainability: { multiplier: 0.75, cap: 24 },
  mechanical:      { multiplier: 0.5,  cap: 16 },
  style:           { multiplier: 0.5,  cap: 8 },
  advisory:        { multiplier: 0.25, cap: 8 },
}

/** Helper to build a RuleImpact from tier name + rationale */
function tier(t: ImpactTier, rationale: string): RuleImpact {
  const def = TIER_DEFAULTS[t]
  return { tier: t, multiplier: def.multiplier, cap: def.cap, rationale }
}

/**
 * Map of all 60+ rule IDs to their impact tier/multiplier/cap/rationale.
 * Rule IDs use the format "engine/rule-name" matching Diagnostic.rule.
 */
export const RULE_IMPACT: Record<string, RuleImpact> = {
  // ── ast-slop ────────────────────────────────────────
  'ast-slop/narrative-comment':    tier('strict',   'Narrative comments are a hallmark of AI slop — authoritative, misleading, and dangerous'),
  'ast-slop/trivial-comment':      tier('mechanical', 'Trivial comments add noise without value, easily bulk-removed'),
  'ast-slop/decorative-comment':   tier('style',    'Decorative comments are cosmetic — section dividers, banners'),
  'ast-slop/console-leftover':     tier('style',    'Console leftovers are debug debris, low impact but sloppy'),
  'ast-slop/generic-naming':       tier('advisory', 'Generic naming reduces readability but is subjective'),
  'ast-slop/hallucinated-import':  tier('standard', 'Hallucinated imports will cause runtime errors'),
  'ast-slop/as-any-cast':          tier('standard', 'as-any casts disable type safety — tracked here for ast-slop context'),
  'ast-slop/empty-catch':          tier('strict',   'Empty catch blocks silently swallow errors, hiding bugs'),
  'ast-slop/todo-leftover':        tier('mechanical', 'TODO leftovers are technical debt markers, not critical'),

  // ── import-intelligence ─────────────────────────────
  'import-intelligence/alternative-path':  tier('mechanical', 'Non-optimal import paths increase bundle size'),
  'import-intelligence/barrel-optimization': tier('mechanical', 'Barrel files cause unnecessary re-export overhead'),
  'import-intelligence/circular-dependency': tier('strict',    'Circular dependencies create unstable module graphs and runtime errors'),
  'import-intelligence/unused-import':      tier('mechanical', 'Unused imports are dead code that increases bundle size'),
  'import-intelligence/duplicate-import':   tier('mechanical', 'Duplicate imports are redundant and indicate copy-paste'),
  'import-intelligence/broken-alias':       tier('standard',  'Broken path aliases cause module resolution failures'),

  // ── dead-flow ───────────────────────────────────────
  'dead-flow/unreachable-after-terminator': tier('strict',       'Unreachable code after return/throw is definitively dead'),
  'dead-flow/unused-export':                tier('standard',     'Unused exports bloat the public API surface'),
  'dead-flow/unused-variable':              tier('standard',     'Unused variables are dead code increasing cognitive load'),
  'dead-flow/empty-block':                  tier('mechanical',   'Empty blocks suggest missing implementation'),
  'dead-flow/dead-conditional':             tier('standard',     'Dead conditionals indicate logic errors or AI artifacts'),
  'dead-flow/dead-switch-case':             tier('standard',     'Dead switch cases are unreachable branches'),

  // ── type-safety ─────────────────────────────────────
  'type-safety/as-any-cast':          tier('standard',     'as-any casts circumvent the type system'),
  'type-safety/double-assertion':     tier('strict',       'Double assertions (as unknown as X) are type-system abuse'),
  'type-safety/ts-suppress':          tier('standard',     '@ts-ignore/@ts-expect-error suppress real type errors'),
  'type-safety/non-null-assertion':   tier('standard',     'Non-null assertions (!) bypass null checks'),
  'type-safety/generic-any':          tier('mechanical',   'Generic <any> parameters lose type information'),
  'type-safety/missing-return-type':  tier('mechanical',   'Missing return types reduce type inference reliability'),

  // ── syntax-deep ─────────────────────────────────────
  'syntax-deep/bom-present':         tier('mechanical', 'BOM characters cause encoding issues across tools'),
  'syntax-deep/crlf-line-endings':   tier('mechanical', 'CRLF line endings cause cross-platform diff noise'),
  'syntax-deep/mixed-line-endings':  tier('mechanical', 'Mixed line endings break tooling expectations'),
  'syntax-deep/escape-sequence':     tier('mechanical', 'Unusual escape sequences may indicate encoding bugs'),
  'syntax-deep/regex-issue':         tier('mechanical', 'Regex issues can cause silent match failures'),
  'syntax-deep/precision-loss':      tier('style',      'Floating-point precision loss is cosmetic in most contexts'),
  'syntax-deep/unicode-anomaly':     tier('standard',  'Unicode anomalies may hide invisible characters or homoglyphs'),

  // ── security-deep ───────────────────────────────────
  'security-deep/eval-usage':            tier('strict', 'eval() enables arbitrary code execution'),
  'security-deep/innerhtml-usage':       tier('strict', 'innerHTML enables XSS injection'),
  'security-deep/sql-injection':         tier('strict', 'SQL injection enables database compromise'),
  'security-deep/shell-injection':        tier('strict', 'Shell injection enables OS command execution'),
  'security-deep/prototype-pollution':    tier('strict', 'Prototype pollution corrupts all object instances'),
  'security-deep/ssrf-risk':             tier('strict', 'SSRF enables internal network access from external input'),
  'security-deep/hardcoded-secret':      tier('strict', 'Hardcoded secrets leak credentials into source control'),

  // ── arch-constraints ────────────────────────────────
  'arch-constraints/high-coupling':       tier('maintainability', 'High coupling makes modules hard to change independently'),
  'arch-constraints/layer-violation':     tier('maintainability', 'Layer violations break architectural boundaries'),
  'arch-constraints/god-file':            tier('maintainability', 'God files concentrate too many responsibilities'),
  'arch-constraints/circular-dependency':  tier('strict',          'Arch-level circular deps create build and runtime instability'),
  'arch-constraints/deep-nesting':        tier('maintainability', 'Deep nesting reduces readability and increases bug surface'),
  'arch-constraints/unstable-dependency': tier('style',           'Unstable dependencies increase fragility'),

  // ── dup-detect ──────────────────────────────────────
  'dup-detect/identical-blocks':      tier('maintainability', 'Identical code blocks violate DRY and increase maintenance cost'),
  'dup-detect/similar-blocks':        tier('style',           'Similar blocks may indicate copy-paste with minor edits'),
  'dup-detect/duplicate-imports':     tier('mechanical',      'Duplicate imports are redundant overhead'),
  'dup-detect/repeated-constants':    tier('mechanical',      'Repeated constants should be extracted to shared definitions'),
  'dup-detect/copy-paste':            tier('style',           'Copy-paste patterns increase divergence risk'),

  // ── perf-hints ──────────────────────────────────────
  'perf-hints/n-plus-one':              tier('maintainability', 'N+1 queries cause severe performance degradation at scale'),
  'perf-hints/react-missing-memo':      tier('advisory',        'Missing React memoization causes unnecessary re-renders'),
  'perf-hints/sync-in-async':           tier('standard',        'Synchronous calls in async context block the event loop'),
  'perf-hints/large-loop-allocation':   tier('style',           'Large allocations in loops increase GC pressure'),
  'perf-hints/unnecessary-await':       tier('advisory',        'Unnecessary awaits add microtask overhead'),
  'perf-hints/string-concat':           tier('style',           'String concatenation in loops is slower than array join'),

  // ── i18n-lint ───────────────────────────────────────
  'i18n-lint/hardcoded-string':   tier('advisory',  'Hardcoded strings prevent localization'),
  'i18n-lint/missing-key':        tier('mechanical', 'Missing translation keys cause fallback or errors'),
  'i18n-lint/locale-mismatch':    tier('mechanical', 'Locale mismatches cause inconsistent user experience'),
  'i18n-lint/untranslated':       tier('advisory',  'Untranslated strings break multi-language support'),

  // ── config-lint ─────────────────────────────────────
  'config-lint/tsconfig-issue':    tier('mechanical', 'Misconfigured tsconfig causes type-check gaps'),
  'config-lint/eslint-issue':      tier('mechanical', 'ESLint misconfig leaves lint rules ineffective'),
  'config-lint/package-scripts':   tier('mechanical', 'Package script issues break CI/CD workflows'),
  'config-lint/prettier-issue':    tier('mechanical', 'Prettier misconfig causes formatting inconsistencies'),
  'config-lint/vite-config':       tier('mechanical', 'Vite misconfig affects build performance and output'),
  'config-lint/editorconfig':      tier('mechanical', 'EditorConfig issues cause cross-editor inconsistencies'),

  // ── meta-quality ────────────────────────────────────
  'meta-quality/score-report':     tier('advisory',  'Score report quality is meta — it affects trust in the tool itself'),
  'meta-quality/trend-analysis':   tier('advisory',  'Trend analysis is meta — helps track regressions over time'),
  'meta-quality/quality-gate':     tier('standard',  'Quality gate failures block CI, directly impacting delivery'),
  'meta-quality/config-check':     tier('mechanical', 'Config check issues are operational, not code quality'),
}

/** Fallback impact for unknown rules */
export const DEFAULT_IMPACT: RuleImpact = {
  tier: 'mechanical',
  multiplier: 0.5,
  cap: 16,
  rationale: 'Unknown rule — defaulting to mechanical tier',
}

/** Get the RuleImpact for a given rule ID, falling back to default */
export function getRuleImpact(ruleId: string): RuleImpact {
  return RULE_IMPACT[ruleId] ?? DEFAULT_IMPACT
}
