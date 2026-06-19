// ── Plugin Registry ─────────────────────────────────────
// Manages installed plugins: discovery, registration, and lookup.

import type { Engine } from '../types/index.js'
import { loadPlugin, loadPlugins } from './loader.js'
import { join } from 'node:path'
import { access, readdir } from 'node:fs/promises'

async function exists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

/** Plugin metadata stored in the registry */
export interface PluginEntry {
  /** Unique plugin identifier (derived from engine name) */
  id: string
  /** Absolute path to the plugin module */
  path: string
  /** The loaded Engine instance */
  engine: Engine
  /** Whether the plugin loaded successfully */
  loaded: boolean
  /** Error message if loading failed */
  error?: string
}

/** Plugin registry singleton */
class PluginRegistry {
  private entries: Map<string, PluginEntry> = new Map()
  private loaded = false

  /** Get all registered plugins */
  getAll(): PluginEntry[] {
    return [...this.entries.values()]
  }

  /** Get all successfully loaded engines */
  getEngines(): Engine[] {
    return [...this.entries.values()]
      .filter((e) => e.loaded)
      .map((e) => e.engine)
  }

  /** Get a specific plugin by id */
  get(id: string): PluginEntry | undefined {
    return this.entries.get(id)
  }

  /** Get a loaded engine by name */
  getEngine(name: string): Engine | undefined {
    const entry = this.entries.get(name)
    return entry?.loaded ? entry.engine : undefined
  }

  /** Register a plugin entry */
  register(entry: PluginEntry): void {
    this.entries.set(entry.id, entry)
  }

  /** Remove a plugin by id */
  remove(id: string): boolean {
    return this.entries.delete(id)
  }

  /** Check if a plugin is registered */
  has(id: string): boolean {
    return this.entries.has(id)
  }

  /** Number of registered plugins */
  get size(): number {
    return this.entries.size
  }

  /** Whether the registry has been loaded from disk */
  get isLoaded(): boolean {
    return this.loaded
  }

  /** Mark the registry as loaded */
  setLoaded(loaded: boolean): void {
    this.loaded = loaded
  }

  /** Clear all entries */
  clear(): void {
    this.entries.clear()
    this.loaded = false
  }
}

/** Global plugin registry instance */
export const pluginRegistry = new PluginRegistry()

/** Default plugin directory name */
export const PLUGIN_DIR = '.deep-slop/plugins'

/**
 * Resolve the plugins directory for a given project root.
 */
export function getPluginDir(rootDir: string): string {
  return join(rootDir, PLUGIN_DIR)
}

/**
 * Discover and load all plugins from the project's plugin directory.
 * Returns the loaded engines. Safe to call multiple times.
 */
export async function discoverAndLoadPlugins(rootDir: string): Promise<Engine[]> {
  if (pluginRegistry.isLoaded) {
    return pluginRegistry.getEngines()
  }

  const pluginDir = getPluginDir(rootDir)

  if (!(await exists(pluginDir))) {
    pluginRegistry.setLoaded(true)
    return []
  }

  try {
    const files = await readdir(pluginDir)
    const pluginPaths = files
      .filter((f) => f.endsWith('.js') || f.endsWith('.mjs'))
      .map((f) => join(pluginDir, f))

    const engines = await loadPlugins(pluginPaths)

    for (let i = 0; i < engines.length; i++) {
      const engine = engines[i]
      pluginRegistry.register({
        id: engine.name,
        path: pluginPaths[i],
        engine,
        loaded: true,
      })
    }

    // Register failed entries for files that didn't produce an engine
    for (let i = 0; i < pluginPaths.length; i++) {
      const path = pluginPaths[i]
      const engine = engines.find((e) => {
        const entry = pluginRegistry.getAll()
          .find((ent) => ent.path === path)
        return entry?.engine
      })
      if (!engine && !pluginRegistry.has(path)) {
        pluginRegistry.register({
          id: `plugin-${i}`,
          path,
          engine: null as unknown as Engine,
          loaded: false,
          error: 'Failed to load plugin module',
        })
      }
    }

    pluginRegistry.setLoaded(true)
    return engines
  } catch {
    pluginRegistry.setLoaded(true)
    return []
  }
}
