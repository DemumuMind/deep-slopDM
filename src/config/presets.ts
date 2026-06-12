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

/**
 * Named config presets that users can reference via `extends: 'preset-name'`
 * or via `deep-slop init --preset <name>`.
 */
export const PRESETS: Record<string, Partial<DeepSlopConfig> & { description?: string }> = {
  'typescript-strict': {
    description: 'Strict scoring, all engines on, error thresholds for TypeScript projects',
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
      'lint-external': true,
      'arch-rules': true,
      'knip': true,
    },
    quality: {
      maxFunctionLoc: 30,
      maxFileLoc: 200,
      maxNesting: 3,
      maxParams: 4,
      maxCyclomatic: 8,
      maxCoupling: 8,
    },
    ci: {
      failBelow: 80,
      format: 'json',
      failOnErrors: true,
    },
  },

  'monorepo-relaxed': {
    description: 'Relaxed scoring for monorepos, excludes common monorepo paths',
    engines: {},
    quality: {
      maxFunctionLoc: 60,
      maxFileLoc: 400,
      maxNesting: 5,
      maxParams: 6,
      maxCyclomatic: 12,
      maxCoupling: 12,
    },
    exclude: [
      'node_modules',
      '.git',
      'dist',
      'build',
      'coverage',
      'tmp-*',
      '**/dist/**',
      'packages/*/node_modules',
    ],
    ci: {
      failBelow: 60,
      format: 'json',
      failOnErrors: false,
    },
  },

  'python-go': {
    description: 'Configuration optimized for Python + Go projects — enables lint-external, disables config-lint',
    engines: {
      'config-lint': false,
      'lint-external': true,
    },
    quality: {
      maxFunctionLoc: 50,
      maxFileLoc: 350,
      maxNesting: 4,
      maxParams: 5,
      maxCyclomatic: 10,
      maxCoupling: 10,
    },
    exclude: [
      'node_modules',
      '.git',
      'dist',
      'build',
      'coverage',
      '__pycache__',
      '.venv',
      'venv',
      'vendor',
    ],
  },

  'minimal': {
    description: 'Only ast-slop + security-deep — lightweight scanning',
    engines: {
      'ast-slop': true,
      'security-deep': true,
      'import-intelligence': false,
      'dead-flow': false,
      'type-safety': false,
      'syntax-deep': false,
      'arch-constraints': false,
      'dup-detect': false,
      'perf-hints': false,
      'i18n-lint': false,
      'config-lint': false,
      'meta-quality': false,
      'lint-external': false,
      'arch-rules': false,
      'knip': false,
    },
  },
}

/** Get a preset by name, returning null if not found */
export function getPreset(name: string): Partial<DeepSlopConfig> | null {
  const preset = PRESETS[name]
  if (!preset) return null
  // Remove the description field (it's metadata, not config)
  const { description: _, ...config } = preset
  return config as Partial<DeepSlopConfig>
}

/** List all available preset names with descriptions */
export function listPresets(): Array<{ name: string, description: string }> {
  return Object.entries(PRESETS).map(([name, preset]) => ({
    name,
    description: preset.description ?? '',
  }))
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
