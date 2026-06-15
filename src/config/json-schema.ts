/**
 * Generate a JSON Schema (draft-07) for deep-slop configuration.
 *
 * Built manually because zod-to-json-schema doesn't support Zod v4 yet.
 * Covers the user-facing config fields that appear in .deep-slop/config.yml.
 */

export function generateJsonSchema(): object {
  return {
    $schema: 'http://json-schema.org/draft-07/schema#',
    title: 'DeepSlopConfig',
    description: 'Configuration for deep-slop — deep AI slop detection with 21 AST-powered engines',
    type: 'object',
    properties: {
      engines: {
        type: 'object',
        description: 'Enable/disable individual analysis engines',
        additionalProperties: { type: 'boolean' },
        properties: {
          'ast-slop': { type: 'boolean', description: 'AI slop pattern detection' },
          'import-intelligence': { type: 'boolean', description: 'Import optimization and barrel analysis' },
          'dead-flow': { type: 'boolean', description: 'Dead code and unreachable branch detection' },
          'type-safety': { type: 'boolean', description: 'TypeScript type safety analysis' },
          'syntax-deep': { type: 'boolean', description: 'Syntax anomaly detection' },
          'security-deep': { type: 'boolean', description: 'Security vulnerability scanning' },
          'arch-constraints': { type: 'boolean', description: 'Architecture constraint analysis' },
          'dup-detect': { type: 'boolean', description: 'Duplicate code detection' },
          'perf-hints': { type: 'boolean', description: 'Performance hints' },
          'i18n-lint': { type: 'boolean', description: 'Internationalization linting' },
          'config-lint': { type: 'boolean', description: 'Configuration validation' },
          'meta-quality': { type: 'boolean', description: 'Meta quality scoring and trend analysis' },
          'lint-external': { type: 'boolean', description: 'External linter integration (ruff, golangci-lint, clippy)' },
          'arch-rules': { type: 'boolean', description: 'User-defined architecture rules' },
          knip: { type: 'boolean', description: 'Unused dependency/export detection' },
          'format-lint': { type: 'boolean', description: 'Formatting consistency' },
          'framework-lint': { type: 'boolean', description: 'Framework-specific rules (Next.js, Tailwind)' },
          'markup-lint': { type: 'boolean', description: 'Markup & config quality (JSON, YAML, CSS, HTML, Markdown)' },
          'rust-deep': { type: 'boolean', description: 'Rust-specific quality analysis (unwrap, todo!, clone, unsafe, match wildcards)' },
          'python-deep': { type: 'boolean', description: 'Python-specific deep analysis (exceptions, type hints, mutable defaults, star imports, pass stubs, prints)' },
          'go-deep': { type: 'boolean', description: 'Go-specific idiomatic and architectural rules (errors, context, defer, goto, package cycles)' },
        },
      },
      exclude: {
        type: 'array',
        items: { type: 'string' },
        description: 'Glob patterns to exclude from scanning',
        default: ['node_modules', 'dist', 'coverage', '.git'],
      },
      quality: {
        type: 'object',
        description: 'Quality thresholds',
        properties: {
          maxFunctionLoc: { type: 'number', default: 50, description: 'Max lines per function' },
          maxFileLoc: { type: 'number', default: 300, description: 'Max lines per file' },
          maxNesting: { type: 'number', default: 4, description: 'Max nesting depth' },
          maxParams: { type: 'number', default: 5, description: 'Max function parameters' },
          maxCyclomatic: { type: 'number', default: 10, description: 'Max cyclomatic complexity' },
          maxCoupling: { type: 'number', default: 7, description: 'Max coupling between modules' },
        },
        additionalProperties: true,
      },
      security: {
        type: 'object',
        description: 'Security engine settings',
        properties: {
          audit: { type: 'boolean', default: true, description: 'Run npm audit' },
          auditTimeout: { type: 'number', default: 30000, description: 'Audit timeout in ms' },
          owasp: { type: 'boolean', default: true, description: 'Enable OWASP checks' },
        },
        additionalProperties: true,
      },
      imports: {
        type: 'object',
        description: 'Import intelligence settings',
        properties: {
          suggestAlternatives: { type: 'boolean', default: true },
          optimizeBarrels: { type: 'boolean', default: true },
          validateAliases: { type: 'boolean', default: true },
          buildGraph: { type: 'boolean', default: true },
          maxCircularDepth: { type: 'number', default: 5 },
        },
        additionalProperties: true,
      },
      types: {
        type: 'object',
        description: 'Type safety settings',
        properties: {
          flagAsAny: { type: 'boolean', default: true },
          suggestTypes: { type: 'boolean', default: true },
          flagDoubleAssertion: { type: 'boolean', default: true },
        },
        additionalProperties: true,
      },
      deadCode: {
        type: 'object',
        description: 'Dead code detection settings',
        properties: {
          unreachableBranches: { type: 'boolean', default: true },
          unusedExports: { type: 'boolean', default: true },
          unusedVariables: { type: 'boolean', default: true },
        },
        additionalProperties: true,
      },
      i18n: {
        type: 'object',
        description: 'Internationalization settings',
        properties: {
          hardcodedStrings: { type: 'boolean', default: true },
          validateKeys: { type: 'boolean', default: true },
        },
        additionalProperties: true,
      },
      scoring: {
        type: 'object',
        description: 'Scoring configuration',
        properties: {
          mode: { type: 'string', enum: ['logarithmic', 'linear'], default: 'logarithmic' },
          smoothing: { type: 'number', default: 20 },
          maxPerRule: { type: 'number', default: 40 },
        },
      },
      telemetry: {
        type: 'object',
        description: 'Telemetry settings',
        properties: {
          enabled: { type: 'boolean', default: false },
        },
      },
      ci: {
        type: 'object',
        description: 'CI quality gate settings',
        properties: {
          failBelow: { type: 'number', default: 70, description: 'Minimum score to pass CI' },
          format: { type: 'string', enum: ['json', 'human', 'sarif'], default: 'json' },
          failOnErrors: { type: 'boolean', default: true },
        },
      },
      rules: {
        type: 'object',
        description: 'Per-rule severity overrides (e.g. ast-slop/narrative-comment: off)',
        additionalProperties: {
          type: 'string',
          enum: ['off', 'info', 'suggestion', 'warning', 'error'],
        },
      },
      extends: {
        type: 'string',
        description: 'Preset to extend (recommended, strict, minimal)',
        enum: ['recommended', 'strict', 'minimal'],
      },
    },
    additionalProperties: false,
  }
}
