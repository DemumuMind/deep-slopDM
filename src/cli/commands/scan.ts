import { resolve } from 'node:path'
import type { Command } from 'commander'
import { runScan } from '../../engines/orchestrator.js'
import { detectLanguages, detectFrameworks, collectFiles } from '../../utils/discover.js'
import { getChangedFiles, getStagedFiles, baseRefExists, filterToChanged } from '../../utils/git-diff.js'
import { DEFAULT_CONFIG, type DeepSlopConfig, ALL_ENGINE_NAMES } from '../../types/index.js'
import { loadConfig } from '../../config/index.js'
import type { RuleSeverityOverride } from '../../scoring/rule-overrides.js'
import { formatOutput } from '../../output/formatter.js'
import { generateSarif } from '../../output/sarif.js'
import { type OutputFormat } from '../shared.js'

export function register(program: Command): void {
  program
    .command('scan')
    .description('Scan project for AI slop and code quality issues')
    .argument('[path]', 'project directory', '.')
    .option('--json', 'Output as JSON (shorthand for --format json)')
    .option('--sarif', 'Output as SARIF 2.1.0 (shorthand for --format sarif)')
    .option('--format <human|json|sarif>', 'Output format', 'human')
    .option('--changes', 'Scan only changed files (from git)')
    .option('--staged', 'Scan only staged files')
    .option('--base <ref>', 'Diff against arbitrary ref (e.g. origin/main)')
    .option('--include <patterns...>', 'Include only these paths')
    .option('--exclude <patterns...>', 'Exclude these paths')
    .option('--engine <engines...>', 'Run only these engines')
    .option('--rule <rule=severity>', 'Override rule severity (e.g. ast-slop/narrative-comment=off). Can specify multiple --rule flags.')
    .option('--severity <level>', 'Minimum severity to report (error|warning|info|suggestion)', 'info')
    .action(async (path: string, opts: Record<string, any>) => {
      const rootDir = resolve(path)

      let format: OutputFormat = opts.format ?? 'human'
      if (opts.json) format = 'json'
      if (opts.sarif) format = 'sarif'

      if (format !== 'json') {
        process.stderr.write(`\n  deep-slop scanning: ${rootDir}\n\n`)
      }

      const languages = await detectLanguages(rootDir)
      const frameworks = await detectFrameworks(rootDir)

      const fileConfig = loadConfig(rootDir)
      const config: DeepSlopConfig = {
        ...DEFAULT_CONFIG,
        ...fileConfig,
        exclude: [...(fileConfig.exclude || DEFAULT_CONFIG.exclude), ...(opts.exclude ?? [])],
      }

      if (opts.engine) {
        for (const name of ALL_ENGINE_NAMES) {
          config.engines[name as keyof typeof config.engines] = false
        }
        for (const name of opts.engine) {
          config.engines[name as keyof typeof config.engines] = true
        }
      }

      if (opts.rule) {
        const cliRules: Record<string, RuleSeverityOverride> = config.rules ? { ...config.rules } : {}
        const ruleFlags = Array.isArray(opts.rule) ? opts.rule : [opts.rule]
        for (const entry of ruleFlags) {
          const eqIdx = entry.indexOf('=')
          if (eqIdx === -1) {
            process.stderr.write(`  ⚠️  Invalid --rule format: "${entry}" (expected rule-id=severity)\n`)
            continue
          }
          const ruleId = entry.slice(0, eqIdx)
          const severity = entry.slice(eqIdx + 1) as RuleSeverityOverride
          if (!['error', 'warning', 'info', 'off'].includes(severity)) {
            process.stderr.write(`  ⚠️  Invalid severity "${severity}" for rule "${ruleId}" (expected error|warning|info|off)\n`)
            continue
          }
          cliRules[ruleId] = severity
        }
        config.rules = cliRules
      }

      let files = await collectFiles(rootDir, languages, config.exclude, undefined, config.ignore, opts.include)

      let diffScope: string | undefined
      if (opts.changes || opts.staged || opts.base) {
        let changedRelPaths: string[]
        let refLabel: string

        if (opts.staged) {
          changedRelPaths = await getStagedFiles()
          refLabel = 'staged'
        } else {
          const baseRef = opts.base ?? 'HEAD'
          if (opts.base && !(await baseRefExists(baseRef))) {
            process.stderr.write(`  ⚠️  Git ref "${baseRef}" not found, falling back to full scan\n`)
            changedRelPaths = []
          } else {
            changedRelPaths = await getChangedFiles(baseRef)
          }
          refLabel = baseRef
        }

        if (changedRelPaths.length === 0) {
          process.stderr.write('  No changed files to scan\n')
          process.exit(0)
        }

        files = filterToChanged(files, changedRelPaths)
        diffScope = `${files.length} changed vs ${refLabel}`
        process.stderr.write(`  ${diffScope} file(s)\n`)
      }

      const context = {
        rootDirectory: rootDir,
        languages,
        frameworks,
        files,
        installedTools: {},
        config,
        diffScope,
      }

      const result = await runScan(context, {
        onEngineStart: format === 'human' ? (name: string) => process.stderr.write(`  ⏳ ${name}...\r`) : undefined,
        onEngineComplete: format === 'human' ? (r: any) => {
          const status = r.skipped ? '⏭️  skipped' : `✅ ${r.diagnostics.length} issues (${Math.round(r.elapsed)}ms)`
          process.stderr.write(`  ${status.padEnd(55)}\n`)
        } : undefined,
      })

      if (format === 'sarif') {
        console.log(JSON.stringify(generateSarif(result), null, 2))
      } else if (format === 'json') {
        console.log(JSON.stringify(result, null, 2))
      } else {
        console.log(formatOutput(result))
      }

      if (config.ci.failBelow && result.score !== null && result.score < config.ci.failBelow) {
        console.error(`\n  ❌ Score ${result.score} is below threshold ${config.ci.failBelow}`)
        process.exit(1)
      }
    })
}
