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

import type { DeepSlopConfig } from './schema.js'

/** Default configuration matching the canonical values */
export const DEFAULT_CONFIG: DeepSlopConfig = {
  engines: {
    'ast-slop': true,
    'import-intelligence': true,
    'dead-flow': true,
    'type-safety': true,
    'syntax-deep': true,
    'security-deep': true,
    'arch-constraints': true,
    'dup-detect': true,
    'perf-hints': true,
    'i18n-lint': true,
    'config-lint': true,
    'meta-quality': true,
    'arch-rules': true,
    'lint-external': true,
    'knip': true,
    'format-lint': true,
    'framework-lint': true,
    'markup-lint': true,
  },
  quality: {
    maxFunctionLoc: 50,
    maxFileLoc: 300,
    maxNesting: 4,
    maxParams: 5,
    maxCyclomatic: 10,
    maxCoupling: 10,
  },
  security: {
    audit: false,
    auditTimeout: 25000,
    owasp: true,
  },
  imports: {
    suggestAlternatives: true,
    optimizeBarrels: true,
    validateAliases: true,
    buildGraph: true,
    maxCircularDepth: 5,
  },
  types: {
    flagAsAny: true,
    suggestTypes: true,
    flagDoubleAssertion: true,
  },
  deadCode: {
    unreachableBranches: true,
    unusedExports: true,
    unusedVariables: true,
  },
  i18n: {
    hardcodedStrings: true,
    validateKeys: false,
  },
  scoring: {
    mode: 'logarithmic',
    smoothing: 20,
    maxPerRule: 40,
  },
  telemetry: {
    enabled: false,
  },
  exclude: ['node_modules', '.git', 'dist', 'build', 'coverage', 'tmp-*'],
  ignore: [],
  ci: {
    failBelow: 70,
    format: 'json',
    failOnErrors: true,
  },
  rules: {},
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
