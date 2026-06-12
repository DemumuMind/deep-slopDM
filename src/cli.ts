#!/usr/bin/env node
import { Command } from "commander";
import { resolve, relative, join } from "node:path";
import { runScan } from "./engines/orchestrator.js";
import { runFix as runFixPipeline } from "./fix/index.js";
import { detectLanguages, detectFrameworks, collectFiles } from "./utils/discover.js";
import { getChangedFiles, getStagedFiles, baseRefExists, isGitRepo, filterToChanged } from "./utils/git-diff.js";
import { DEFAULT_CONFIG, type DeepSlopConfig } from "./types/index.js";
import { applyRuleSeverities, type RuleSeverityOverride } from "./scoring/rule-overrides.js";
import { formatOutput } from "./output/formatter.js";
import { generateSarif } from "./output/sarif.js";
import { APP_VERSION } from "./version.js";
import { runInit } from "./cli/init.js";
import { runDoctor } from "./cli/doctor.js";
import { readHistory } from "./history/store.js";
import { sparkline, deltaText } from "./history/sparkline.js";
import { relativeTime } from "./history/relative-time.js";
import { style, styleBold, separator, scoreLabel, severityBadge } from "./output/theme.js";
import { watchDirectory, type WatchStats } from "./watch/watcher.js";
import { installHook } from "./hooks/install.js";
import { uninstallHook } from "./hooks/uninstall.js";
import { getHookStatus } from "./hooks/status.js";
import { captureBaseline, readBaseline, checkQualityGate } from "./hooks/baseline.js";
import type { HookProvider } from "./hooks/types.js";
import { formatWatchStatus, formatWatchScanResult, type WatchState } from "./watch/display.js"
import { runRepairLoop, planRepair, type RepairResult } from "./agent/repair.js"
import { detectAllProviders } from "./agents/providers.js";

type OutputFormat = 'human' | 'json' | 'sarif'

const program = new Command();

program
  .name("deep-slop")
  .description("Deep AI slop detection — 12 engines, AST-powered, with alternative import paths")
  .version(APP_VERSION);

// ── SCAN ────────────────────────────────────────────────
program
  .command("scan")
  .description("Scan project for AI slop and code quality issues")
  .argument("[path]", "project directory", ".")
  .option("--json", "Output as JSON (shorthand for --format json)")
  .option("--sarif", "Output as SARIF 2.1.0 (shorthand for --format sarif)")
  .option("--format <human|json|sarif>", "Output format", "human")
  .option("--changes", "Scan only changed files (from git)")
  .option("--staged", "Scan only staged files")
  .option("--base <ref>", "Diff against arbitrary ref (e.g. origin/main)")
  .option("--include <patterns...>", "Include only these paths")
  .option("--exclude <patterns...>", "Exclude these paths")
  .option("--engine <engines...>", "Run only these engines")
  .option("--rule <rule=severity>", "Override rule severity (e.g. ast-slop/narrative-comment=off). Can specify multiple --rule flags.")
  .option("--severity <level>", "Minimum severity to report (error|warning|info|suggestion)", "info")
  .action(async (path: string, opts: Record<string, any>) => {
    const rootDir = resolve(path);

    // Resolve output format: --json / --sarif are shorthands for --format
    let format: OutputFormat = opts.format ?? 'human'
    if (opts.json) format = 'json'
    if (opts.sarif) format = 'sarif'

    if (format !== 'json') {
      process.stderr.write(`\n  deep-slop scanning: ${rootDir}\n\n`);
    }

    // Detect project
    const languages = await detectLanguages(rootDir);
    const frameworks = await detectFrameworks(rootDir);

    // Build config
    const config: DeepSlopConfig = {
      ...DEFAULT_CONFIG,
      exclude: [...DEFAULT_CONFIG.exclude, ...(opts.exclude ?? [])],
    };

    // Enable only selected engines
    if (opts.engine) {
      for (const name of Object.keys(DEFAULT_CONFIG.engines)) {
        config.engines[name as keyof typeof config.engines] = false;
      }
      for (const name of opts.engine) {
        config.engines[name as keyof typeof config.engines] = true;
      }
    }

    // Merge --rule CLI overrides into config.rules (CLI takes precedence)
    if (opts.rule) {
      const cliRules: Record<string, RuleSeverityOverride> =
        config.rules ? { ...config.rules } : {}
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

    // Collect files
    let files = await collectFiles(rootDir, languages, config.exclude, opts.include);

    // Diff-aware filtering
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
    };

    // Run scan with progress (only show in human mode)
    const result = await runScan(context, {
      onEngineStart: format === 'human' ? (name: string) => process.stderr.write(`  ⏳ ${name}...`) : undefined,
      onEngineComplete: format === 'human' ? (r: any) => {
        const status = r.skipped ? "⏭️ skipped" : `✅ ${r.diagnostics.length} issues (${Math.round(r.elapsed)}ms)`;
        process.stderr.write(` ${status}\n`);
      } : undefined,
    });

    // Output
    if (format === 'sarif') {
      console.log(JSON.stringify(generateSarif(result), null, 2));
    } else if (format === 'json') {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(formatOutput(result));
    }

    // CI gate
    if (config.ci?.failBelow && result.score < config.ci.failBelow) {
      console.error(`\n  ❌ Score ${result.score} is below threshold ${config.ci.failBelow}`);
      process.exit(1);
    }
  });

