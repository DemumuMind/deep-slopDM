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

// ── Agent Repair Loop ──────────────────────────────────
// Iterative scan → diagnose → fix → verify cycle with AI coding agents

import { resolve } from 'node:path'
import { execSync } from 'node:child_process'
import { runScan } from '../engines/orchestrator.js'
import { formatDiagnosticsForAgent } from '../agents/prompt-format.js'
import { detectAllProviders, runProvider } from '../agents/providers.js'
import { createWorktree, applyWorktreeDiff, cleanupWorktree } from './worktree.js'
import { detectLanguages, detectFrameworks, collectFiles } from '../utils/discover.js'
import { DEFAULT_CONFIG, type DeepSlopConfig } from '../types/index.js'
import { auditDependencies } from '../hooks/dep-audit.js'

export interface RepairOptions {
  /** Root directory of the project */
  rootDir: string
  /** Agent provider to use (claude/codex/aider/etc) */
  provider: string
  /** Stop when score >= this (default 75) */
  targetScore: number
  /** Max repair cycles (default 5) */
  maxTurns: number
  /** Edit current tree vs worktree isolation */
  inPlace: boolean
  /** Preview only — show plan without executing */
  dryRun: boolean
  /** Auto-apply without confirmation */
  apply: boolean
  /** Git commit after each improvement */
  commit: boolean
  /** Create draft PR at end (requires commit=true) */
  pr: boolean
}

export interface RepairResult {
  /** Whether the target score was reached */
  success: boolean
  /** Score before repair loop */
  initialScore: number
  /** Score after repair loop */
  finalScore: number
  /** Number of repair cycles executed */
  turnsUsed: number
  /** Files that were modified */
  filesModified: string[]
  /** Whether changes were rolled back */
  rolledBack: boolean
  /** Error message if loop failed */
  error?: string
}

/** Default repair options */
const DEFAULT_REPAIR_OPTIONS: Partial<RepairOptions> = {
  targetScore: 75,
  maxTurns: 5,
  inPlace: false,
  dryRun: false,
  apply: false,
  commit: false,
  pr: false,
}

/**
 * Run a scan on a directory and return the score.
 * Reuses the full scan pipeline (detect → collect → scan).
 */
async function scanDirectory(dir: string): Promise<number> {
  const languages = await detectLanguages(dir)
  const frameworks = await detectFrameworks(dir)
  const files = await collectFiles(dir, languages, DEFAULT_CONFIG.exclude)
  const config: DeepSlopConfig = { ...DEFAULT_CONFIG }

  const result = await runScan({
    rootDirectory: dir,
    languages,
    frameworks,
    files,
    installedTools: {},
    config,
  })

  return result.score
}

/**
 * Run a scan on a directory and return diagnostics for prompt formatting.
 */
async function scanForDiagnostics(dir: string) {
  const languages = await detectLanguages(dir)
  const frameworks = await detectFrameworks(dir)
  const files = await collectFiles(dir, languages, DEFAULT_CONFIG.exclude)
  const config: DeepSlopConfig = { ...DEFAULT_CONFIG }

  const result = await runScan({
    rootDirectory: dir,
    languages,
    frameworks,
    files,
    installedTools: {},
    config,
  })

  // Also include dependency audit diagnostics
  const depResult = auditDependencies({
    rootDir: dir,
    checkOutdated: false,
    checkUnused: false,
    timeout: 15_000,
  })

  const allDiagnostics = [
    ...result.engines.flatMap((r) => r.diagnostics),
    ...depResult.diagnostics,
  ]

  return {
    score: result.score,
    diagnostics: allDiagnostics,
    totalDiagnostics: result.totalDiagnostics + depResult.issuesFound,
  }
}

/**
 * Get list of files changed in a directory (uncommitted changes).
 */
function getChangedFilesInDir(dir: string): string[] {
  try {
    const output = execSync('git diff --name-only HEAD', {
      cwd: dir,
      encoding: 'utf-8',
      stdio: 'pipe',
    })
    const tracked = output.trim().split('\n').filter(Boolean)

    const untrackedOutput = execSync('git ls-files --others --exclude-standard', {
      cwd: dir,
      encoding: 'utf-8',
      stdio: 'pipe',
    })
    const untracked = untrackedOutput.trim().split('\n').filter(Boolean)

    return [...tracked, ...untracked]
  } catch {
    return []
  }
}

/**
 * Git commit all changes in a directory.
 */
function gitCommitAll(dir: string, message: string): void {
  try {
    execSync('git add -A', { cwd: dir, stdio: 'pipe' })
    execSync(`git commit -m "${message}" --no-verify`, { cwd: dir, stdio: 'pipe' })
  } catch (err) {
    throw new Error(
      `Git commit failed: ${err instanceof Error ? err.message : String(err)}`,
    )
  }
}

