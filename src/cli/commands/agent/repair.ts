import { resolve } from 'node:path'
import type { Command } from 'commander'
import { runRepairLoop, planRepair, type RepairResult } from '../../../agent/repair.js'
import { getSession } from '../../../agent/sessions.js'
import {
  runMonitorLoop,
  spawnBackgroundMonitor,
  listMonitors,
  readMonitorState,
  stopMonitor,
  type MonitorOptions,
} from '../../../agent/monitor.js'
import { style, styleBold, separator, scoreLabel } from '../../../output/theme.js'

export function registerRepair(agentCmd: Command): void {
  agentCmd
    .command('repair')
    .description('Run AI agent repair loop to improve code quality score')
    .argument('[path]', 'project directory', '.')
    .option('--provider <name>', 'Agent provider to use (claude/codex/cursor/opencode/aider/goose/windsurf/vscode/amp/gemini-cli/kimi/warp/pi/crush/deep-agents/antigravity)', 'claude')
    .option('--target-score <n>', 'Target score to reach (default 75)', '75')
    .option('--max-turns <n>', 'Maximum repair cycles (default 5)', '5')
    .option('--in-place', 'Edit current tree (no worktree isolation)')
    .option('--dry-run', 'Preview only — show plan without executing')
    .option('--apply', 'Auto-apply without confirmation')
    .option('--commit', 'Git commit after each improvement')
    .option('--pr', 'Create draft PR at end (requires --commit)')
    .action(async (path: string, opts: Record<string, any>) => {
      const rootDir = resolve(path)

      console.log('')
      console.log(separator())
      console.log(styleBold('info', '  deep-slop agent repair'), style('muted', rootDir))
      console.log(separator())

      try {
        const result: RepairResult = await runRepairLoop({
          rootDir,
          provider: opts.provider,
          targetScore: parseInt(opts.targetScore ?? '75', 10),
          maxTurns: parseInt(opts.maxTurns ?? '5', 10),
          inPlace: opts.inPlace ?? false,
          dryRun: opts.dryRun ?? false,
          apply: opts.apply ?? false,
          commit: opts.commit ?? false,
          pr: opts.pr ?? false,
        })

        console.log('')
        console.log(separator())
        console.log(styleBold('info', '  Repair Summary'))
        console.log(separator())

        const scoreColor = result.finalScore >= result.initialScore ? 'success' : 'danger'
        console.log(`  Initial score: ${result.initialScore} (${scoreLabel(result.initialScore)})`)
        console.log(`  Final score:   ${styleBold(scoreColor, String(result.finalScore))} (${scoreLabel(result.finalScore)})`)
        console.log(`  Target score:  ${opts.targetScore ?? '75'}`)
        console.log(`  Turns used:    ${result.turnsUsed}`)
        console.log(`  Files changed: ${result.filesModified.length}`)

        if (result.rolledBack) {
          console.log(`  ${styleBold('warn', 'ROLLBACK')} — some changes were rolled back (score worsened)`)
        }

        if (result.success) {
          console.log(`  ${styleBold('success', 'SUCCESS')} — target score reached!`)
        } else if (result.error) {
          console.log(`  ${styleBold('danger', 'ERROR')} — ${result.error}`)
        } else {
          console.log(`  ${style('warn', 'Did not reach target score in')} ${result.turnsUsed} turns`)
        }

        if (result.filesModified.length > 0) {
          console.log('')
          console.log(style('muted', '  Modified files:'))
          for (const f of result.filesModified) {
            console.log(`    ${style('suggestion', f)}`)
          }
        }

        console.log(separator())
        console.log('')

        if (!result.success && !result.error) {
          process.exit(1)
        }
      } catch (err) {
        console.log(`  ${styleBold('danger', 'Error:')} ${err instanceof Error ? err.message : String(err)}`)
        console.log(separator())
        console.log('')
        process.exit(1)
      }
    })
}