// ── FIX ─────────────────────────────────────────────────
program
  .command("fix")
  .description("Auto-fix detected issues")
  .argument("[path]", "project directory", ".")
  .option("--engine <engines...>", "Fix only this engine's issues")
  .option("--safe", "Only apply safe fixes (confidence >= 0.8) (default)")
  .option("--force", "Apply all fixable diagnostics regardless of confidence")
  .option("--dry-run", "Show what would be fixed without modifying files")
  .option("--verify", "Re-scan after fix and rollback if score worsened")
  .action(async (path: string, opts: Record<string, any>) => {
    const rootDir = resolve(path);

    process.stderr.write(`\n  deep-slop fix: ${rootDir}\n\n`);

    // Detect project
    const languages = await detectLanguages(rootDir);
    const frameworks = await detectFrameworks(rootDir);

    // Build config
    const config: DeepSlopConfig = {
      ...DEFAULT_CONFIG,
      exclude: [...DEFAULT_CONFIG.exclude, ...(opts.exclude ?? [])],
    };

    // Enable only selected engines
    if (opts.engine) {
      for (const name of Object.keys(DEFAULT_CONFIG.engines)) {
        config.engines[name as keyof typeof config.engines] = false;
      }
      for (const name of opts.engine) {
        config.engines[name as keyof typeof config.engines] = true;
      }
    }

    // Collect files
    const files = await collectFiles(rootDir, languages, config.exclude);

    const context = {
      rootDirectory: rootDir,
      languages,
      frameworks,
      files,
      installedTools: {},
      config,
    };

    // Run scan first to get diagnostics
    const scanResult = await runScan(context, {
      onEngineStart: (name: string) => process.stderr.write(`  ⏳ ${name}...`),
      onEngineComplete: (r: any) => {
        const status = r.skipped ? '⏭️ skipped' : `✅ ${r.diagnostics.length} issues (${Math.round(r.elapsed)}ms)`
        process.stderr.write(` ${status}\n`)
      },
    })

    const allDiagnostics = scanResult.engines.flatMap((r) => r.diagnostics)

    // Determine fix mode: --force overrides --safe (default is safe)
    const mode: 'safe' | 'force' = opts.force ? 'force' : 'safe'
    const dryRun = opts.dryRun ?? false
    const verify = opts.verify ?? false

    // Run fix pipeline
    const fixResult = await runFixPipeline(allDiagnostics, context, {
      mode,
      dryRun,
      verify,
    })

    // Print fix result with colored output
    const { style, styleBold, separator } = await import('./output/theme.js')

    console.log('')
    console.log(separator())
    console.log(styleBold('info', '  Fix Summary'))
    console.log(separator())

    if (dryRun) {
      console.log(`  ${style('warn', 'DRY RUN')} — no files were modified`)
    }

    console.log(`  Mode:          ${style('info', mode)}`)
    console.log(`  Files:         ${style('suggestion', String(fixResult.filesModified))} modified`)
    console.log(`  Diagnostics:   ${style('suggestion', String(fixResult.diagnosticsFixed))} fixed`)
    console.log(`  Score:         ${String(fixResult.scoreBefore)} → ${fixResult.scoreAfter >= fixResult.scoreBefore ? style('success', String(fixResult.scoreAfter)) : style('danger', String(fixResult.scoreAfter))}`)

    if (fixResult.rolledBack) {
      console.log(`  ${styleBold('danger', 'ROLLED BACK')} — score worsened after fix, original files restored`)
    }

    if (fixResult.errors.length > 0) {
      console.log(`  ${style('danger', 'Errors:')}`)
      for (const err of fixResult.errors) {
        console.log(`    • ${err}`)
      }
    }

    console.log(separator())
    console.log('')
  });