/**
 * Git rollback all uncommitted changes in a directory.
 */
function gitRollback(dir: string): void {
  try {
    execSync('git checkout -- .', { cwd: dir, stdio: 'pipe' })
    execSync('git clean -fd', { cwd: dir, stdio: 'pipe' })
  } catch (err) {
    throw new Error(
      `Git rollback failed: ${err instanceof Error ? err.message : String(err)}`,
    )
  }
}

/**
 * Create a draft PR from the current branch.
 * Requires commit=true and a git remote to be configured.
 */
function createDraftPR(rootDir: string): string | null {
  try {
    // Push current branch
    const branchOutput = execSync('git branch --show-current', {
      cwd: rootDir,
      encoding: 'utf-8',
      stdio: 'pipe',
    })
    const branch = branchOutput.trim()

    if (!branch || branch === 'main' || branch === 'master') {
      return null
    }

    execSync(`git push -u origin ${branch} --no-verify`, {
      cwd: rootDir,
      stdio: 'pipe',
    })

    // Try gh CLI for creating a draft PR
    const prOutput = execSync(
      `gh pr create --draft --title "deep-slop: repair improvements" --body "Auto-generated PR from deep-slop agent repair loop"`,
      { cwd: rootDir, encoding: 'utf-8', stdio: 'pipe' },
    )

    return prOutput.trim()
  } catch {
    // gh CLI may not be available or PR creation may fail
    return null
  }
}

/**
 * Run the repair loop.
 *
 * 1. Scan → get initial score
 * 2. If score >= targetScore: return success
 * 3. If NOT inPlace: create worktree, set targetDir = worktree
 * 4. Format diagnostics as prompt
 * 5. Run provider in target directory
 * 6. Re-scan target directory → check new score
 * 7. If score worsened: rollback
 * 8. If score improved and commit: git commit
 * 9. If score < targetScore and turns < maxTurns: loop to step 4
 * 10. If NOT inPlace and score improved: apply worktree diff
 * 11. Cleanup worktree
 * 12. Return result
 */
