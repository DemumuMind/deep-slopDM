// ── Plugin List ────────────────────────────────────────
// Lists installed plugins with status information.

import { readdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { getPluginDir, pluginRegistry, type PluginEntry } from './registry.js'
import { loadPlugin } from './loader.js'

export interface PluginInfo {
  /** Plugin identifier */
  id: string
  /** Engine name */
  name: string
  /** Engine description */
  description: string
  /** Supported languages */
  languages: string[]
  /** File path */
  path: string
  /** Whether the plugin loaded successfully */
  loaded: boolean
  /** Error message if loading failed */
  error?: string
}

/**
 * List all installed plugins with metadata.
 * Discovers plugins from disk if not already loaded.
 */
export async function listPlugins(rootDir: string): Promise<PluginInfo[]> {
  const pluginDir = getPluginDir(rootDir)

  if (!existsSync(pluginDir)) {
    return []
  }

  // Ensure registry is loaded
  if (!pluginRegistry.isLoaded) {
    const { discoverAndLoadPlugins } = await import('./registry.js')
    await discoverAndLoadPlugins(rootDir)
  }

  const entries = pluginRegistry.getAll()

  if (entries.length === 0) {
    // Fallback: scan directory manually
    try {
      const files = await readdir(pluginDir)
      const pluginFiles = files.filter(
        (f) => f.endsWith('.js') || f.endsWith('.mjs')
      )

      const infos: PluginInfo[] = []
      for (const file of pluginFiles) {
        const fullPath = join(pluginDir, file)
        const engine = await loadPlugin(fullPath)
        infos.push({
          id: engine?.name ?? file,
          name: engine?.name ?? '(unknown)',
          description: engine?.description ?? '(failed to load)',
          languages: engine?.supportedLanguages ?? [],
          path: fullPath,
          loaded: engine !== null,
          error: engine ? undefined : 'Failed to load plugin module',
        })
      }
      return infos
    } catch {
      return []
    }
  }

  return entries.map((entry: PluginEntry) => ({
    id: entry.id,
    name: entry.loaded ? entry.engine.name : '(failed)',
    description: entry.loaded ? entry.engine.description : '(failed to load)',
    languages: entry.loaded ? entry.engine.supportedLanguages : [],
    path: entry.path,
    loaded: entry.loaded,
    error: entry.error,
  }))
}
