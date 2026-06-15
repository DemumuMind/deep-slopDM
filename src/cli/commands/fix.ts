import { resolve } from 'node:path'
import type { Command } from 'commander'
import { runFix as runFixPipeline, extractPlanPreview } from '../../fix/index.js'
import { detectLanguages, detectFrameworks, collectFiles } from '../../utils/discover.js'
import { DEFAULT_CONFIG, type DeepSlopConfig, ALL_ENGINE_NAMES } from '../../types/index.js'
import { loadConfig } from '../../config/index.js'
import { runScan } from '../../engines/orchestrator.js'
import { style, styleBold, separator } from '../../output/theme.js'
import { truncateSnippet } from '../shared.js'

export function register(program: Command): void {
  program
    .command('fix')
    .description('Auto-fix detected issues')
    .argument('[path]', 'project directory', '.')
    .option('--engine <engines...>', 'Fix only this engine\'s issues')
    .option('--safe', 'Only apply safe fixes (confidence >= 0.8) (default)')
    .option('--force', 'Apply all fixable diagnostics regardless of confidence')
    .option('--dry-run', 'Show what would be fixed without modifying files')
    .option('--verify', 'Re-scan after fix and rollback if score worsened')
    .option('--plan', 'Show detailed fix plan with before/after snippets and confirmation')
    .option('--rule <rules...>', 'Only fix these rule IDs (e.g. ast-slop/console-leftover)')
    .action(async (path: string, opts: Record<string, any>) => {
      const rootDir = resolve(path)

      process.stderr.write(`\n  deep-slop fix: ${rootDir}\n\n`)

      const languages = await detectLanguages(rootDir)
      const frameworks = await detectFrameworks(rootDir)

      const fileConfig = loadConfig(rootDir)
      const config: DeepSlopConfig = {
        ...DEFAULT_CONFIG,
        ...fileConfig,
        exclude: [...(fileConfig.exclude || DEFAULT_CONFIG.exclude), ...(opts.exclude ?? [])],
      }

      if (opts.engine) {
        for (const name of Object.keys(ALL_ENGINE_NAMES)) {
          config.engines[name as keyof typeof config.engines] = false
        }
        for (const name of opts.engine) {
          config.engines[name as keyof typeof config.engines] = true
        }
      }

      const files = await collectFiles(rootDir, languages, config.exclude, undefined, config.ignore)

      const context = {
        rootDirectory: rootDir,
        languages,
        frameworks,
        files,
        installedTools: {},
        config,
      }

      const scanResult = await runScan(context, {
        onEngineStart: (name: string) => process.stderr.write(`  ⏳ ${name}...`),
        onEngineComplete: (r: any) => {
          const status = r.skipped ? '⏭ skipped' : `✅ ${r.diagnostics.length} issues (${Math.round(r.elapsed)}ms)`
          process.stderr.write(` ${status}\n`)
        },
      })

      const allDiagnostics = scanResult.engines.flatMap((r) => r.diagnostics)

      const mode: 'safe' | 'force' = opts.force ? 'force' : 'safe'
      const dryRun = opts.dryRun ?? false
      const verify = opts.verify ?? false
      const isPlan = opts.plan ?? false
      const rules: string[] | undefined = opts.rule

      const fixResult = await runFixPipeline(allDiagnostics, context, {
        mode,
        dryRun: isPlan ? true : dryRun,
        verify: isPlan ? false : verify,
        plan: isPlan,
        rules,
      })

      console.log('')
      console.log(separator())

      if (isPlan) {
        const preview = extractPlanPreview(fixResult)
        if (preview) {
          console.log(styleBold('info', '  Fix Plan Preview'))
          console.log(separator())
          console.log(`  Mode:            ${style('info', mode)}`)
          if (rules && rules.length > 0) console.log(`  Rules:           ${style('suggestion', rules.join(', '))}`)
          console.log(`  Files affected:  ${style('suggestion', String(preview.filesAffected.length))}`)
          console.log(`  Diagnostics:     ${style('suggestion', String(preview.diagnosticsAddressed))} addressed`)
          console.log(`  Score:           ${String(preview.scoreBefore)} → ${preview.estimatedScoreAfter >= preview.scoreBefore ? style('success', String(preview.estimatedScoreAfter)) : style('danger', String(preview.estimatedScoreAfter))} (estimated)`)
          console.log(`  Effort:          ${style(preview.estimatedEffort === 'low' ? 'success' : preview.estimatedEffort === 'medium' ? 'warn' : 'danger', preview.estimatedEffort)}`)
          console.log('')

          console.log(style('muted', '  Files to modify:'))
          for (const f of preview.filesAffected) {
            console.log(`    ${style('suggestion', f)}`)
          }
          console.log('')

          console.log(style('muted', '  Changes:'))
          for (const item of preview.items) {
            const confColor = item.confidence >= 0.8 ? 'success' : item.confidence >= 0.5 ? 'warn' : 'danger'
            console.log(`  ${style('info', item.filePath)}:${item.startLine}-${item.endLine}  ${style('muted', item.rule)}  confidence=${style(confColor, String(item.confidence))}`)
            console.log(`    ${style('danger', '-')} ${truncateSnippet(item.before, 60)}`)
            console.log(`    ${style('success', '+')} ${truncateSnippet(item.after, 60)}`)
          }

          console.log('')
          console.log(separator())
          console.log(style('muted', '  Run without --plan to apply these fixes.'))
          console.log('')
        } else {
          console.log(styleBold('info', '  Fix Plan'))
          console.log(separator())
          console.log(`  ${style('warn', 'No fixable diagnostics found.')}`)
          console.log(separator())
          console.log('')
        }
        return
      }

      console.log(styleBold('info', '  Fix Summary'))
      console.log(separator())

      if (dryRun) {
        console.log(`  ${style('warn', 'DRY RUN')} ─ no files were modified`)
      }

      console.log(`  Mode:          ${style('info', mode)}`)
      if (rules && rules.length > 0) console.log(`  Rules:          ${style('suggestion', rules.join(', '))}`)
      console.log(`  Files:         ${style('suggestion', String(fixResult.filesModified))} modified`)
      console.log(`  Diagnostics:   ${style('suggestion', String(fixResult.diagnosticsFixed))} fixed`)
      console.log(`  Score:         ${String(fixResult.scoreBefore)} → ${fixResult.scoreAfter >= fixResult.scoreBefore ? style('success', String(fixResult.scoreAfter)) : style('danger', String(fixResult.scoreAfter))}`)

      if (dryRun && fixResult.diffs.length > 0) {
        console.log('')
        console.log(style('muted', '  Changes:'))
        const byFile = new Map<string, typeof fixResult.diffs>()
        for (const diff of fixResult.diffs) {
          const group = byFile.get(diff.filePath) ?? []
          group.push(diff)
          byFile.set(diff.filePath, group)
        }
        for (const [filePath, fileDiffs] of byFile) {
          console.log(`  ${style('info', filePath)}`)
          for (const diff of fileDiffs) {
            const confColor = diff.confidence >= 0.8 ? 'success' : diff.confidence >= 0.5 ? 'warn' : 'danger'
            console.log(`    ${style('muted', `L${diff.line}`)} ${style('muted', diff.rule)} confidence=${style(confColor, String(diff.confidence))}`)
            for (const beforeLine of diff.before.split('\n')) {
              console.log(`    ${style('danger', '-')} ${truncateSnippet(beforeLine, 70)}`)
            }
            if (diff.after) {
              for (const afterLine of diff.after.split('\n')) {
                console.log(`    ${style('success', '+')} ${truncateSnippet(afterLine, 70)}`)
              }
            }
          }
        }
      }

      if (fixResult.rolledBack) {
        console.log(`  ${styleBold('danger', 'ROLLED BACK')} ─ score worsened after fix, original files restored`)
      }

      if (fixResult.errors.length > 0) {
        console.log(`  ${style('danger', 'Errors:')}`)
        for (const err of fixResult.errors) {
          console.log(`    • ${err}`)
        }
      }

      console.log(separator())
      console.log('')
    })
}