// ── CI ──────────────────────────────────────────────────
program
  .command("ci")
  .description("CI mode: JSON output + quality gate")
  .argument("[path]", "project directory", ".")
  .option("--fail-below <score>", "Fail if score below threshold", "70")
  .option("--changes", "Scan only changed files (from git)")
  .option("--staged", "Scan only staged files")
  .option("--base <ref>", "Diff against arbitrary ref (e.g. origin/main)")
  .action(async (path: string, opts: Record<string, any>) => {
    // CI mode is essentially scan --json with a quality gate
    const rootDir = resolve(path);
    const languages = await detectLanguages(rootDir);
    const frameworks = await detectFrameworks(rootDir);
    let files = await collectFiles(rootDir, languages);

    // Diff-aware filtering (same logic as scan)
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

    const config: DeepSlopConfig = {
      ...DEFAULT_CONFIG,
      ci: { failBelow: parseInt(opts.failBelow) },
    };

    const result = await runScan({
      rootDirectory: rootDir,
      languages,
      frameworks,
      files,
      installedTools: {},
      config,
      diffScope,
    });

    console.log(JSON.stringify(result, null, 2));
    process.exit(result.score < config.ci!.failBelow ? 1 : 0);
  });

// ── RULES ───────────────────────────────────────────────
import { getCatalog, findRule, type RuleInfo } from './engines/catalog.js'

