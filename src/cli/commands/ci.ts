import { resolve } from 'node:path'
import type { Command } from 'commander'
import { runScan } from '../../engines/orchestrator.js'
import { detectLanguages, detectFrameworks, collectFiles } from '../../utils/discover.js'
import { DEFAULT_CONFIG, type DeepSlopConfig, ALL_ENGINE_NAMES } from '../../types/index.js'
import { getChangedFiles, getStagedFiles, baseRefExists, filterToChanged } from '../../utils/git-diff.js'
import { assessCoverage } from '../../utils/coverage-gate.js'
import { computeExitCode } from '../../utils/exit-code.js'
import { generateSarif } from '../../output/sarif.js'
import { formatOutput } from '../../output/formatter.js'
import { style } from '../../output/theme.js'
import { parseOptInt, type OutputFormat } from '../shared.js'

export function register(program: Command): void {
  program
    .command('ci')
    .description('CI mode: quality gate with coverage-aware scoring')
    .argument('[path]', 'project directory', '.')
    .option('--fail-below <n>', 'Fail if score below threshold', parseOptInt)
    .option('--human', 'Human-readable output (shorthand for --format human)')
    .option('--sarif', 'SARIF 2.1.0 output (shorthand for --format sarif)')
    .option('--format <json|human|sarif>', 'Output format', 'json')
    .option('--fail-on-errors', 'Exit 1 if any error-severity diagnostics')
    .option('--changes', 'Scan only changed files (from git)')
    .option('--staged', 'Scan only staged files')
    .option('--base <ref>', 'Diff against arbitrary ref (e.g. origin/main)')
    .option('--exclude <patterns...>', 'Exclude these paths')
    .option('--engine <engines...>', 'Run only these engines')
    .action(async (path: string, opts: Record<string, any>) => {
      const rootDir = resolve(path)

      let format: OutputFormat = opts.format ?? 'json'
      if (opts.human) format = 'human'
      if (opts.sarif) format = 'sarif'

      const config: DeepSlopConfig = {
        ...DEFAULT_CONFIG,
        exclude: [...DEFAULT_CONFIG.exclude, ...(opts.exclude ?? [])],
      }

      if (opts.engine) {
        for (const name of Object.keys(ALL_ENGINE_NAMES)) {
          config.engines[name as keyof typeof config.engines] = false
        }
        for (const name of opts.engine) {
          config.engines[name as keyof typeof config.engines] = true
        }
      }

      const languages = await detectLanguages(rootDir)
      const frameworks = await detectFrameworks(rootDir)
      let files = await collectFiles(rootDir, languages, undefined, undefined, config.ignore)

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

      const failBelow = opts.failBelow ?? config.ci.failBelow
      const failOnErrors = opts.failOnErrors ?? config.ci.failOnErrors

      const coverageInfo = assessCoverage(languages, files.length)

      const result = await runScan({
        rootDirectory: rootDir,
        languages,
        frameworks,
        files,
        installedTools: {},
        config,
        diffScope,
      })

      const hasErrors = (result.bySeverity.error ?? 0) > 0

      if (format === 'sarif') {
        const sarifLog = generateSarif(result)
        console.log(JSON.stringify(sarifLog, null, 2))
      } else if (format === 'human') {
        console.log(formatOutput(result))
        if (!coverageInfo.isScoreable) {
          console.log(style('warn', `  ⚠  Score withheld: ${coverageInfo.reason}`))
        }
        if (hasErrors && failOnErrors) {
          console.log(style('danger', `  ✖  ${result.bySeverity.error} error-severity diagnostic(s) found`))
        }
        if (coverageInfo.isScoreable && result.score !== null && result.score < failBelow) {
          console.log(style('danger', `  \u2718  Score ${result.score} is below threshold ${failBelow}`))
        }
      } else {
        const output = {
          ...result,
          coverage: coverageInfo,
          gate: {
            failBelow,
            failOnErrors,
            scoreable: coverageInfo.isScoreable,
            hasErrors,
            score: coverageInfo.isScoreable ? result.score : null,
          },
        }
        console.log(JSON.stringify(output, null, 2))
      }

      if (!coverageInfo.isScoreable) {
        process.stderr.write(`  ⚠  Coverage gate: ${coverageInfo.reason}\n`)
      }

      const exitCode = computeExitCode({
        hasErrors,
        failOnErrors,
        scoreable: coverageInfo.isScoreable,
        score: result.score,
        failBelow,
      })
      process.exit(exitCode)
    })
}
