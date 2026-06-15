// ── Workspace Misconfig Rule ─────────────────────────
// Detects package.json workspaces that point to non-existent directories.

import { join } from 'node:path'
import type { Diagnostic } from '../../../types/index.js'
import { readFileContent } from '../../../utils/file-utils.js'
import { diag } from '../shared.js'

export async function detectWorkspaceMisconfig(
  rootDir: string,
  filePath: string,
): Promise<Diagnostic[]> {
  const results: Diagnostic[] = []

  if (!filePath.endsWith('package.json')) return results

  const { dirname } = await import('node:path')
  const pkgDir = dirname(filePath)
  if (pkgDir !== rootDir && pkgDir !== '.') return results

  try {
    const raw = await readFileContent(filePath)
    const pkg = JSON.parse(raw)
    const workspaces: string[] = pkg.workspaces ?? []
    if (workspaces.length === 0) return results

    const { access } = await import('node:fs/promises')
    for (const ws of workspaces) {
      try {
        await access(join(rootDir, ws))
      } catch {
        results.push(
          diag({
            filePath,
            rule: 'ast-slop/workspace-misconfig',
            severity: 'warning',
            message: `Workspace "${ws}" does not exist — package.json points to missing directory`,
            help: 'Remove the workspace entry or create the directory with a package.json. Stale workspace references cause confusing build errors.',
            line: 1,
            column: 1,
            fixable: false,
            detail: { workspace: ws },
          }),
        )
      }
    }
  } catch {
    // Not a valid package.json or can't read
  }
  return results
}
