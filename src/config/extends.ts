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

import { readFileSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import yaml from 'js-yaml'
import { deepMerge } from '../utils/deep-merge.js'
import { getPreset, PRESETS } from './presets.js'

/**
 * Load a raw config object from a file path.
 * Supports .json, .yml, .yaml.
 */
function loadRawConfig(filePath: string): Record<string, unknown> {
  const content = readFileSync(filePath, 'utf-8')
  if (filePath.endsWith('.json')) {
    return JSON.parse(content) as Record<string, unknown>
  }
  return yaml.load(content) as Record<string, unknown>
}

/**
 * Check if a string looks like a file path (starts with ./ or / or contains /)
 */
function isFilePath(value: string): boolean {
  return value.startsWith('./') || value.startsWith('../') || value.startsWith('/') || value.includes('/')
}

/** All available preset names for error messages */
const PRESET_NAMES = Object.keys(PRESETS)

/**
 * Resolve the "extends" chain for a config file.
 * Checks for an "extends" key, loads the parent config,
 * recursively resolves the parent's own extends,
 * then deep-merges child overrides on top of the parent.
 *
 * Supports two forms of extends:
 * - File path: extends: './path/to/config.yml' → load from file
 * - Preset name: extends: 'typescript-strict' → load from PRESETS
 *
 * @param configPath - Absolute path to the config file
 * @returns The fully resolved (merged) raw config object
 */
export function resolveExtends(
  configPath: string,
): Record<string, unknown> {
  const raw = loadRawConfig(configPath)

  if (!raw.extends || typeof raw.extends !== 'string') {
    return raw
  }

  const extendsValue = raw.extends as string

  // Remove the "extends" key before merging — it's not a config value
  const childWithoutExtends = { ...raw }
  delete childWithoutExtends.extends

  // Check if extends is a preset name or a file path
  if (isFilePath(extendsValue)) {
    // File path: resolve relative to the current config's directory
    const parentPath = resolve(dirname(configPath), extendsValue)

    if (!existsSync(parentPath)) {
      throw new Error(
        `[deep-slop] Config extends "${extendsValue}" but file not found: ${parentPath}`,
      )
    }

    // Recursively resolve the parent's extends chain first
    const parent = resolveExtends(parentPath)

    // Child overrides parent
    return deepMerge(parent, childWithoutExtends)
  }

  // Preset name: load from PRESETS
  const preset = getPreset(extendsValue)
  if (!preset) {
    throw new Error(
      `[deep-slop] Config extends "${extendsValue}" but preset not found. Available presets: ${PRESET_NAMES.join(', ')}`,
    )
  }

  // Merge preset as parent, child overrides
  return deepMerge(preset as unknown as Record<string, unknown>, childWithoutExtends)
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