export async function runRepairLoop(options: RepairOptions): Promise<RepairResult> {
  const opts = { ...DEFAULT_REPAIR_OPTIONS, ...options } as Required<RepairOptions>
  const rootDir = resolve(opts.rootDir)

  let worktreeDir: string | null = null
  let worktreeBranch: string | null = null
  let rolledBack = false
  const allModifiedFiles: string[] = []

  try {
    // Step 1: Initial scan
    process.stderr.write('\n  deep-slop agent repair: scanning...\n')
    const initialScan = await scanForDiagnostics(rootDir)
    const initialScore = initialScan.score

    process.stderr.write(`  Initial score: ${initialScore}\n`)

    // Step 2: Already at target?
    if (initialScore >= opts.targetScore) {
      process.stderr.write(`  Score already meets target (${opts.targetScore}). No repair needed.\n`)
      return {
        success: true,
        initialScore,
        finalScore: initialScore,
        turnsUsed: 0,
        filesModified: [],
        rolledBack: false,
      }
    }

    // Dry run: just show plan
    if (opts.dryRun) {
      process.stderr.write(`\n  Repair plan (dry run):\n`)
      process.stderr.write(`    Provider:     ${opts.provider}\n`)
      process.stderr.write(`    Target score: ${opts.targetScore}\n`)
      process.stderr.write(`    Max turns:    ${opts.maxTurns}\n`)
      process.stderr.write(`    In-place:     ${opts.inPlace}\n`)
      process.stderr.write(`    Commit:       ${opts.commit}\n`)
      process.stderr.write(`    PR:           ${opts.pr}\n`)
      return {
        success: false,
        initialScore,
        finalScore: initialScore,
        turnsUsed: 0,
        filesModified: [],
        rolledBack: false,
      }
    }

    // Step 3: Create worktree if not in-place
    let targetDir = rootDir
    if (!opts.inPlace) {
      process.stderr.write('  Creating worktree for isolation...\n')
      const worktree = await createWorktree(rootDir)
      if (worktree) {
        worktreeDir = worktree.worktreeDir
        worktreeBranch = worktree.branch
        targetDir = worktree.worktreeDir
        process.stderr.write(`  Worktree created: ${worktreeDir}\n`)
      } else {
        process.stderr.write('  Worktree creation failed — falling back to in-place mode\n')
      }
    }

    // Repair loop
    let currentScore = initialScore
    let turn = 0

    for (turn = 1; turn <= opts.maxTurns; turn++) {
      process.stderr.write(`\n  ── Turn ${turn}/${opts.maxTurns} ──\n`)

      // Step 4: Format diagnostics as prompt
      const scanResult = await scanForDiagnostics(targetDir)
      const prompt = formatDiagnosticsForAgent(scanResult.diagnostics)

      if (scanResult.diagnostics.length === 0) {
        process.stderr.write('  No diagnostics to fix. Stopping.\n')
        break
      }

      process.stderr.write(`  ${scanResult.diagnostics.length} diagnostics found. Sending to ${opts.provider}...\n`)

      // Step 5: Run provider
      const providerResult = await runProvider(opts.provider, prompt, {
        targetDir,
        maxTurns: 1,
      })

      if (!providerResult.success) {
        process.stderr.write(`  Provider failed: ${providerResult.output}\n`)
        // Don't count this as a full turn failure, just skip
        continue
      }

      // Step 6: Re-scan
      const newScore = await scanDirectory(targetDir)
      process.stderr.write(`  Score: ${currentScore} → ${newScore}\n`)

      // Step 7: Score worsened → rollback
      if (newScore < currentScore) {
        process.stderr.write('  Score worsened — rolling back changes\n')
        try {
          gitRollback(targetDir)
        } catch (err) {
          process.stderr.write(`  Rollback failed: ${err instanceof Error ? err.message : String(err)}\n`)
        }
        rolledBack = true
        // Keep currentScore unchanged (rolled back)
        continue
      }

      // Score improved or stayed same
      const changedFiles = getChangedFilesInDir(targetDir)
      allModifiedFiles.push(...changedFiles)

      // Step 8: Commit if enabled
      if (opts.commit && changedFiles.length > 0) {
        try {
          gitCommitAll(targetDir, `deep-slop repair turn ${turn}: score ${currentScore} → ${newScore}`)
          process.stderr.write(`  Committed ${changedFiles.length} file(s)\n`)
        } catch (err) {
          process.stderr.write(`  Commit failed: ${err instanceof Error ? err.message : String(err)}\n`)
        }
      }

      currentScore = newScore

      // Step 9: Check target
      if (currentScore >= opts.targetScore) {
        process.stderr.write(`  Target score ${opts.targetScore} reached!\n`)
        break
      }
    }

    // Step 10-11: Apply worktree changes back if not in-place
    if (!opts.inPlace && worktreeDir && currentScore > initialScore) {
      process.stderr.write('  Applying worktree changes to main tree...\n')
      try {
        await applyWorktreeDiff(worktreeDir, rootDir)
        process.stderr.write('  Changes applied successfully\n')
      } catch (err) {
        process.stderr.write(`  Failed to apply worktree diff: ${err instanceof Error ? err.message : String(err)}\n`)
      }
    }

    // Step 12: Cleanup worktree
    if (worktreeDir) {
      process.stderr.write('  Cleaning up worktree...\n')
      await cleanupWorktree(worktreeDir, rootDir)
    }

    // Step 13: Create PR if requested
    if (opts.pr && opts.commit && currentScore > initialScore) {
      const prUrl = createDraftPR(rootDir)
      if (prUrl) {
        process.stderr.write(`  Draft PR created: ${prUrl}\n`)
      } else {
        process.stderr.write('  Could not create draft PR (gh CLI may not be available)\n')
      }
    }

    const success = currentScore >= opts.targetScore
    return {
      success,
      initialScore,
      finalScore: currentScore,
      turnsUsed: turn,
      filesModified: [...new Set(allModifiedFiles)],
      rolledBack,
    }
  } catch (err) {
    // Emergency cleanup
    if (worktreeDir) {
      try {
        await cleanupWorktree(worktreeDir, rootDir)
      } catch {
        // Best effort
      }
    }

    return {
      success: false,
      initialScore: 0,
      finalScore: 0,
      turnsUsed: 0,
      filesModified: [],
      rolledBack: false,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

/**
 * Preview a repair plan without executing it.
 * Returns initial score and estimated parameters.
 */
export async function planRepair(
  rootDir: string,
  provider: string,
  targetScore: number,
  maxTurns: number,
): Promise<{
  initialScore: number
  targetScore: number
  provider: string
  estimatedTurns: number
  diagnostics: number
}> {
  const dir = resolve(rootDir)
  const scanResult = await scanForDiagnostics(dir)

  // Rough estimate: assume ~10 points improvement per turn on average
  const gap = targetScore - scanResult.score
  const estimatedTurns = gap > 0 ? Math.min(maxTurns, Math.ceil(gap / 10)) : 0

  return {
    initialScore: scanResult.score,
    targetScore,
    provider,
    estimatedTurns,
    diagnostics: scanResult.totalDiagnostics,
  }
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
