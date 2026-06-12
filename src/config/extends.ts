import { readFileSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import yaml from 'js-yaml'
import { deepMerge } from '../utils/deep-merge.js'

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
 * Resolve the "extends" chain for a config file.
 * Checks for an "extends" key, loads the parent config,
 * recursively resolves the parent's own extends,
 * then deep-merges child overrides on top of the parent.
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

  // Resolve parent path relative to the current config's directory
  const parentPath = resolve(dirname(configPath), raw.extends)

  if (!existsSync(parentPath)) {
    throw new Error(
      `[deep-slop] Config extends "${raw.extends}" but file not found: ${parentPath}`,
    )
  }

  // Recursively resolve the parent's extends chain first
  const parent = resolveExtends(parentPath)

  // Remove the "extends" key before merging — it's not a config value
  const childWithoutExtends = { ...raw }
  delete childWithoutExtends.extends

  // Child overrides parent
  return deepMerge(parent, childWithoutExtends)
}
