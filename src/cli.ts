#!/usr/bin/env node
import { Command } from "commander";
import { resolve } from "node:path";
import { runScan } from "./engines/orchestrator.js";
import { runFix as runFixPipeline } from "./fix/index.js";
import { detectLanguages, detectFrameworks, collectFiles } from "./utils/discover.js";
import { DEFAULT_CONFIG, type DeepSlopConfig } from "./types/index.js";
import { formatOutput } from "./output/formatter.js";
import { generateSarif } from "./output/sarif.js";
import { APP_VERSION } from "./version.js";
import { runInit } from "./cli/init.js";
import { runDoctor } from "./cli/doctor.js";

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
  .option("--include <patterns...>", "Include only these paths")
  .option("--exclude <patterns...>", "Exclude these paths")
  .option("--engine <engines...>", "Run only these engines")
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

    // Collect files
    const files = await collectFiles(rootDir, languages, config.exclude, opts.include);

    const context = {
      rootDirectory: rootDir,
      languages,
      frameworks,
      files,
      installedTools: {},
      config,
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
  .action(async (path: string, opts) => {
    // CI mode is essentially scan --json with a quality gate
    const rootDir = resolve(path);
    const languages = await detectLanguages(rootDir);
    const frameworks = await detectFrameworks(rootDir);
    const files = await collectFiles(rootDir, languages);

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
    });

    console.log(JSON.stringify(result, null, 2));
    process.exit(result.score < config.ci!.failBelow ? 1 : 0);
  });

// ── RULES ───────────────────────────────────────────────
program
  .command("rules")
  .description("List all available rules")
  .action(() => {
    const engines = [
      "ast-slop: Narrative comments, trivial comments, decorative blocks, hallucinated imports",
      "import-intelligence: Alternative paths, barrel optimization, alias validation, circular deps",
      "dead-flow: Unreachable branches, unused exports, unused variables, dead conditionals",
      "type-safety: as-any casts, double assertions, missing types, generic misuse",
      "syntax-deep: BOM, CRLF, escape sequences, unicode anomalies, regex issues",
      "security-deep: eval, innerHTML, SSRF, prototype pollution, supply chain",
      "arch-constraints: Circular dependencies, coupling metrics, layer violations",
      "dup-detect: Structural duplicates, copy-paste with rename, similar blocks",
      "perf-hints: N+1 patterns, unnecessary re-renders, heavy loops, memoization",
      "i18n-lint: Hardcoded strings, missing translation keys, locale mismatches",
      "config-lint: tsconfig, eslint, vite/webpack config validation",
      "meta-quality: Scoring weights, trend analysis, diff scoring, quality gate",
    ];
    console.log("\n  deep-slop rules (12 engines):\n");
    for (const e of engines) console.log(`  • ${e}`);
    console.log();
  });

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

program.parse();