export function registerPlan(agentCmd: Command): void {
  agentCmd
    .command('plan')
    .description('Preview repair plan without running (shows initial score, target, provider, estimated turns)')
    .argument('[path]', 'project directory', '.')
    .option('--provider <name>', 'Agent provider to use (claude/codex/cursor/opencode/aider/goose/windsurf/vscode/amp/gemini-cli/kimi/warp/pi/crush/deep-agents/antigravity)', 'claude')
    .option('--target-score <n>', 'Target score', '75')
    .option('--max-turns <n>', 'Max cycles', '5')
    .action(async (path: string, opts: Record<string, any>) => {
      const rootDir = resolve(path)

      console.log('')
      console.log(separator())
      console.log(styleBold('info', '  Repair Plan'), style('muted', rootDir))
      console.log(separator())

      try {
        const plan = await planRepair(
          rootDir,
          opts.provider ?? 'claude',
          parseInt(opts.targetScore ?? '75', 10),
          parseInt(opts.maxTurns ?? '5', 10),
        )

        console.log(`  Current score:  ${styleBold(plan.initialScore >= 75 ? 'success' : plan.initialScore >= 50 ? 'warn' : 'danger', String(plan.initialScore))} (${scoreLabel(plan.initialScore)})`)
        console.log(`  Target score:   ${plan.targetScore}`)
        console.log(`  Provider:       ${style('info', plan.provider)}`)
        console.log(`  Diagnostics:    ${plan.diagnostics} issues found`)
        console.log(`  Est. turns:     ${plan.estimatedTurns}`)

        if (plan.initialScore >= plan.targetScore) {
          console.log('')
          console.log(style('success', '  Already at target score — no repair needed!'))
        }
      } catch (err) {
        console.log(`  ${styleBold('danger', 'Error:')} ${err instanceof Error ? err.message : String(err)}`)
      }

      console.log(separator())
      console.log('')
    })
}

export function registerApply(agentCmd: Command): void {
  agentCmd
    .command('apply')
    .description('Apply changes from a completed session (re-run repair with same parameters)')
    .argument('<id>', 'Session ID')
    .argument('[directory]', 'project directory', '.')
    .option('--in-place', 'Edit current tree (no worktree isolation)')
    .option('--commit', 'Git commit after each improvement')
    .action(async (id: string, directory: string, opts: Record<string, any>) => {
      const rootDir = resolve(directory)
      const detail = getSession(rootDir, id)

      if (!detail) {
        console.log(style('danger', `  Session not found: ${id}`))
        process.exit(1)
      }

      if (detail.phase !== 'done') {
        console.log(style('warn', `  Session ${id} is not completed (phase: ${detail.phase}). Cannot apply.`))
        process.exit(1)
      }

      console.log('')
      console.log(separator())
      console.log(styleBold('info', `  Re-applying session: ${id}`))
      console.log(separator())

      try {
        const result = await runRepairLoop({
          rootDir,
          provider: detail.provider,
          targetScore: detail.targetScore,
          maxTurns: detail.maxTurns,
          inPlace: opts.inPlace ?? true,
          dryRun: false,
          apply: true,
          commit: opts.commit ?? true,
          pr: false,
        })

        console.log('')
        console.log(separator())
        console.log(styleBold('info', '  Apply Summary'))
        console.log(separator())
        console.log(`  Initial score: ${result.initialScore}`)
        console.log(`  Final score:   ${styleBold(result.finalScore >= result.initialScore ? 'success' : 'danger', String(result.finalScore))}`)
        console.log(`  Turns used:    ${result.turnsUsed}`)
        console.log(`  Files changed: ${result.filesModified.length}`)
        console.log(separator())
        console.log('')
      } catch (err) {
        console.log(`  ${styleBold('danger', 'Error:')} ${err instanceof Error ? err.message : String(err)}`)
        process.exit(1)
      }
    })
}

