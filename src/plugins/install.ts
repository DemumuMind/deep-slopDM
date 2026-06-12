// ── Plugin Install ─────────────────────────────────────
// Installs a plugin by copying or symlinking to .deep-slop/plugins/

import { join, basename, resolve } from 'node:path'
import { copyFile, mkdir, symlink, unlink, readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { getPluginDir, pluginRegistry, discoverAndLoadPlugins } from './registry.js'
import { loadPlugin } from './loader.js'

export interface InstallResult {
  success: boolean
  message: string
  pluginPath?: string
}

/**
 * Install a plugin from a source path.
 * Copies the file into .deep-slop/plugins/ and registers it.
 * If the source is already in the plugin dir, just loads it.
 */
export async function installPlugin(
  source: string,
  rootDir: string,
): Promise<InstallResult> {
  const absSource = resolve(source)
  const pluginDir = getPluginDir(rootDir)
  const destName = basename(absSource)
  const destPath = join(pluginDir, destName)

  // Validate source exists
  if (!existsSync(absSource)) {
    return {
      success: false,
      message: `Source file not found: ${absSource}`,
    }
  }

  // Must be a .js or .mjs file
  if (!destName.endsWith('.js') && !destName.endsWith('.mjs')) {
    return {
      success: false,
      message: 'Plugin must be a .js or .mjs file',
    }
  }

  // Validate that the module exports a valid Engine
  const testEngine = await loadPlugin(absSource)
  if (!testEngine) {
    return {
      success: false,
      message: `Module does not export a valid Engine: ${absSource}`,
    }
  }

  // Ensure plugin directory exists
  await mkdir(pluginDir, { recursive: true })

  // Already installed at same path
  if (absSource === destPath) {
    return {
      success: false,
      message: 'Plugin is already in the plugins directory',
    }
  }

  // Already exists at destination
  if (existsSync(destPath)) {
    return {
      success: false,
      message: `Plugin already installed: ${destName}. Remove it first.`,
    }
  }

  // Try symlink first (more dev-friendly), fall back to copy
  try {
    await symlink(absSource, destPath, 'file')
  } catch {
    try {
      await copyFile(absSource, destPath)
    } catch (err) {
      return {
        success: false,
        message: `Failed to install plugin: ${err instanceof Error ? err.message : String(err)}`,
      }
    }
  }

  // Register in the live registry
  pluginRegistry.register({
    id: testEngine.name,
    path: destPath,
    engine: testEngine,
    loaded: true,
  })

  return {
    success: true,
    message: `Plugin installed: ${testEngine.name} → ${destPath}`,
    pluginPath: destPath,
  }
}

/**
 * Remove a plugin by name or filename.
 * Unlinks the file and unregisters from the live registry.
 */
export async function removePlugin(
  nameOrFile: string,
  rootDir: string,
): Promise<InstallResult> {
  const pluginDir = getPluginDir(rootDir)

  // Try to find by engine name first
  const entry = pluginRegistry.get(nameOrFile)
  let targetPath: string | undefined

  if (entry) {
    targetPath = entry.path
  } else {
    // Try as a filename
    const candidate = join(pluginDir, nameOrFile)
    if (existsSync(candidate)) {
      targetPath = candidate
    }
  }

  if (!targetPath || !existsSync(targetPath)) {
    return {
      success: false,
      message: `Plugin not found: ${nameOrFile}`,
    }
  }

  // Remove file
  try {
    await unlink(targetPath)
  } catch (err) {
    return {
      success: false,
      message: `Failed to remove plugin file: ${err instanceof Error ? err.message : String(err)}`,
    }
  }

  // Unregister from live registry
  if (entry) {
    pluginRegistry.remove(entry.id)
  } else {
    // Find by path
    for (const entry of pluginRegistry.getAll()) {
      if (entry.path === targetPath) {
        pluginRegistry.remove(entry.id)
        break
      }
    }
  }

  return {
    success: true,
    message: `Plugin removed: ${nameOrFile}`,
  }
}
