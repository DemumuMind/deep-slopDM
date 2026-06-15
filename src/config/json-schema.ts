/**
 * Generate a JSON Schema (draft-07) for deep-slop configuration.
 *
 * Built manually because zod-to-json-schema doesn't support Zod v4 yet.
 * Covers the user-facing config fields that appear in .deep-slop/config.yml.
 */

export function generateJsonSchema(): object {
  const engineEntrySchema = {
    oneOf: [
      { type: 'boolean', description: 'Enable or disable the engine' },
      {
        type: 'object',
        description: 'Per-engine options',
        properties: {
          earlyExit: {
            type: 'boolean',
            default: true,
            description: 'Stop scanning after the first 10 files if no issues are found',
          },
        },
        additionalProperties: false,
      },
    ],
  }

  return {
    $schema: 'http://json-schema.org/draft-07/schema#',
    title: 'DeepSlopConfig',
    description: 'Configuration for deep-slop — deep AI slop detection with 21 AST-powered engines',
    type: 'object',
    properties: {
      engines: {
        type: 'object',
        description: 'Enable/disable individual analysis engines (or set per-engine options)',
        additionalProperties: engineEntrySchema,
        properties: {
          'ast-slop': { ...engineEntrySchema, description: 'AI slop pattern detection' },
          'import-intelligence': { ...engineEntrySchema, description: 'Import optimization and barrel analysis' },
          'dead-flow': { ...engineEntrySchema, description: 'Dead code and unreachable branch detection' },
          'type-safety': { ...engineEntrySchema, description: 'TypeScript type safety analysis' },
          'syntax-deep': { ...engineEntrySchema, description: 'Syntax anomaly detection' },
          'security-deep': { ...engineEntrySchema, description: 'Security vulnerability scanning' },
          'arch-constraints': { ...engineEntrySchema, description: 'Architecture constraint analysis' },
          'dup-detect': { ...engineEntrySchema, description: 'Duplicate code detection' },
          'perf-hints': { ...engineEntrySchema, description: 'Performance hints' },
          'i18n-lint': { ...engineEntrySchema, description: 'Internationalization linting' },
          'config-lint': { ...engineEntrySchema, description: 'Configuration validation' },
          'meta-quality': { ...engineEntrySchema, description: 'Meta quality scoring and trend analysis' },
          'lint-external': { ...engineEntrySchema, description: 'External linter integration (ruff, golangci-lint, clippy)' },
          'arch-rules': { ...engineEntrySchema, description: 'User-defined architecture rules' },
          knip: { ...engineEntrySchema, description: 'Unused dependency/export detection' },
          'format-lint': { ...engineEntrySchema, description: 'Formatting consistency' },
          'framework-lint': { ...engineEntrySchema, description: 'Framework-specific rules (Next.js, Tailwind)' },
          'markup-lint': { ...engineEntrySchema, description: 'Markup & config quality (JSON, YAML, CSS, HTML, Markdown)' },
          'rust-deep': { ...engineEntrySchema, description: 'Rust-specific quality analysis (unwrap, todo!, clone, unsafe, match wildcards)' },
          'python-deep': { ...engineEntrySchema, description: 'Python-specific deep analysis (exceptions, type hints, mutable defaults, star imports, pass stubs, prints)' },
          'go-deep': { ...engineEntrySchema, description: 'Go-specific idiomatic and architectural rules (errors, context, defer, goto, package cycles)' },
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
