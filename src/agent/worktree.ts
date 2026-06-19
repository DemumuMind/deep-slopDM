// ── Git Worktree Management ─────────────────────────────
// Isolated worktree for agent repair — changes stay separate until verified

import { execSync } from 'node:child_process'
import { join, basename, dirname, relative } from 'node:path'
import { access, cp, rm, mkdir, readdir, stat } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'

async function exists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

/**
 * Create a temporary git worktree for isolated agent repair.
 * Falls back to in-place mode if worktree creation fails (returns null branch).
 */
export async function createWorktree(
  rootDir: string,
): Promise<{ worktreeDir: string, branch: string } | null> {
  const id = randomUUID().slice(0, 8)
  const branch = `deep-slop-repair-${id}`
  const worktreeBase = dirname(rootDir)
  const worktreeDir = join(worktreeBase, `.deep-slop-worktree-${id}`)

  try {
    // Create temporary branch from HEAD
    execSync(`git branch ${branch} HEAD`, {
      cwd: rootDir,
      stdio: 'pipe',
    })

    // Create worktree from that branch
    execSync(`git worktree add "${worktreeDir}" ${branch}`, {
      cwd: rootDir,
      stdio: 'pipe',
    })

    return { worktreeDir, branch }
  } catch (err) {
    // Worktree creation failed — clean up partial state
    try {
      execSync(`git branch -D ${branch} 2>/dev/null`, { cwd: rootDir, stdio: 'pipe' })
    } catch {
      // Branch may not exist, ignore
    }

    try {
      if (await exists(worktreeDir)) {
        await rm(worktreeDir, { recursive: true, force: true })
      }
    } catch {
      // Cleanup failure is non-critical
    }

    // Return null to signal fallback to in-place mode
    return null
  }
}

/**
 * Copy changed files from the worktree back to the main working tree.
 * Only copies files that differ between the worktree and the main tree.
 */
export async function applyWorktreeDiff(
  worktreeDir: string,
  rootDir: string,
): Promise<void> {
  try {
    // Get list of changed files in worktree vs its base
    const diffOutput = execSync(
      `git diff --name-only HEAD`,
      { cwd: worktreeDir, encoding: 'utf-8', stdio: 'pipe' },
    )

    const changedFiles = diffOutput.trim().split('\n').filter(Boolean)

    // Also pick up untracked files
    const untrackedOutput = execSync(
      `git ls-files --others --exclude-standard`,
      { cwd: worktreeDir, encoding: 'utf-8', stdio: 'pipe' },
    )

    const untrackedFiles = untrackedOutput.trim().split('\n').filter(Boolean)
    const allFiles = [...changedFiles, ...untrackedFiles]

    for (const relPath of allFiles) {
      const src = join(worktreeDir, relPath)
      const dest = join(rootDir, relPath)

      if (await exists(src)) {
        // Ensure destination directory exists
        const destDir = dirname(dest)
        if (!(await exists(destDir))) {
          await mkdir(destDir, { recursive: true })
        }

        // Copy file (preserves content)
        await cp(src, dest, { force: true })
      }
    }
  } catch (err) {
    throw new Error(
      `Failed to apply worktree diff: ${err instanceof Error ? err.message : String(err)}`,
    )
  }
}

/**
 * Remove the worktree and delete the temporary branch.
 * Safe to call even if worktree was never created or already removed.
 */
export async function cleanupWorktree(
  worktreeDir: string,
  rootDir: string,
): Promise<void> {
  let branch = ''

  try {
    // Extract branch name from worktree
    const branchOutput = execSync(
      `git worktree list --porcelain`,
      { cwd: rootDir, encoding: 'utf-8', stdio: 'pipe' },
    )

    for (const line of branchOutput.split('\n')) {
      if (line.startsWith('worktree ' + worktreeDir)) {
        // Next lines contain branch info
      }
      if (line.startsWith('branch ')) {
        const candidate = line.replace('branch ', '').replace('refs/heads/', '')
        if (candidate.startsWith('deep-slop-repair-')) {
          branch = candidate
        }
      }
    }
  } catch {
    // Best-effort branch discovery
  }

  // Remove the worktree
  try {
    execSync(`git worktree remove --force "${worktreeDir}"`, {
      cwd: rootDir,
      stdio: 'pipe',
    })
  } catch {
    // Force-remove directory if git worktree remove fails
    try {
      if (await exists(worktreeDir)) {
        await rm(worktreeDir, { recursive: true, force: true })
      }
    } catch {
      // Directory cleanup failure is non-critical
    }
  }

  // Prune any stale worktree references
  try {
    execSync('git worktree prune', { cwd: rootDir, stdio: 'pipe' })
  } catch {
    // Prune failure is non-critical
  }

  // Delete the temporary branch
  if (branch) {
    try {
      execSync(`git branch -D ${branch}`, { cwd: rootDir, stdio: 'pipe' })
    } catch {
      // Branch may already be gone, ignore
    }
  }
}

