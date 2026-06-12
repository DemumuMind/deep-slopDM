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

// ── Rule Label Map ──────────────────────────────────────
// Human-readable display names for all rule IDs

const labels: Record<string, string> = {
  // ast-slop
  'ast-slop/narrative-comment': 'Narrative Comment',
  'ast-slop/decorative-comment': 'Decorative Comment',
  'ast-slop/trivial-comment': 'Trivial Comment',
  'ast-slop/console-leftover': 'Console Leftover',
  'ast-slop/todo-stub': 'TODO Stub',
  'ast-slop/generic-name': 'Generic Name',
  'ast-slop/defensive-typeof': 'Defensive typeof',
  'ast-slop/defensive-isinstance': 'Defensive isinstance',
  'ast-slop/swallowed-exception': 'Swallowed Exception',
  'ast-slop/double-assertion': 'Double Assertion',
  'ast-slop/as-any': 'as any Cast',
  'ast-slop/hallucinated-import': 'Hallucinated Import',

  // import-intelligence
  'import-intelligence/tree-shakeable': 'Tree-shakeable Import',
  'import-intelligence/react-auto-jsx': 'React Auto JSX',
  'import-intelligence/react-auto-jsx-named': 'React Auto JSX (named)',
  'import-intelligence/barrel-bypass': 'Barrel Bypass',
  'import-intelligence/broken-alias': 'Broken Alias',
  'import-intelligence/alias-canonical': 'Alias Canonical',
  'import-intelligence/circular-dependency': 'Circular Dependency',
  'import-intelligence/side-effect-import': 'Side-effect Import',
  'import-intelligence/type-only-import': 'Type-only Import',
  'import-intelligence/unused-symbol': 'Unused Symbol',
  'import-intelligence/unused-import': 'Unused Import',
  'import-intelligence/duplicate-import': 'Duplicate Import',

  // dead-flow
  'dead-flow/unreachable-after-terminator': 'Unreachable After Terminator',
  'dead-flow/unreachable-after-if-else-return': 'Unreachable After if-else-return',
  'dead-flow/dead-conditional': 'Dead Conditional',
  'dead-flow/unused-export': 'Unused Export',
  'dead-flow/unused-variable': 'Unused Variable',
  'dead-flow/empty-block': 'Empty Block',
  'dead-flow/dead-switch-code': 'Dead Switch Code',
  'dead-flow/dead-switch-case-after-default': 'Dead Switch Case After Default',

  // type-safety
  'types/as-any-orm': 'as any (ORM)',
  'types/as-any-window': 'as any (window)',
  'types/as-any-json-parse': 'as any (JSON.parse)',
  'types/as-any-param': 'as any (param)',
  'types/as-any': 'as any Cast',
  'types/double-assertion': 'Double Assertion',
  'types/missing-return-type': 'Missing Return Type',
  'types/ts-suppress': 'TS Suppress',
  'types/non-null-assertion': 'Non-null Assertion',
  'types/generic-any': 'Generic <any>',

  // security-deep
  'security-deep/eval-usage': 'eval() Usage',
  'security-deep/inner-html': 'innerHTML',
  'security-deep/sql-injection': 'SQL Injection',
  'security-deep/shell-injection': 'Shell Injection',
  'security-deep/prototype-pollution': 'Prototype Pollution',
  'security-deep/ssrf-risk': 'SSRF Risk',
  'security-deep/hardcoded-secret': 'Hardcoded Secret',
  'security-deep/dependency-vulnerability': 'Dependency Vulnerability',
  'security-deep/xss-risk': 'XSS Risk',
  'security-deep/unsafe-html': 'Unsafe HTML',

  // syntax-deep
  'syntax-deep/bom-present': 'BOM Present',
  'syntax-deep/zwnbsp-mid-file': 'ZWNBSP Mid-file',
  'syntax-deep/crlf-line-endings': 'CRLF Line Endings',
  'syntax-deep/mixed-line-endings': 'Mixed Line Endings',
  'syntax-deep/invalid-escape-sequence': 'Invalid Escape Sequence',
  'syntax-deep/regex-escape-in-string': 'Regex Escape in String',
  'syntax-deep/unnecessary-regex-class-escape': 'Unnecessary Regex Class Escape',
  'syntax-deep/precision-loss': 'Precision Loss',
  'syntax-deep/unicode-anomaly': 'Unicode Anomaly',
  'syntax-deep/trailing-whitespace': 'Trailing Whitespace',
  'syntax-deep/missing-final-newline': 'Missing Final Newline',
  'syntax-deep/mixed-indent-line': 'Mixed Indent Line',
  'syntax-deep/inconsistent-indent-style': 'Inconsistent Indent Style',

  // arch-constraints
  'arch-constraints/high-coupling': 'High Coupling',
  'arch-constraints/layer-violation': 'Layer Violation',
  'arch-constraints/god-file': 'God File',
  'arch-constraints/circular-dependency': 'Circular Dependency',
  'arch-constraints/deep-nesting': 'Deep Nesting',
  'arch-constraints/unstable-dependency': 'Unstable Dependency',

  // dup-detect
  'dup-detect/identical-block': 'Identical Block',
  'dup-detect/similar-block': 'Similar Block',
  'dup-detect/duplicate-import-across-files': 'Duplicate Import Across Files',
  'dup-detect/repeated-constant': 'Repeated Constant',
  'dup-detect/copy-paste-function': 'Copy-paste Function',

  // perf-hints
  'perf-hints/n-plus-one': 'N+1 Query',
  'perf-hints/react-missing-memo': 'React Missing Memo',
  'perf-hints/sync-in-async': 'Sync in Async',
  'perf-hints/large-loop-allocation': 'Large Loop Allocation',
  'perf-hints/string-concat-in-loop': 'String Concat in Loop',

  // i18n-lint
  'i18n-lint/hardcoded-string-jsx': 'Hardcoded String (JSX)',
  'i18n-lint/hardcoded-string-props': 'Hardcoded String (Props)',
  'i18n-lint/missing-translation-key': 'Missing Translation Key',
  'i18n-lint/locale-mismatch': 'Locale Mismatch',
  'i18n-lint/untranslated-locale': 'Untranslated Locale',

  // config-lint
  'config-lint/tsconfig-strict': 'tsconfig Strict',
  'config-lint/tsconfig-target': 'tsconfig Target',
  'config-lint/missing-eslint': 'Missing ESLint',
  'config-lint/package-json-scripts': 'package.json Scripts',
  'config-lint/missing-prettier': 'Missing Prettier',
  'config-lint/vite-config': 'Vite Config',
  'config-lint/next-config': 'Next.js Config',
  'config-lint/editorconfig': 'EditorConfig',

  // meta-quality
  'meta-quality/critical-score': 'Critical Score',
  'meta-quality/low-score': 'Low Score',
  'meta-quality/severe-regression': 'Severe Regression',
  'meta-quality/degrading-trend': 'Degrading Trend',
  'meta-quality/improving-trend': 'Improving Trend',
  'meta-quality/engine-spike': 'Engine Spike',
  'meta-quality/quality-gate-failed': 'Quality Gate Failed',
  'meta-quality/quality-gate-passed': 'Quality Gate Passed',
  'meta-quality/missing-config': 'Missing Config',

  // lint-external
  'lint-external/ruff': 'Ruff Lint (Python)',
  'lint-external/golangci': 'golangci-lint (Go)',
  'lint-external/clippy': 'Clippy Lint (Rust)',

  // format-lint
  'format-lint/inconsistent-indent': 'Inconsistent Indent',
  'format-lint/inconsistent-quotes': 'Inconsistent Quotes',
  'format-lint/max-line-length': 'Max Line Length',
  'format-lint/inconsistent-semicolons': 'Inconsistent Semicolons',
  'format-lint/blank-line-cluster': 'Blank Line Cluster',
  'format-lint/trailing-comma-inconsistency': 'Trailing Comma Inconsistency',
}

/**
 * Get a human-readable label for a rule ID.
 * Falls back to the rule ID itself if no label is defined.
 */
export function ruleLabel(ruleId: string): string {
  return labels[ruleId] ?? ruleId
}

/**
 * Get all known rule IDs.
 */
export function knownRuleIds(): string[] {
  return Object.keys(labels)
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
