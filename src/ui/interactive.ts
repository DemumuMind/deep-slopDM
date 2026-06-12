// ── Interactive action menu ──────────────────────────────
// Launched when `deep-slop` runs with no args in a TTY.
// After action completes, loops to "Next action?".
// Falls back to `deep-slop scan .` when not TTY or cancelled.

import { resolve } from 'node:path'
import { searchSelect } from './search-select.js'
import { style, styleBold, separator } from '../output/theme.js'

interface Action {
  id: string
  label: string
  description: string
}

const ACTIONS: Action[] = [
  { id: 'scan', label: 'Scan', description: 'Scan project for AI slop' },
  { id: 'fix', label: 'Fix', description: 'Auto-fix detected issues' },
  { id: 'agent-repair', label: 'Agent Repair', description: 'AI agent-powered repair loop' },
  { id: 'doctor', label: 'Doctor', description: 'Check environment compatibility' },
  { id: 'init', label: 'Init', description: 'Initialize configuration' },
  { id: 'rules', label: 'Rules', description: 'List available rules' },
  { id: 'hook-install', label: 'Hook Install', description: 'Install hook for AI coding tool' },
  { id: 'hook-status', label: 'Hook Status', description: 'Show installed hooks status' },
  { id: 'trend', label: 'Trend', description: 'Show score trend across scans' },
  { id: 'watch', label: 'Watch', description: 'Watch for changes and auto-scan' },
  { id: 'quit', label: 'Quit', description: 'Exit deep-slop' },
]

function actionLabel(action: Action): string {
  return `${action.label}  ${style('muted', action.description)}`
}

/** Run a single action by id, returning true to continue the loop, false to exit */
async function runAction(id: string): Promise<boolean> {
  const rootDir = resolve('.')

  switch (id) {
    case 'quit':
      return false

    case 'scan': {
      const { runScan } = await import('../engines/orchestrator.js')
      const { detectLanguages, detectFrameworks, collectFiles } = await import('../utils/discover.js')
      const { DEFAULT_CONFIG } = await import('../types/index.js')
      const { formatOutput } = await import('../output/formatter.js')
      const languages = await detectLanguages(rootDir)
      const frameworks = await detectFrameworks(rootDir)
      const files = await collectFiles(rootDir, languages, DEFAULT_CONFIG.exclude)
      const config = { ...DEFAULT_CONFIG }
      process.stderr.write(`\n  deep-slop scanning: ${rootDir}\n\n`)
      const result = await runScan({
        rootDirectory: rootDir,
        languages,
        frameworks,
        files,
        installedTools: {},
        config,
      })
      console.log(formatOutput(result))
      return true
    }

    case 'fix': {
      const { runScan } = await import('../engines/orchestrator.js')
      const { runFix: runFixPipeline } = await import('../fix/index.js')
      const { detectLanguages, detectFrameworks, collectFiles } = await import('../utils/discover.js')
      const { DEFAULT_CONFIG } = await import('../types/index.js')
      const languages = await detectLanguages(rootDir)
      const frameworks = await detectFrameworks(rootDir)
      const files = await collectFiles(rootDir, languages, DEFAULT_CONFIG.exclude)
      const config = { ...DEFAULT_CONFIG }
      process.stderr.write(`\n  deep-slop fix: ${rootDir}\n\n`)
      const scanResult = await runScan({
        rootDirectory: rootDir,
        languages,
        frameworks,
        files,
        installedTools: {},
        config,
      })
      const allDiagnostics = scanResult.engines.flatMap((r) => r.diagnostics)
      const fixResult = await runFixPipeline(allDiagnostics, {
        rootDirectory: rootDir,
        languages,
        frameworks,
        files,
        installedTools: {},
        config,
      }, { mode: 'safe', dryRun: false, verify: false })

      console.log('')
      console.log(separator())
      console.log(styleBold('info', '  Fix Summary'))
      console.log(separator())
      console.log(`  Files:       ${style('suggestion', String(fixResult.filesModified))} modified`)
      console.log(`  Diagnostics: ${style('suggestion', String(fixResult.diagnosticsFixed))} fixed`)
      console.log(separator())
      console.log('')
      return true
    }

    case 'agent-repair': {
      const { runRepairLoop } = await import('../agent/repair.js')
      const result = await runRepairLoop({
        rootDir,
        provider: 'claude',
        targetScore: 75,
        maxTurns: 5,
        inPlace: false,
        dryRun: false,
        apply: false,
        commit: false,
        pr: false,
      })
      console.log('')
      console.log(separator())
      console.log(styleBold('info', '  Repair Summary'))
      console.log(separator())
      const scoreColor = result.finalScore >= result.initialScore ? 'success' : 'danger'
      console.log(`  Initial: ${result.initialScore}  Final: ${styleBold(scoreColor, String(result.finalScore))}`)
      console.log(`  Turns:   ${result.turnsUsed}`)
      console.log(separator())
      console.log('')
      return true
    }

    case 'doctor': {
      const { runDoctor } = await import('../cli/doctor.js')
      await runDoctor('.')
      return true
    }

    case 'init': {
      const { runInit } = await import('../cli/init.js')
      runInit('.', {})
      return true
    }

    case 'rules': {
      const { getCatalog } = await import('../engines/catalog.js')
      const catalog = getCatalog()
      const byEngine = new Map<string, typeof catalog>()
      for (const rule of catalog) {
        const list = byEngine.get(rule.engine) ?? []
        list.push(rule)
        byEngine.set(rule.engine, list)
      }
      console.log('')
      console.log(styleBold('info', `  deep-slop rules (${catalog.length} rules):`))
      console.log('')
      for (const [engine, rules] of byEngine) {
        console.log(`  ${styleBold('info', engine)} ${style('muted', `(${rules.length})`)}`)
        for (const r of rules) {
          console.log(`    ${style('muted', r.id)}  ${r.description}`)
        }
        console.log('')
      }
      return true
    }

    case 'hook-install': {
      const providers: string[] = ['claude', 'cursor', 'gemini', 'cline']
      const chosen = await searchSelect(providers, {
        label: 'Select provider:',
        filter: (p) => p,
      })
      if (!chosen) return true
      const { installHook } = await import('../hooks/install.js')
      await installHook({ provider: chosen as 'claude' | 'cursor' | 'gemini' | 'cline', scope: 'project', qualityGate: false })
      return true
    }

    case 'hook-status': {
      const { getHookStatus } = await import('../hooks/status.js')
      const { readBaseline } = await import('../hooks/baseline.js')
      const statuses = getHookStatus()
      console.log('')
      console.log(separator())
      console.log(styleBold('info', '  deep-slop hook status'))
      console.log(separator())
      for (const s of statuses) {
        const icon = s.installed ? style('success', '✔') : style('muted', '✖')
        const scopeStr = s.installed ? ` (${s.scope})` : ''
        console.log(`  ${icon} ${s.provider}${scopeStr}`)
      }
      console.log(separator())
      console.log('')
      return true
    }

    case 'trend': {
      const { readHistory } = await import('../history/store.js')
      const { sparkline, deltaText } = await import('../history/sparkline.js')
      const records = readHistory(rootDir, 10)
      if (records.length === 0) {
        console.log(style('muted', 'No scan history. Run `deep-slop scan` first.'))
        return true
      }
      const scores = records.map((r) => r.score)
      const latest = records[records.length - 1]
      const prev = records.length >= 2 ? records[records.length - 2].score : null
      console.log('')
      console.log(styleBold('info', `Score trend (last ${records.length}):`))
      console.log(`  ${sparkline(scores)}  ${styleBold(latest.score >= 75 ? 'success' : latest.score >= 50 ? 'warn' : 'danger', String(latest.score))} (${deltaText(latest.score, prev)})`)
      console.log('')
      return true
    }

    case 'watch': {
      const { watchDirectory } = await import('../watch/watcher.js')
      const { detectLanguages, detectFrameworks, collectFiles } = await import('../utils/discover.js')
      const { DEFAULT_CONFIG } = await import('../types/index.js')
      const { formatWatchStatus, formatWatchScanResult } = await import('../watch/display.js')
      const { runScan } = await import('../engines/orchestrator.js')
      const languages = await detectLanguages(rootDir)
      const frameworks = await detectFrameworks(rootDir)
      const config = { ...DEFAULT_CONFIG }

      console.log('')
      console.log(separator())
      console.log(styleBold('info', '  deep-slop watch'), style('muted', rootDir))
      console.log(separator())

      const watcher = watchDirectory(rootDir, {
        interval: 3000,
        debounce: 2000,
        onChange: async () => {
          const allFiles = await collectFiles(rootDir, languages, config.exclude)
          const result = await runScan({
            rootDirectory: rootDir,
            languages,
            frameworks,
            files: allFiles,
            installedTools: {},
            config,
          })
          console.log(formatWatchScanResult(
            result.score,
            result.totalDiagnostics,
            result.meta.filesScanned,
            result.meta.elapsed,
          ))
        },
        onStats: () => {},
      })
      watcher.start()
      console.log(formatWatchStatus(watcher.getStats(), 'watching', null))

      // Block until Ctrl+C
      await new Promise<void>((res) => {
        process.on('SIGINT', () => {
          watcher.stop()
          res()
        })
      })
      return false
    }

    default:
      return true
  }
}

