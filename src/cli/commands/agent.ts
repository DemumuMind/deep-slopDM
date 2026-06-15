import { resolve } from 'node:path'
import type { Command } from 'commander'
import { runRepairLoop, planRepair, type RepairResult } from '../../agent/repair.js'
import { detectAllProviders } from '../../agents/providers.js'
import { connectProvider, resolveProvider } from '../../agent/connect.js'
import { setProviderPreference } from '../../agent/use.js'
import { style, styleBold, separator, scoreLabel } from '../../output/theme.js'
import {
  runMonitorLoop,
  spawnBackgroundMonitor,
  listMonitors,
  readMonitorState,
  stopMonitor,
  type MonitorOptions,
} from '../../agent/monitor.js'
import {
  listSessions,
  getSession,
  updateSession,
} from '../../agent/sessions.js'

export function register(program: Command): void {
  const agentCmd = program
    .command('agent')
    .description('AI agent-powered repair commands')

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

  agentCmd
    .command('connect')
    .description('Connect and verify an AI agent provider')
    .argument('<provider>', 'Provider name (claude/codex/aider/cursor/opencode/goose)')
    .argument('[path]', 'project directory', '.')
    .action(async (provider: string, path: string) => {
      const rootDir = resolve(path)

      console.log('')
      console.log(separator())
      console.log(styleBold('info', `  Connecting to ${provider}...`))
      console.log(separator())

      const result = await connectProvider(provider, rootDir)

      if (result.success) {
        console.log(`  ${style('success', '✔')} ${result.message}`)
        console.log(`  ${style('muted', 'Provider preference saved to .deep-slop/provider')}`)
      } else {
        console.log(`  ${style('danger', '✖')} ${result.message}`)
      }

      console.log(separator())
      console.log('')

      if (!result.success) {
        process.exit(1)
      }
    })

  agentCmd
    .command('use')
    .description('Set default AI agent provider for this project')
    .argument('<provider>', 'Provider name (claude/codex/aider/cursor/opencode/goose/auto)')
    .argument('[path]', 'project directory', '.')
    .action(async (provider: string, path: string) => {
      const rootDir = resolve(path)

      console.log('')
      console.log(separator())
      console.log(styleBold('info', `  Setting default provider: ${provider}`))
      console.log(separator())

      try {
        if (provider === 'auto') {
          const resolved = await resolveProvider('auto', rootDir)
          setProviderPreference(resolved, rootDir)
          console.log(`  ${style('success', '✔')} Auto-detected: ${style('info', resolved)}`)
          console.log(`  ${style('muted', 'Saved to .deep-slop/provider')}`)
        } else {
          setProviderPreference(provider, rootDir)
          console.log(`  ${style('success', '✔')} Default provider set to ${style('info', provider)}`)
          console.log(`  ${style('muted', 'Saved to .deep-slop/provider')}`)
        }
      } catch (err) {
        console.log(`  ${style('danger', '✖')} ${err instanceof Error ? err.message : String(err)}`)
        console.log(separator())
        console.log('')
        process.exit(1)
      }

      console.log(separator())
      console.log('')
    })

  agentCmd
    .command('providers')
    .description('Show installed AI agent providers and their availability')
    .action(async () => {
      const providers = await detectAllProviders()

      console.log('')
      console.log(separator())
      console.log(styleBold('info', '  AI Agent Providers'))
      console.log(separator())

      for (const p of providers) {
        const icon = p.available ? style('success', '✔') : style('muted', '✖')
        const status = p.available ? style('success', 'available') : style('muted', 'not installed')
        console.log(`  ${icon} ${style('info', p.name.padEnd(10))} ${status}`)
      }

      console.log(separator())
      console.log('')
    })

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

  const monitorCmd = agentCmd
    .command('monitor')
    .description('Watch for git changes and auto-repair when score drops below target')

  monitorCmd
    .command('start', { isDefault: true })
    .description('Start monitoring a directory for changes')
    .argument('[directory]', 'project directory', '.')
    .option('--background', 'Spawn detached process and return immediately')
    .option('--once', 'Single scan cycle then exit')
    .option('--target-score <n>', 'Auto-repair when score drops below', '75')
    .option('--repair', 'Auto-repair on regression')
    .option('--interval <ms>', 'Polling interval in ms', '10000')
    .option('--provider <name>', 'Agent provider to use (claude/codex/cursor/opencode/aider/goose/windsurf/vscode/amp/gemini-cli/kimi/warp/pi/crush/deep-agents/antigravity)', 'claude')
    .option('--max-turns <n>', 'Max repair turns', '5')
    .action(async (directory: string, opts: Record<string, any>) => {
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
    })

  monitorCmd
    .command('list')
    .description('List all monitors')
    .argument('[directory]', 'project directory', '.')
    .action((directory: string) => {
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
    })

  monitorCmd
    .command('show')
    .description('Show details for a specific monitor')
    .argument('<id>', 'Monitor ID')
    .argument('[directory]', 'project directory', '.')
    .action((id: string, directory: string) => {
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
    })

  monitorCmd
    .command('stop')
    .description('Stop a running monitor')
    .argument('<id>', 'Monitor ID')
    .argument('[directory]', 'project directory', '.')
    .action((id: string, directory: string) => {
      const rootDir = resolve(directory)
      const stopped = stopMonitor(rootDir, id)

      if (!stopped) {
        console.log(style('danger', `  Monitor not found: ${id}`))
        process.exit(1)
      }

      console.log('')
      console.log(style('success', `  Monitor ${id} stopped`))
      console.log('')
    })

  agentCmd
    .command('sessions')
    .description('List all agent repair sessions')
    .argument('[directory]', 'project directory', '.')
    .action((directory: string) => {
      const rootDir = resolve(directory)
      const sessions = listSessions(rootDir)

      console.log('')
      console.log(separator())
      console.log(styleBold('info', '  Agent Sessions'))
      console.log(separator())

      if (sessions.length === 0) {
        console.log(style('muted', '  No sessions found'))
      } else {
        console.log(`  ${style('muted', 'ID'.padEnd(20))} ${style('muted', 'Phase'.padEnd(18))} ${style('muted', 'Score'.padEnd(12))} ${style('muted', 'Turns')}  ${style('muted', 'Provider')}`)
        for (const s of sessions) {
          const phaseStr = s.phase === 'done' ? style('success', s.phase)
            : s.phase === 'error' ? style('danger', s.phase)
            : s.phase === 'running' ? style('info', s.phase)
            : s.phase === 'awaiting-decision' ? style('warn', s.phase)
            : style('muted', s.phase)
          const scoreDelta = s.finalScore - s.initialScore
          const scoreStr = `${s.initialScore}→${s.finalScore}${scoreDelta >= 0 ? style('success', `+${scoreDelta}`) : style('danger', String(scoreDelta))}`
          console.log(`  ${style('suggestion', s.id.padEnd(20))} ${phaseStr.padEnd(18 + 20)} ${scoreStr.padEnd(12 + 20)} ${String(s.turns).padEnd(6)} ${style('info', s.provider)}`)
        }
      }

      console.log(separator())
      console.log('')
    })

  agentCmd
    .command('show')
    .description('Show details for a specific agent session')
    .argument('<id>', 'Session ID')
    .argument('[directory]', 'project directory', '.')
    .action((id: string, directory: string) => {
      const rootDir = resolve(directory)
      const detail = getSession(rootDir, id)

      if (!detail) {
        console.log(style('danger', `  Session not found: ${id}`))
        process.exit(1)
      }

      console.log('')
      console.log(separator())
      console.log(styleBold('info', `  Session: ${detail.id}`))
      console.log(separator())
      console.log(`  Provider:     ${style('info', detail.provider)}`)
      console.log(`  Phase:        ${detail.phase === 'done' ? style('success', detail.phase) : detail.phase === 'error' ? style('danger', detail.phase) : style('info', detail.phase)}`)
      console.log(`  Started:      ${detail.startTime}`)
      if (detail.endTime) console.log(`  Ended:        ${detail.endTime}`)
      const delta = detail.finalScore - detail.initialScore
      const deltaStr = delta >= 0 ? style('success', `+${delta}`) : style('danger', String(delta))
      console.log(`  Score:        ${detail.initialScore} → ${detail.finalScore} (${deltaStr})`)
      console.log(`  Target:       ${detail.targetScore}`)
      console.log(`  Turns:        ${detail.turns}/${detail.maxTurns}`)
      console.log(`  Files:        ${detail.filesCount} modified`)
      if (detail.error) console.log(`  Error:        ${style('danger', detail.error)}`)

      if (detail.steps.length > 0) {
        console.log('')
        console.log(style('muted', '  Steps:'))
        for (const step of detail.steps) {
          const icon = step.type === 'scan' ? '🔍'
            : step.type === 'fix' ? '🔧'
            : step.type === 'rollback' ? '↩'
            : step.type === 'commit' ? '📦'
            : step.type === 'verify' ? '✓'
            : step.type === 'provider-call' ? '⚡'
            : step.type === 'file-edit' ? '✎'
            : '·'
          const timeStr = step.timestamp.split('T')[1]?.slice(0, 8) ?? ''
          const scoreStr = step.score !== undefined ? ` score=${step.score}` : ''
          console.log(`    ${icon} ${style('muted', timeStr)} ${step.description}${style('muted', scoreStr)}`)
        }
      }

      if (detail.files.length > 0) {
        console.log('')
        console.log(style('muted', '  Modified files:'))
        for (const f of detail.files) {
          console.log(`    ${style('suggestion', f)}`)
        }
      }

      console.log(separator())
      console.log('')
    })

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

  agentCmd
    .command('stop')
    .description('Stop a running agent session (sets phase to error)')
    .argument('<id>', 'Session ID')
    .argument('[directory]', 'project directory', '.')
    .action((id: string, directory: string) => {
      const rootDir = resolve(directory)
      const detail = getSession(rootDir, id)

      if (!detail) {
        console.log(style('danger', `  Session not found: ${id}`))
        process.exit(1)
      }

      if (detail.phase !== 'running' && detail.phase !== 'starting') {
        console.log(style('warn', `  Session ${id} is not running (phase: ${detail.phase})`))
        return
      }

      updateSession(rootDir, id, {
        phase: 'error',
        endTime: new Date().toISOString(),
        error: 'Stopped by user',
      })

      console.log('')
      console.log(style('success', `  Session ${id} stopped`))
      console.log('')
    })
}
