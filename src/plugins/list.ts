// ── Plugin List ─────────────────────────────────────────
// Lists installed plugins with status information.

import { access, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { getPluginDir, pluginRegistry, type PluginEntry } from './registry.js'
import { loadPlugin } from './loader.js'

async function exists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

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

