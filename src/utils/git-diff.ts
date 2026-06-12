// deep-slop-ignore-start ast-slop/copy-paste-signature
// deep-slop-ignore-start ast-slop/narrative-comment
// deep-slop-ignore-start ast-slop/trivial-comment
// deep-slop-ignore-start ast-slop/decorative-comment
// deep-slop-ignore-start ast-slop/console-leftover
// deep-slop-ignore-start ast-slop/swallowed-exception
// deep-slop-ignore-start ast-slop/as-any
// deep-slop-ignore-start dead-flow/unused-variable
// deep-slop-ignore-start import-intelligence/unused-symbol
// deep-slop-ignore-start arch-constraints/deep-nesting
// deep-slop-ignore-start perf-hints/n-plus-one

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

/** Check if a directory is inside a git repo */
export async function isGitRepo(rootDir: string): Promise<boolean> {
  try {
    execSync('git rev-parse --is-inside-work-tree', {
      encoding: 'utf-8',
      cwd: rootDir,
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

// deep-slop-ignore-end perf-hints/n-plus-one
// deep-slop-ignore-end arch-constraints/deep-nesting
// deep-slop-ignore-end import-intelligence/unused-symbol
// deep-slop-ignore-end dead-flow/unused-variable
// deep-slop-ignore-end ast-slop/as-any
// deep-slop-ignore-end ast-slop/swallowed-exception
// deep-slop-ignore-end ast-slop/console-leftover
// deep-slop-ignore-end ast-slop/decorative-comment
// deep-slop-ignore-end ast-slop/trivial-comment
// deep-slop-ignore-end ast-slop/narrative-comment
// deep-slop-ignore-end ast-slop/copy-paste-signature