/** Main entry: show interactive menu or fall back to scan */
export async function interactiveMenu(): Promise<void> {
  // Not a TTY → fall back to scan
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    const { runScan } = await import('../engines/orchestrator.js')
    const { detectLanguages, detectFrameworks, collectFiles } = await import('../utils/discover.js')
    const { DEFAULT_CONFIG } = await import('../types/index.js')
    const { formatOutput } = await import('../output/formatter.js')
    const rootDir = resolve('.')
    const languages = await detectLanguages(rootDir)
    const frameworks = await detectFrameworks(rootDir)
    const files = await collectFiles(rootDir, languages, DEFAULT_CONFIG.exclude)
    const config = { ...DEFAULT_CONFIG }
    process.stderr.write(`\n  deep-slop scanning: ${rootDir}\n\n`)
    const result = await runScan({
      rootDirectory: rootDir,
      languages,
      frameworks,
      files,
      installedTools: {},
      config,
    })
    console.log(formatOutput(result))
    return
  }

  console.log('')
  console.log(separator())
  console.log(styleBold('info', '  deep-slop'), style('muted', 'interactive menu'))
  console.log(separator())
  console.log('')

  // Action loop
  let loop = true
  while (loop) {
    const chosen = await searchSelect(ACTIONS, {
      label: 'Action:',
      filter: actionLabel,
    })

    if (!chosen) {
      // Cancelled → fall back to scan
      console.log(style('muted', '\n  Cancelled — running scan instead.\n'))
      await runAction('scan')
      break
    }

    if (chosen.id === 'quit') {
      console.log(style('muted', '\n  Bye.\n'))
      break
    }

    await runAction(chosen.id)

    // Show "Next action?" prompt
    console.log('')
    console.log(style('muted', '  Next action?\n'))
  }
}
