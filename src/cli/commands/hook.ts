import { resolve, join } from 'node:path'
import type { Command } from 'commander'
import { installHook } from '../../hooks/install.js'
import { uninstallHook } from '../../hooks/uninstall.js'
import { getHookStatus } from '../../hooks/status.js'
import { captureBaseline, readBaseline, checkQualityGate } from '../../hooks/baseline.js'
import type { HookProvider } from '../../hooks/types.js'
import { auditDependencies } from '../../hooks/dep-audit.js'
import { runSentinel, formatSentinelResults } from '../../hooks/sentinel.js'
import { style, styleBold, separator, scoreLabel } from '../../output/theme.js'
import { relativeTime } from '../../history/relative-time.js'
import { DEFAULT_CONFIG, type DeepSlopConfig } from '../../types/index.js'
import { detectLanguages, detectFrameworks, collectFiles } from '../../utils/discover.js'
import { runScan } from '../../engines/orchestrator.js'

export function register(program: Command): void {
  const hookCmd = program
    .command('hook')
    .description('Manage deep-slop hooks for AI coding tools')

  hookCmd
    .command('install')
    .description('Install a deep-slop hook for an AI coding tool')
    .option('--claude', 'Install hook for Claude Code')
    .option('--cursor', 'Install hook for Cursor')
    .option('--gemini', 'Install hook for Gemini')
    .option('--cline', 'Install hook for Cline')
    .option('--global', 'Install at user level (global config)')
    .option('--project', 'Install at project level (default)')
    .option('--quality-gate', 'Enable quality gate (score comparison against baseline)')
    .action(async (opts: Record<string, any>) => {
      const providers: HookProvider[] = []
      if (opts.claude) providers.push('claude')
      if (opts.cursor) providers.push('cursor')
      if (opts.gemini) providers.push('gemini')
      if (opts.cline) providers.push('cline')

      if (providers.length === 0) {
        process.stderr.write('  ⚠ Specify at least one provider: --claude, --cursor, --gemini, --cline\n')
        process.exit(1)
      }

      const scope: 'global' | 'project' = opts.global ? 'global' : 'project'
      const qualityGate = opts.qualityGate ?? false

      for (const provider of providers) {
        try {
          await installHook({ provider, scope, qualityGate })
        } catch (err) {
          process.stderr.write(`  ✖ Failed to install ${provider} hook: ${err instanceof Error ? err.message : String(err)}\n`)
        }
      }
    })

  hookCmd
    .command('uninstall')
    .description('Remove a deep-slop hook from an AI coding tool')
    .option('--claude', 'Uninstall hook for Claude Code')
    .option('--cursor', 'Uninstall hook for Cursor')
    .option('--gemini', 'Uninstall hook for Gemini')
    .option('--cline', 'Uninstall hook for Cline')
    .option('--global', 'Uninstall from user level (global config)')
    .option('--project', 'Uninstall from project level (default)')
    .action(async (opts: Record<string, any>) => {
      const providers: HookProvider[] = []
      if (opts.claude) providers.push('claude')
      if (opts.cursor) providers.push('cursor')
      if (opts.gemini) providers.push('gemini')
      if (opts.cline) providers.push('cline')

      if (providers.length === 0) {
        process.stderr.write('  ⚠ Specify at least one provider: --claude, --cursor, --gemini, --cline\n')
        process.exit(1)
      }

      const scope: string = opts.global ? 'global' : 'project'

      for (const provider of providers) {
        try {
          await uninstallHook(provider, scope)
        } catch (err) {
          process.stderr.write(`  ✖ Failed to uninstall ${provider} hook: ${err instanceof Error ? err.message : String(err)}\n`)
        }
      }
    })

  hookCmd
    .command('status')
    .description('Show installed hooks status')
    .action(() => {
      const statuses = getHookStatus()

      console.log('')
      console.log(separator())
      console.log(styleBold('info', '  deep-slop hook status'))
      console.log(separator())

      for (const s of statuses) {
        const icon = s.installed ? style('success', '✔') : style('muted', '✖')
        const scopeStr = s.installed ? ` (${s.scope})` : ''
        const gateStr = s.qualityGate ? style('info', ' [quality-gate]') : ''
        const pathStr = s.installed ? style('muted', ` → ${s.path}`) : ''
        console.log(`  ${icon} ${s.provider}${scopeStr}${gateStr}${pathStr}`)
      }

      const baseline = readBaseline(process.cwd())
      if (baseline) {
        console.log(`  ${style('info', '◆')} Baseline: score=${baseline.score} captured=${relativeTime(baseline.timestamp)}`)
      } else {
        console.log(`  ${style('muted', '◇')} No baseline captured. Run 'deep-slop hook baseline' to set one.`)
      }

      console.log(separator())
      console.log('')
    })

  hookCmd
    .command('baseline')
    .description('Capture quality gate baseline score (runs a scan first)')
    .argument('[path]', 'project directory', '.')
    .option('--check', 'Check current score against baseline (no capture)')
    .action(async (path: string, opts: Record<string, any>) => {
      const rootDir = resolve(path)

      if (opts.check) {
        const baseline = readBaseline(rootDir)
        if (!baseline) {
          process.stderr.write('  ⚠ No baseline found. Run "deep-slop hook baseline" first to capture one.\n')
          process.exit(1)
        }

        const languages = await detectLanguages(rootDir)
        const frameworks = await detectFrameworks(rootDir)
        const files = await collectFiles(rootDir, languages, [])
        const config: DeepSlopConfig = { ...DEFAULT_CONFIG }
        const result = await runScan({
          rootDirectory: rootDir,
          languages,
          frameworks,
          files,
          installedTools: {},
          config,
        })

        const gate = checkQualityGate(rootDir, result.score ?? 0)
        const status = gate.pass ? style('success', 'PASS') : style('danger', 'FAIL')
        const deltaStr = gate.delta >= 0 ? `+${gate.delta}` : String(gate.delta)

        console.log('')
        console.log(separator())
        console.log(styleBold('info', '  Quality Gate Check'))
        console.log(separator())
        console.log(`  Baseline:  ${baseline.score}`)
        console.log(`  Current:   ${result.score}`)
        console.log(`  Delta:     ${gate.delta >= 0 ? style('success', deltaStr) : style('danger', deltaStr)}`)
        console.log(`  Result:    ${status}`)
        console.log(separator())
        console.log('')

        if (!gate.pass) {
          process.exit(1)
        }
        return
      }

      process.stderr.write(`\n  Capturing baseline for: ${rootDir}\n`)

      const languages = await detectLanguages(rootDir)
      const frameworks = await detectFrameworks(rootDir)
      const files = await collectFiles(rootDir, languages, [])
      const config: DeepSlopConfig = { ...DEFAULT_CONFIG }

      const result = await runScan({
        rootDirectory: rootDir,
        languages,
        frameworks,
        files,
        installedTools: {},
        config,
      })

      captureBaseline(rootDir, result.score ?? 0, {
        total: result.totalDiagnostics,
        errors: result.bySeverity.error ?? 0,
        warnings: result.bySeverity.warning ?? 0,
      })

      console.log('')
      console.log(separator())
      console.log(styleBold('info', '  Baseline Captured'))
      console.log(separator())
      console.log(`  Score:       ${styleBold((result.score ?? 0) >= 75 ? 'success' : (result.score ?? 0) >= 50 ? 'warn' : 'danger', String(result.score ?? '—'))} (${scoreLabel(result.score ?? 0)})`)
      console.log(`  Diagnostics: ${result.totalDiagnostics} total`)
      console.log(`  File:        ${join(rootDir, '.deep-slop', 'baseline.json')}`)
      console.log(separator())
      console.log('')
    })

  hookCmd
    .command('audit')
    .description('Audit dependencies for issues (unpinned, deprecated, missing lockfile)')
    .argument('[path]', 'project directory', '.')
    .option('--outdated', 'Check for outdated packages (slower, requires npm/pnpm)')
    .option('--no-outdated', 'Skip outdated package check (default)')
    .action((pathArg: string, opts: Record<string, any>) => {
      const rootDir = resolve(pathArg)

      const result = auditDependencies({
        rootDir,
        checkOutdated: opts.outdated ?? false,
        checkUnused: false,
        timeout: 30_000,
      })

      console.log('')
      console.log(separator())
      console.log(styleBold('info', '  Dependency Audit'))
      console.log(separator())
      console.log(`  Dependencies: ${result.totalDeps}`)
      console.log(`  Issues:       ${result.issuesFound}`)

      if (result.diagnostics.length > 0) {
        console.log('')
        for (const d of result.diagnostics) {
          const sevIcon = d.severity === 'error' ? style('danger', '✖') : d.severity === 'warning' ? style('warn', '⚠') : style('info', 'ℹ')
          console.log(`  ${sevIcon} ${d.message}`)
          if (d.help) {
            console.log(`    ${style('muted', d.help)}`)
          }
          if (d.suggestion) {
            console.log(`    Fix: ${d.suggestion.text}`)
          }
        }
      }

      console.log(separator())
      console.log('')

      if (result.issuesFound > 0 && result.diagnostics.some((d) => d.severity === 'error')) {
        process.exit(1)
      }
    })

  hookCmd
    .command('sentinel')
    .description('Validate hook integrity and detect drift or tampering')
    .option('--repair', 'Auto-repair detected issues')
    .option('--no-repair', 'Do not auto-repair (default)')
    .option('--no-command-check', 'Skip deep-slop command availability check')
    .option('--claude', 'Only check Claude hooks')
    .option('--cursor', 'Only check Cursor hooks')
    .option('--gemini', 'Only check Gemini hooks')
    .option('--cline', 'Only check Cline hooks')
    .action((opts: Record<string, any>) => {
      const providers: HookProvider[] = []
      if (opts.claude) providers.push('claude')
      if (opts.cursor) providers.push('cursor')
      if (opts.gemini) providers.push('gemini')
      if (opts.cline) providers.push('cline')

      const results = runSentinel({
        providers: providers.length > 0 ? providers : undefined,
        autoRepair: opts.repair ?? false,
        checkCommand: opts.commandCheck !== false,
        rootDir: process.cwd(),
      })

      console.log('')
      console.log(separator())
      console.log(styleBold('info', '  Hook Sentinel'))
      console.log(separator())
      console.log(formatSentinelResults(results))
      console.log(separator())
      console.log('')

      const hasErrors = results.some((r) => r.issues.some((i) => i.severity === 'error' && !i.repaired))
      if (hasErrors) {
        process.exit(1)
      }
    })
}
