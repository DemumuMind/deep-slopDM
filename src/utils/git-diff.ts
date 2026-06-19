import { execSync } from 'node:child_process'
import { basename } from 'node:path'

/** Get files changed vs HEAD or a specified base ref */
export async function getChangedFiles(baseRef?: string): Promise<string[]> {
  try {
    const ref = baseRef ?? 'HEAD'
    const output = execSync(`git diff --name-only ${ref}`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    return output.trim().split('\n').filter(Boolean)
  } catch {
    return []
  }
}

/** Get staged files (git diff --cached) */
export async function getStagedFiles(): Promise<string[]> {
  try {
    const output = execSync('git diff --cached --name-only', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    return output.trim().split('\n').filter(Boolean)
  } catch {
    return []
  }
}

/** Check if a git ref exists */
export async function baseRefExists(ref: string): Promise<boolean> {
  try {
    execSync(`git rev-parse --verify ${ref}`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    return true
  } catch {
    return false
  }
}

/**
 * Filter a list of absolute file paths to only those matching
 * the given changed-relative-paths. Matches by basename or by
 * trailing relative path segment.
 */
export function filterToChanged(files: string[], changedRelPaths: string[]): string[] {
  const changedBasenames = new Set(changedRelPaths.map((p) => basename(p)))
  const changedRelSet = new Set(changedRelPaths)

  return files.filter((absPath) => {
    const base = basename(absPath)
    // Match by basename (less precise but handles most cases)
    if (changedBasenames.has(base)) return true
    // Match by trailing relative path
    for (const rel of changedRelSet) {
      if (absPath.endsWith(rel) || absPath.endsWith('/' + rel)) return true
    }
    return false
  })
}

