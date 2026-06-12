#!/usr/bin/env node
import { Command } from "commander";
import { resolve } from "node:path";
import { runScan, runFix } from "./engines/orchestrator.js";
import { detectLanguages, detectFrameworks, collectFiles } from "./utils/discover.js";
import { DEFAULT_CONFIG, type DeepSlopConfig } from "./types/index.js";
import { formatOutput } from "./output/formatter.js";

const program = new Command();

program
  .name("deep-slop")
  .description("Deep AI slop detection — 12 engines, AST-powered, with alternative import paths")
  .version("0.1.0");

// ── SCAN ────────────────────────────────────────────────
program
  .command("scan")
  .description("Scan project for AI slop and code quality issues")
  .argument("[path]", "project directory", ".")
  .option("--json", "Output as JSON")
  .option("--changes", "Scan only changed files (from git)")
  .option("--staged", "Scan only staged files")
  .option("--include <patterns...>", "Include only these paths")
  .option("--exclude <patterns...>", "Exclude these paths")
  .option("--engine <engines...>", "Run only these engines")
  .option("--severity <level>", "Minimum severity to report (error|warning|info|suggestion)", "info")
  .action(async (path: string, opts: Record<string, any>) => {
    const rootDir = resolve(path);
    process.stderr.write(`\n  deep-slop scanning: ${rootDir}\n\n`);

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

    // Run scan with progress
    const result = await runScan(context, {
      onEngineStart: (name: string) => process.stderr.write(`  ⏳ ${name}...`),
      onEngineComplete: (r: any) => {
        const status = r.skipped ? "⏭️ skipped" : `✅ ${r.diagnostics.length} issues (${Math.round(r.elapsed)}ms)`;
        process.stderr.write(` ${status}\n`);
      },
    });

    // Output
    if (opts.json) {
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
  .option("--engine <name>", "Fix only this engine's issues")
  .option("--safe", "Only apply safe fixes (no breaking changes)")
  .option("--dry-run", "Show what would be fixed without modifying files")
  .action(async (path: string, opts) => {
    console.log("  deep-slop fix — coming soon (AST-based safe transforms)");
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

program.parse();
