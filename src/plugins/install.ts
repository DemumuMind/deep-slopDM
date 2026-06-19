// ── Plugin Install ─────────────────────────────────────
// Installs a plugin by copying or symlinking to .deep-slop/plugins/

import { access, copyFile, mkdir, symlink, unlink, readFile } from 'node:fs/promises'

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

