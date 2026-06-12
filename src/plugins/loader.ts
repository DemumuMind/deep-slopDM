// ── Plugin Loader ──────────────────────────────────────
// Dynamically imports a module that exports the Engine interface.
// Plugins are ESM modules that default-export an Engine instance.

import type { Engine } from '../types/index.js'

export interface PluginModule {
  default: Engine
}

/**
 * Load a plugin from a file path.
 * The module must default-export an Engine-compatible object.
 * Returns null on any failure (missing file, bad export, etc).
 */
export async function loadPlugin(pluginPath: string): Promise<Engine | null> {
  try {
    const mod = await import(pluginPath) as PluginModule
    const engine = mod.default

    if (!engine || typeof engine !== 'object') {
      return null
    }

    // Validate the engine shape
    if (
      typeof engine.name === 'string' &&
      typeof engine.description === 'string' &&
      Array.isArray(engine.supportedLanguages) &&
      typeof engine.run === 'function'
    ) {
      return engine as Engine
    }

    return null
  } catch {
    return null
  }
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