program
  .command("rules")
  .description("List all available rules, search, or show rule details")
  .argument('[rule-id]', 'Specific rule ID to show details for')
  .option('--search <query>', 'Fuzzy search rules by name or description')
  .action((ruleId: string | undefined, opts: Record<string, any>) => {
    // Mode 1: Show single rule detail
    if (ruleId && !opts.search) {
      const catalog = getCatalog()
      const rule = catalog.find((r) => r.id === ruleId)

      if (!rule) {
        // Try fuzzy match as suggestion
        const matches = findRule(ruleId)
        console.log(style('danger', `  Rule not found: ${ruleId}`))
        if (matches.length > 0) {
          console.log(style('muted', '  Did you mean one of these?'))
          for (const m of matches.slice(0, 5)) {
            console.log(`    ${style('info', m.id)}  ${m.description}`)
          }
        }
        console.log('')
        process.exit(1)
      }

      const slug = rule.id.replace(/\//g, '-').replace(/[^a-z0-9-]/g, '')
      const docUrl = `https://github.com/cardtest15-coder/deep-slop/wiki/rules#${slug}`

      console.log('')
      console.log(separator())
      console.log(styleBold('info', `  Rule: ${rule.description}`))
      console.log(separator())
      console.log(`  ID:            ${style('suggestion', rule.id)}`)
      console.log(`  Engine:        ${style('info', rule.engine)}`)
      console.log(`  Severity:      ${severityBadge(rule.severity)}`)
      console.log(`  Impact Tier:   ${tierBadge(rule.impactTier)}`)
      console.log(`  Fixable:       ${rule.fixable ? style('success', 'yes') : style('muted', 'no')}`)
      console.log(`  Help:          ${rule.help}`)
      console.log(`  Docs:          ${style('muted', docUrl)}`)
      console.log(separator())
      console.log('')
      return
    }

    // Mode 2: Search rules
    if (opts.search) {
      const matches = findRule(opts.search)
      if (matches.length === 0) {
        console.log(style('muted', `  No rules matching "${opts.search}"`))
        console.log('')
        return
      }
      console.log('')
      console.log(styleBold('info', `  Search results for "${opts.search}" (${matches.length} rules):`))
      console.log('')
      printRuleList(matches)
      console.log('')
      return
    }

    // Mode 3: List all rules grouped by engine
    const catalog = getCatalog()
    const byEngine = new Map<string, RuleInfo[]>()
    for (const rule of catalog) {
      const list = byEngine.get(rule.engine) ?? []
      list.push(rule)
      byEngine.set(rule.engine, list)
    }

    console.log('')
    console.log(styleBold('info', `  deep-slop rules (${catalog.length} rules across ${byEngine.size} engines):`))
    console.log('')

    for (const [engine, rules] of byEngine) {
      console.log(`  ${styleBold('info', engine)} ${style('muted', `(${rules.length} rules)`)}`)
      printRuleList(rules, '    ')
      console.log('')
    }
  })

/** Tier display badge */
function tierBadge(tier: string): string {
  const colors: Record<string, () => string> = {
    strict: () => styleBold('danger', 'STRICT'),
    standard: () => styleBold('danger', 'STD'),
    maintainability: () => styleBold('warn', 'MNTN'),
    mechanical: () => style('info', 'MECH'),
    style: () => style('muted', 'STYLE'),
    advisory: () => style('muted', 'ADVI'),
  }
  return (colors[tier] ?? (() => tier))()
}

/** Print a list of rules in columnar format */
function printRuleList(rules: RuleInfo[], indent = '  '): void {
  for (const rule of rules) {
    const icon = rule.severity === 'error' ? style('danger', '✗')
      : rule.severity === 'warning' ? style('warn', '○')
      : style('muted', '·')
    const namePart = rule.id.includes('/') ? rule.id.split('/')[1] : rule.id
    const tierStr = tierBadge(rule.impactTier)
    const sevStr = severityBadge(rule.severity)
    const fixStr = rule.fixable ? style('success', 'fixable') : ''
    // Pad name to 28, tier to 8, sev to 8
    const namePad = namePart.padEnd(28)
    console.log(`${indent}${icon} ${namePad} ${tierStr}  ${sevStr}  ${fixStr}`)
  }
}

// ── INIT ────────────────────────────────────────────────
program
  .command("init")
  .description("Initialize deep-slop configuration in a project")
  .argument("[path]", "project directory", ".")
  .option("--strict", "Use strict thresholds (maxFunctionLoc:30, maxFileLoc:200, failBelow:75)")
  .action((path: string, opts: { strict?: boolean }) => {
    runInit(path, opts)
  })

// ── DOCTOR ──────────────────────────────────────────────
program
  .command("doctor")
  .description("Check environment for deep-slop compatibility")
  .argument("[path]", "project directory", ".")
  .action(async (path: string) => {
    await runDoctor(path)
  })

// ── TREND ──────────────────────────────────────────────
program
  .command("trend")
  .description("Show score trend across recent scans")
  .argument("[path]", "project directory", ".")
  .option("--limit <n>", "Show last N runs", '10')
  .action(async (path: string, opts: Record<string, any>) => {
    const rootDir = resolve(path)
    const limit = parseInt(opts.limit ?? '10', 10)
    const records = readHistory(rootDir, limit)

    if (records.length === 0) {
      console.log(style('muted', 'No scan history found. Run `deep-slop scan` first.'))
      return
    }

    const scores = records.map((r) => r.score)
    const latest = records[records.length - 1]
    const previous = records.length >= 2 ? records[records.length - 2].score : null
    const delta = deltaText(latest.score, previous)

    console.log('')
    console.log(styleBold('info', `Score trend (last ${records.length} runs):`))
    console.log(`  ${sparkline(scores)}  ${styleBold(latest.score >= 75 ? 'success' : latest.score >= 50 ? 'warn' : 'danger', String(latest.score))} (${delta})`)
    console.log('')
    console.log(`  ${style('muted', '#')}  ${style('muted', 'When').padEnd(14)} ${style('muted', 'Score').padEnd(7)} ${style('muted', 'Errors').padEnd(7)} ${style('muted', 'Warns').padEnd(7)} ${style('muted', 'Files')}`)

    // Display in reverse chronological order
    const reversed = [...records].reverse()
    for (let i = 0; i < reversed.length; i++) {
      const r = reversed[i]
      const num = String(i + 1).padEnd(3)
      const when = relativeTime(r.timestamp).padEnd(14)
      const scoreStr = String(r.score).padEnd(7)
      const errs = String(r.errors).padEnd(7)
      const warns = String(r.warnings).padEnd(7)
      const files = String(r.filesScanned)
      console.log(`  ${num}${when}${scoreStr}${errs}${warns}${files}`)
    }

    console.log('')
  })

// ── WATCH ──────────────────────────────────────────────
program
  .command("watch")
  .description("Watch for file changes and auto-scan")
  .argument("[directory]", "project directory", ".")
  .option("--interval <ms>", "polling interval in ms", '3000')
  .option("--debounce <ms>", "debounce window in ms", '2000')
  .option("--repair", "auto-fix on change (runs fix pipeline in safe mode)")
  .option("--once", "single scan cycle then exit")
  .option("--target-score <n>", "stop watching when score reaches target")
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

    // Detect project once at start
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
          // Collect files (use changed files for targeted scan)
          const allFiles = await collectFiles(rootDir, languages, config.exclude)
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

          // Run scan
          const result = await runScan(context)

          // Update stats
          currentStats.isScanning = false
          currentStats.lastScanTime = Date.now()
          currentStats.lastScanScore = result.score
          currentStats.totalScans++

          // Display results
          console.log(formatWatchScanResult(
            result.score,
            result.totalDiagnostics,
            result.meta.filesScanned,
            result.meta.elapsed,
          ))

          const scanDelta = previousScore !== null ? previousScore : null
          previousScore = result.score

          // Auto-repair if enabled and score is low
          if (shouldRepair && result.score < 75) {
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

              // Re-scan after fix to get accurate score
              currentStats.isScanning = true
              const reScanResult = await runScan(context)
              currentStats.isScanning = false
              currentStats.lastScanScore = reScanResult.score
              currentStats.totalScans++
              previousScore = reScanResult.score

              console.log(formatWatchScanResult(
                reScanResult.score,
                reScanResult.totalDiagnostics,
                reScanResult.meta.filesScanned,
                reScanResult.meta.elapsed,
              ))
            }
          }

          // Check target score
          if (targetScore !== null && result.score >= targetScore) {
            console.log('')
            console.log(styleBold('success', `  Target score ${targetScore} reached! Current: ${result.score}`))
            console.log(separator())
            watcher.stop()
            process.exit(0)
          }

          // --once mode: exit after first scan
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
      onStats: (stats: WatchStats) => {
        // Update stats in real time (no output here to avoid spam)
      },
    })

    // Handle Ctrl+C gracefully
    let sigintReceived = false
    process.on('SIGINT', () => {
      if (sigintReceived) {
        // Second Ctrl+C: force exit
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

    // Start watching
    watcher.start()
    console.log(formatWatchStatus(watcher.getStats(), 'watching', null))

    // If --once, trigger an immediate scan cycle
    if (runOnce) {
      // Collect all files and trigger a scan
      const allFiles = await collectFiles(rootDir, languages, config.exclude)
      if (allFiles.length > 0) {
        watcher.stop()
        // Run a manual scan cycle
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
          currentStats.lastScanScore = result.score
          currentStats.totalScans++

          console.log(formatWatchScanResult(
            result.score,
            result.totalDiagnostics,
            result.meta.filesScanned,
            result.meta.elapsed,
          ))

          previousScore = result.score

          // Auto-repair if needed
          if (shouldRepair && result.score < 75) {
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

          // Target score check
          if (targetScore !== null && result.score >= targetScore) {
            console.log('')
            console.log(styleBold('success', `  Target score ${targetScore} reached! Current: ${result.score}`))
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

// ── HOOK ──────────────────────────────────────────────
const hookCmd = program
  .command('hook')
  .description('Manage deep-slop hooks for AI coding tools')

// ── hook install ─────────────────────────────────────
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

// ── hook uninstall ────────────────────────────────────
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

// ── hook status ──────────────────────────────────────
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

    // Check baseline
    const baseline = readBaseline(process.cwd())
    if (baseline) {
      console.log(`  ${style('info', '◆')} Baseline: score=${baseline.score} captured=${relativeTime(baseline.timestamp)}`)
    } else {
      console.log(`  ${style('muted', '◇')} No baseline captured. Run 'deep-slop hook baseline' to set one.`)
    }

    console.log(separator())
    console.log('')
  })

// ── hook baseline ────────────────────────────────────
hookCmd
  .command('baseline')
  .description('Capture quality gate baseline score (runs a scan first)')
  .argument('[path]', 'project directory', '.')
  .option('--check', 'Check current score against baseline (no capture)')
  .action(async (path: string, opts: Record<string, any>) => {
    const rootDir = resolve(path)

    // --check: compare current score against baseline without scanning
    if (opts.check) {
      const baseline = readBaseline(rootDir)
      if (!baseline) {
        process.stderr.write('  ⚠ No baseline found. Run "deep-slop hook baseline" first to capture one.\n')
        process.exit(1)
      }
      // Run a quick scan to get current score
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

      const gate = checkQualityGate(rootDir, result.score)
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

    // Capture mode: run scan and save baseline
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

    captureBaseline(rootDir, result.score, {
      total: result.totalDiagnostics,
      errors: result.bySeverity.error ?? 0,
      warnings: result.bySeverity.warning ?? 0,
    })

    console.log('')
    console.log(separator())
    console.log(styleBold('info', '  Baseline Captured'))
    console.log(separator())
    console.log(`  Score:       ${styleBold(result.score >= 75 ? 'success' : result.score >= 50 ? 'warn' : 'danger', String(result.score))} (${scoreLabel(result.score)})`)
    console.log(`  Diagnostics: ${result.totalDiagnostics} total`)
    console.log(`  File:        ${join(rootDir, '.deep-slop', 'baseline.json')}`)
    console.log(separator())
    console.log('')
  })

// ── AGENT ──────────────────────────────────────────────
const agentCmd = program
  .command('agent')
  .description('AI agent-powered repair commands')

// ── agent repair ─────────────────────────────────────
agentCmd
  .command('repair')
  .description('Run AI agent repair loop to improve code quality score')
  .argument('[path]', 'project directory', '.')
  .option('--provider <name>', 'Agent provider to use (claude/codex/aider/etc)', 'claude')
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

      // Display result
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

// ── agent providers ───────────────────────────────────
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

// ── agent plan ────────────────────────────────────────
agentCmd
  .command('plan')
  .description('Preview repair plan without running (shows initial score, target, provider, estimated turns)')
  .argument('[path]', 'project directory', '.')
  .option('--provider <name>', 'Agent provider to use', 'claude')
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

program.parse();
