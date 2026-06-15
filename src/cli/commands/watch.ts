import { resolve, relative } from 'node:path'
import type { Command } from 'commander'
import { detectLanguages, detectFrameworks, collectFiles } from '../../utils/discover.js'
import { DEFAULT_CONFIG, type DeepSlopConfig } from '../../types/index.js'
import { runScan } from '../../engines/orchestrator.js'
import { runFix as runFixPipeline } from '../../fix/index.js'
import { style, styleBold, separator, scoreLabel } from '../../output/theme.js'
import { watchDirectory, type WatchStats } from '../../watch/watcher.js'
import { formatWatchStatus, formatWatchScanResult, type WatchState } from '../../watch/display.js'

export function register(program: Command): void {
  program
    .command('watch')
    .description('Watch for file changes and auto-scan')
    .argument('[directory]', 'project directory', '.')
    .option('--interval <ms>', 'polling interval in ms', '3000')
    .option('--debounce <ms>', 'debounce window in ms', '2000')
    .option('--repair', 'auto-fix on change (runs fix pipeline in safe mode)')
    .option('--once', 'single scan cycle then exit')
    .option('--target-score <n>', 'stop watching when score reaches target')
    .action(async (directory: string, opts: Record<string, any>) => {
      const rootDir = resolve(directory)
      const debounceMs = parseInt(opts.debounce ?? '2000', 10)
      const intervalMs = parseInt(opts.interval ?? '3000', 10)
      const shouldRepair = opts.repair ?? false
      const runOnce = opts.once ?? false
      const targetScore = opts.targetScore ? parseInt(opts.targetScore, 10) : null

      let previousScore: number | null = null
      let currentState: WatchState = 'watching'
      let isProcessing = false

      console.log('')
      console.log(separator())
      console.log(styleBold('info', '  deep-slop watch'), style('muted', rootDir))
      console.log(separator())

      const languages = await detectLanguages(rootDir)
      const frameworks = await detectFrameworks(rootDir)

      const config: DeepSlopConfig = {
        ...DEFAULT_CONFIG,
      }

      let watcher = watchDirectory(rootDir, {
        interval: intervalMs,
        debounce: debounceMs,
        onChange: async (changedFiles: string[]) => {
          if (isProcessing) return
          isProcessing = true

          const currentStats = watcher.getStats()
          currentStats.isScanning = true

          currentState = 'scanning'
          console.log('')
          console.log(formatWatchStatus(watcher.getStats(), currentState, previousScore))

          try {
            const allFiles = await collectFiles(rootDir, languages, config.exclude, undefined, config.ignore)
            const changedRelative = changedFiles.map((f) => relative(rootDir, f))
            const files = allFiles.filter((f: string) =>
              changedRelative.some((c) => f === c || f.endsWith(c) || c.endsWith(f))
            )
            const filesToScan = files.length > 0 ? files : allFiles

            const context = {
              rootDirectory: rootDir,
              languages,
              frameworks,
              files: filesToScan,
              installedTools: {},
              config,
            }

            const result = await runScan(context)

            currentStats.isScanning = false
            currentStats.lastScanTime = Date.now()
            currentStats.lastScanScore = result.score ?? 0
            currentStats.totalScans++

            console.log(formatWatchScanResult(
              result.score ?? 0,
              result.totalDiagnostics,
              result.meta.filesScanned,
              result.meta.elapsed,
            ))

            const scanDelta = previousScore !== null ? previousScore : null
            previousScore = result.score

            if (shouldRepair && (result.score ?? 0) < 75) {
              currentState = 'fixing'
              console.log(formatWatchStatus(watcher.getStats(), currentState, scanDelta))

              const allDiagnostics = result.engines.flatMap((r) => r.diagnostics)
              const fixResult = await runFixPipeline(allDiagnostics, context, {
                mode: 'safe',
                dryRun: false,
                verify: true,
              })

              if (fixResult.filesModified > 0) {
                console.log(`  ${style('success', 'Fixed')} ${fixResult.diagnosticsFixed} issues in ${fixResult.filesModified} files`)
                console.log(`  Score: ${fixResult.scoreBefore} → ${style('success', String(fixResult.scoreAfter))}`)

                if (fixResult.rolledBack) {
                  console.log(`  ${styleBold('danger', 'ROLLED BACK')} — score worsened after fix`)
                }

                currentStats.isScanning = true
                const reScanResult = await runScan(context)
                currentStats.isScanning = false
                currentStats.lastScanScore = reScanResult.score ?? 0
                currentStats.totalScans++
                previousScore = reScanResult.score ?? 0

                console.log(formatWatchScanResult(
                  reScanResult.score ?? 0,
                  reScanResult.totalDiagnostics,
                  reScanResult.meta.filesScanned,
                  reScanResult.meta.elapsed,
                ))
              }
            }

            if (targetScore !== null && (result.score ?? 0) >= targetScore) {
              console.log('')
              console.log(styleBold('success', `  Target score ${targetScore} reached! Current: ${result.score}`))
              console.log(separator())
              watcher.stop()
              process.exit(0)
            }

            if (runOnce) {
              console.log('')
              console.log(style('muted', '  --once: exiting after first scan'))
              console.log(separator())
              watcher.stop()
              process.exit(0)
            }
          } catch (err) {
            console.log(`  ${style('danger', 'Error:')} ${err instanceof Error ? err.message : String(err)}`)
          } finally {
            isProcessing = false
            currentState = 'watching'
            console.log('')
            console.log(formatWatchStatus(watcher.getStats(), currentState, previousScore))
          }
        },
        onStats: () => {
          // Update stats in real time (no output here to avoid spam)
        },
      })

      let sigintReceived = false
      process.on('SIGINT', () => {
        if (sigintReceived) {
          process.exit(1)
        }
        sigintReceived = true

        console.log('')
        console.log(style('muted', '  Stopping watcher...'))
        watcher.stop()

        const finalStats = watcher.getStats()
        if (finalStats.lastScanScore !== null) {
          console.log(`  Final score: ${finalStats.lastScanScore} (${scoreLabel(finalStats.lastScanScore)})`)
        }
        console.log(`  Total scans: ${finalStats.totalScans}`)
        console.log(separator())
        console.log('')
        process.exit(0)
      })

      watcher.start()
      console.log(formatWatchStatus(watcher.getStats(), 'watching', null))

      if (runOnce) {
        const allFiles = await collectFiles(rootDir, languages, config.exclude, undefined, config.ignore)
        if (allFiles.length > 0) {
          watcher.stop()
          isProcessing = true
          currentState = 'scanning'

          const context = {
            rootDirectory: rootDir,
            languages,
            frameworks,
            files: allFiles,
            installedTools: {},
            config,
          }

          try {
            console.log('')
            console.log(formatWatchStatus(watcher.getStats(), currentState, previousScore))

            const result = await runScan(context)
            const currentStats = watcher.getStats()
            currentStats.lastScanTime = Date.now()
            currentStats.lastScanScore = result.score ?? 0
            currentStats.totalScans++

            console.log(formatWatchScanResult(
              result.score ?? 0,
              result.totalDiagnostics,
              result.meta.filesScanned,
              result.meta.elapsed,
            ))

            previousScore = result.score ?? 0

            if (shouldRepair && (result.score ?? 0) < 75) {
              currentState = 'fixing'
              console.log(formatWatchStatus(watcher.getStats(), currentState, null))

              const allDiagnostics = result.engines.flatMap((r) => r.diagnostics)
              const fixResult = await runFixPipeline(allDiagnostics, context, {
                mode: 'safe',
                dryRun: false,
                verify: true,
              })

              if (fixResult.filesModified > 0) {
                console.log(`  ${style('success', 'Fixed')} ${fixResult.diagnosticsFixed} issues in ${fixResult.filesModified} files`)
                console.log(`  Score: ${fixResult.scoreBefore} → ${style('success', String(fixResult.scoreAfter))}`)
              }
            }

            if (targetScore !== null && (result.score ?? 0) >= targetScore) {
              console.log('')
              console.log(styleBold('success', `  Target score ${targetScore} reached! Current: ${result.score ?? '—'}`))
            }
          } catch (err) {
            console.log(`  ${style('danger', 'Error:')} ${err instanceof Error ? err.message : String(err)}`)
          }

          console.log('')
          console.log(style('muted', '  --once: exiting after first scan'))
          console.log(separator())
          console.log('')
          process.exit(0)
        }
      }
    })
}
