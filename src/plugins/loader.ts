// ── Plugin Loader ──────────────────────────────────────
// Dynamically imports a plugin module and validates that it exports an
// Engine-compatible object.  Plugins are ESM modules that default-export an
// Engine instance.

import type { Engine } from '../types/index.js'

/** Shape of a plugin module as loaded by dynamic import */
export interface PluginModule {
  default?: Engine | unknown
}

/** Result of attempting to load a plugin */
export interface LoadPluginResult {
  /** The loaded Engine, or null if validation failed */
  engine: Engine | null
  /** Detailed error messages for the caller */
  errors: string[]
}

const REQUIRED_FIELDS: Array<keyof Engine> = ['name', 'description', 'supportedLanguages', 'run']

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

/**
 * Validate that a value conforms to the Engine interface.
 * Returns the engine and an empty error list on success, or null and errors.
 */
export function validateEngine(value: unknown, pluginPath: string): { engine: Engine | null; errors: string[] } {
  const errors: string[] = []

  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    errors.push(`Plugin at ${pluginPath} must default-export an object, got ${value === null ? 'null' : typeof value}`)
    return { engine: null, errors }
  }

  const engine = value as Record<string, unknown>

  if (!isNonEmptyString(engine.name)) {
    errors.push(`Plugin at ${pluginPath} must export a non-empty string 'name'`)
  }

  if (!isNonEmptyString(engine.description)) {
    errors.push(`Plugin at ${pluginPath} must export a non-empty string 'description'`)
  }

  const supportedLanguages = engine.supportedLanguages
  if (
    !Array.isArray(supportedLanguages) ||
    supportedLanguages.length === 0 ||
    supportedLanguages.some((lang) => typeof lang !== 'string' || lang.trim().length === 0)
  ) {
    errors.push(`Plugin at ${pluginPath} must export 'supportedLanguages' as a non-empty array of strings`)
  }

  if (typeof engine.run !== 'function') {
    errors.push(`Plugin at ${pluginPath} must export 'run' as an async function`)
  }

  if (engine.fix !== undefined && typeof engine.fix !== 'function') {
    errors.push(`Plugin at ${pluginPath} exports 'fix' but it is not a function`)
  }

  if (errors.length > 0) {
    return { engine: null, errors }
  }

  return { engine: value as Engine, errors: [] }
}

/**
 * Load a plugin from a file path with detailed error reporting.
 * The module must default-export an Engine-compatible object.
 */
export async function loadPluginWithErrors(pluginPath: string): Promise<LoadPluginResult> {
  let mod: PluginModule
  try {
    mod = await import(pluginPath) as PluginModule
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { engine: null, errors: [`Failed to import plugin at ${pluginPath}: ${message}`] }
  }

  if (mod === null || typeof mod !== 'object') {
    return { engine: null, errors: [`Plugin at ${pluginPath} did not load a module object`] }
  }

  if (mod.default === undefined) {
    return {
      engine: null,
      errors: [`Plugin at ${pluginPath} must export a default Engine object (e.g. export default { ... })`],
    }
  }

  const { engine, errors } = validateEngine(mod.default, pluginPath)
  return { engine, errors }
}

/**
 * Load a plugin from a file path.
 * The module must default-export an Engine-compatible object.
 * Returns null on any failure (missing file, bad export, etc).
 */
export async function loadPlugin(pluginPath: string): Promise<Engine | null> {
  const { engine } = await loadPluginWithErrors(pluginPath)
  return engine
}

/**
 * Load multiple plugins from an array of paths.
 * Returns successfully loaded engines, skipping failures.
 */
export async function loadPlugins(paths: string[]): Promise<Engine[]> {
  const results = await Promise.allSettled(
    paths.map((p) => loadPlugin(p))
  )

  const engines: Engine[] = []
  for (const r of results) {
    if (r.status === 'fulfilled' && r.value !== null) {
      engines.push(r.value)
    }
  }
  return engines
}