export async function monitorStartAction(directory: string, opts: Record<string, any>): Promise<void> {
  const rootDir = resolve(directory)
  const options: MonitorOptions = {
    rootDir,
    interval: parseInt(opts.interval ?? '10000', 10),
    background: opts.background ?? false,
    once: opts.once ?? false,
    targetScore: parseInt(opts.targetScore ?? '75', 10),
    repair: opts.repair ?? false,
    provider: opts.provider ?? 'claude',
    maxTurns: parseInt(opts.maxTurns ?? '5', 10),
  }

  if (options.background) {
    const monitorId = spawnBackgroundMonitor(options)
    console.log('')
    console.log(separator())
    console.log(styleBold('info', '  Monitor started in background'))
    console.log(separator())
    console.log(`  Monitor ID:  ${style('suggestion', monitorId)}`)
    console.log(`  Root:        ${rootDir}`)
    console.log(`  Interval:    ${options.interval}ms`)
    console.log(`  Target:      ${options.targetScore}`)
    console.log(`  Auto-repair: ${options.repair ? style('success', 'yes') : style('muted', 'no')}`)
    console.log(separator())
    console.log('')
    return
  }

  try {
    await runMonitorLoop(options)
  } catch (err) {
    console.log(`  ${styleBold('danger', 'Error:')} ${err instanceof Error ? err.message : String(err)}`)
    process.exit(1)
  }
}

export function monitorListAction(directory: string): void {
  const rootDir = resolve(directory)
  const monitors = listMonitors(rootDir)

  console.log('')
  console.log(separator())
  console.log(styleBold('info', '  Monitors'))
  console.log(separator())

  if (monitors.length === 0) {
    console.log(style('muted', '  No monitors found'))
  } else {
    for (const m of monitors) {
      const statusIcon = m.status === 'running' ? style('success', '●') : m.status === 'error' ? style('danger', '✖') : style('muted', '○')
      const scoreStr = m.lastScore !== null ? String(m.lastScore) : style('muted', '—')
      console.log(`  ${statusIcon} ${style('info', m.id)}  score=${scoreStr}  cycles=${m.scanCycles}  repairs=${m.repairsTriggered}  pid=${m.pid}  ${style('muted', m.status)}`)
    }
  }

  console.log(separator())
  console.log('')
}

export function monitorShowAction(id: string, directory: string): void {
  const rootDir = resolve(directory)
  const state = readMonitorState(rootDir, id)

  if (!state) {
    console.log(style('danger', `  Monitor not found: ${id}`))
    process.exit(1)
  }

  console.log('')
  console.log(separator())
  console.log(styleBold('info', `  Monitor: ${state.id}`))
  console.log(separator())
  console.log(`  Status:       ${state.status === 'running' ? style('success', 'running') : state.status === 'error' ? style('danger', 'error') : style('muted', 'stopped')}`)
  console.log(`  Root:         ${state.rootDir}`)
  console.log(`  PID:          ${state.pid}`)
  console.log(`  Started:     ${state.startedAt}`)
  console.log(`  Last score:   ${state.lastScore !== null ? state.lastScore : style('muted', '—')}`)
  console.log(`  Scan cycles:  ${state.scanCycles}`)
  console.log(`  Repairs:      ${state.repairsTriggered}`)
  console.log(`  Interval:     ${state.options.interval}ms`)
  console.log(`  Target:       ${state.options.targetScore}`)
  console.log(`  Auto-repair:  ${state.options.repair ? 'yes' : 'no'}`)
  console.log(`  Provider:     ${state.options.provider}`)
  console.log(separator())
  console.log('')
}

export function monitorStopAction(id: string, directory: string): void {
  const rootDir = resolve(directory)
  const stopped = stopMonitor(rootDir, id)

  if (!stopped) {
    console.log(style('danger', `  Monitor not found: ${id}`))
    process.exit(1)
  }

  console.log('')
  console.log(style('success', `  Monitor ${id} stopped`))
  console.log('')
}
