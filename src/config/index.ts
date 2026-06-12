import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import yaml from 'js-yaml'
import { DeepSlopConfigSchema } from './schema.js'
import { DEFAULT_CONFIG } from './defaults.js'
import { resolveExtends } from './extends.js'
import { deepMerge } from '../utils/deep-merge.js'
import type { DeepSlopConfig } from './schema.js'

/** Config file names to search for, in priority order */
const CONFIG_FILES = [
  'config.yml',
  'config.yaml',
  'config.json',
] as const

/** Directory name for deep-slop config */
const CONFIG_DIR = '.deep-slop'

/**
 * Search upward from `startDir` for a .deep-slop/ directory
 * containing config.yml, config.yaml, or config.json.
 * Returns the absolute path to the first config file found,
 * or `undefined` if none exists up to the filesystem root.
 */
function findConfigFile(startDir: string): string | undefined {
  let dir = startDir
  // Guard against infinite loop at root
  let prev = ''
  while (dir !== prev) {
    for (const name of CONFIG_FILES) {
      const candidate = join(dir, CONFIG_DIR, name)
      if (existsSync(candidate)) {
        return candidate
      }
    }
    prev = dir
    dir = dirname(dir)
  }
  return undefined
}

/**
 * Load and parse a raw config from a file path.
 * Supports .json, .yml, .yaml extensions.
 */
function parseRawConfig(filePath: string): Record<string, unknown> {
  const content = readFileSync(filePath, 'utf-8')
  if (filePath.endsWith('.json')) {
    return JSON.parse(content) as Record<string, unknown>
  }
  return yaml.load(content) as Record<string, unknown>
}

/**
 * Load the deep-slop configuration for a given project root directory.
 *
 * Steps:
 * 1. Searches up the directory tree for `.deep-slop/config.yml|yaml|json`
 * 2. Parses the YAML/JSON file
 * 3. Resolves the `extends` chain (if present)
 * 4. Deep-merges with DEFAULT_CONFIG
 * 5. Validates against the Zod schema
 * 6. Returns the validated `DeepSlopConfig`
 */
export function loadConfig(rootDir: string): DeepSlopConfig {
  const configPath = findConfigFile(rootDir)

  // No config file found — return defaults
  if (!configPath) {
    return DeepSlopConfigSchema.parse(DEFAULT_CONFIG) as DeepSlopConfig
  }

  // Resolve extends chain
  const resolved = resolveExtends(configPath)

  // Deep-merge defaults with user config (user config wins)
  const merged = deepMerge(
    DEFAULT_CONFIG as unknown as Record<string, unknown>,
    resolved,
  )

  // Strip the "extends" key before validation — it's not a config value
  delete merged.extends

  // Validate and return
  const result = DeepSlopConfigSchema.safeParse(merged)
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  • ${i.path.join('.')}: ${i.message}`)
      .join('\n')
    throw new Error(
      `[deep-slop] Invalid config in ${configPath}:\n${issues}`,
    )
  }

  return result.data as DeepSlopConfig
}

/** Re-export schema and type for convenience */
export { DeepSlopConfigSchema } from './schema.js'
export type { DeepSlopConfig } from './schema.js'
export { DEFAULT_CONFIG } from './defaults.js'
export { resolveExtends } from './extends.js'
