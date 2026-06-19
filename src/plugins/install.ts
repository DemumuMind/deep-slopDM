// ── Plugin Install ─────────────────────────────────────
// Installs a plugin by copying or symlinking to .deep-slop/plugins/

import { join, basename, resolve } from 'node:path'
import { access, copyFile, mkdir, symlink, unlink, readFile } from 'node:fs/promises'
import { getPluginDir, pluginRegistry, discoverAndLoadPlugins } from './registry.js'
import { loadPlugin } from './loader.js'

async function exists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

export interface InstallResult {
  success: boolean
  message: string
  pluginPath?: string
}

