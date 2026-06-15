#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { resolve, join } from "node:path"
import { z } from "zod"
import { runScan, runFix as runEngineFix } from "./engines/orchestrator.js"
import { detectLanguages, detectFrameworks, collectFiles } from "./utils/discover.js"
import { DEFAULT_CONFIG, type DeepSlopConfig, type EngineName, ALL_ENGINE_NAMES } from "./types/index.js"
import { APP_VERSION } from "./version.js"
import { getCatalog, findRule } from "./engines/catalog.js"
import { runFix as runFixPipeline, extractPlanPreview } from "./fix/index.js"
import { readBaseline } from "./hooks/baseline.js"
import { assessDiagnostic, summarizeAssessments } from "./output/assessment.js"
import { generateHTMLReport } from "./output/html-report.js"
import { readHistory } from "./history/store.js"
import { writeFileSync, mkdirSync } from "node:fs"
import { ENGINE_REGISTRY } from "./engines/orchestrator.js"

const server = new McpServer({
  name: "deep-slop",
  version: APP_VERSION,
})

// ── Tool 1: deep_slop_scan ─────────────────────────────
server.tool(
  "deep_slop_scan",
  "Scan project for AI slop and code quality issues with 21 engines",
  {
    path: z.string().default(".").describe("Project directory to scan"),
    engines: z.array(z.string()).optional().describe("Only run these engines"),
    exclude: z.array(z.string()).optional().describe("Exclude patterns"),
    minSeverity: z.enum(["error", "warning", "info", "suggestion"]).default("info"),
  },
  async ({ path, engines, exclude, minSeverity }) => {
    const rootDir = resolve(path)
    const languages = await detectLanguages(rootDir)
    const frameworks = await detectFrameworks(rootDir)
    const files = await collectFiles(rootDir, languages, exclude)

    const config: DeepSlopConfig = {
      ...DEFAULT_CONFIG,
      exclude: [...DEFAULT_CONFIG.exclude, ...(exclude ?? [])],
    }

    if (engines) {
      for (const name of Object.keys(ALL_ENGINE_NAMES)) {
        config.engines[name as keyof typeof config.engines] = false
      }
      for (const name of engines) {
        config.engines[name as keyof typeof config.engines] = true
      }
    }

    const result = await runScan({
      rootDirectory: rootDir,
      languages,
      frameworks,
      files,
      installedTools: {},
      config,
    })

    // Filter by severity
    const sevOrder = { error: 0, warning: 1, info: 2, suggestion: 3 }
    const minOrder = sevOrder[minSeverity]
    for (const e of result.engines) {
      e.diagnostics = e.diagnostics.filter((d: { severity: keyof typeof sevOrder }) => sevOrder[d.severity] <= minOrder)
    }

    // Enrich diagnostics with assessment
    const allDiags = result.engines.flatMap((e) => e.diagnostics)
    const assessmentSummary = summarizeAssessments(allDiags)
    const assessedDiags = allDiags.map((d) => ({
      ...d,
      assessment: assessDiagnostic(d),
    }))

    const enrichedResult = {
      ...result,
      engines: result.engines.map((e) => ({
        ...e,
        diagnostics: e.diagnostics.map((d) => ({
          ...d,
          assessment: assessDiagnostic(d),
        })),
      })),
      assessmentSummary,
    }

    return {
      content: [{
        type: "text",
        text: JSON.stringify(enrichedResult, null, 2),
      }],
    }
  },
)

// ── Tool 2: deep_slop_why ──────────────────────────────
server.tool(
  "deep_slop_why",
  "Explain why a specific rule flagged this code, with impact tier and documentation link",
  {
    rule_id: z.string().describe("Rule ID (e.g. 'ast-slop/narrative-comment')"),
  },
  async ({ rule_id }) => {
    const catalog = getCatalog()
    const rule = catalog.find((r) => r.id === rule_id)

    if (!rule) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            error: "Rule not found",
            suggestion: "Use deep_slop_rules to list available rules",
          }, null, 2),
        }],
      }
    }

    const slug = rule.id.replace(/\//g, '-').replace(/[^a-z0-9-]/g, '')
    const documentation_url = `https://github.com/DemumuMind/deep-slopDM/wiki/rules#${slug}`

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          rule_id: rule.id,
          engine: rule.engine,
          severity: rule.severity,
          impact_tier: rule.impactTier,
          description: rule.description,
          hint: rule.help,
          documentation_url,
          fixable: rule.fixable,
        }, null, 2),
      }],
    }
  },
)

// ── Tool 3: deep_slop_fix ──────────────────────────────
server.tool(
  "deep_slop_fix",
  "Auto-fix detected issues: scan → collect fixable diagnostics → apply fixes → re-scan",
  {
    directory: z.string().describe("Project directory to fix"),
    safe: z.boolean().default(true).describe("Only apply safe fixes (confidence >= 0.8)"),
    rule_overrides: z.record(z.string(), z.enum(["error", "warning", "info", "off"])).optional().describe("Rule severity overrides (e.g. {\"ast-slop/narrative-comment\": \"off\"})"),
  },
  async ({ directory, safe, rule_overrides }) => {
    const rootDir = resolve(directory)

    // Detect project
    const languages = await detectLanguages(rootDir)
    const frameworks = await detectFrameworks(rootDir)
    const files = await collectFiles(rootDir, languages)

    const config: DeepSlopConfig = {
      ...DEFAULT_CONFIG,
      rules: (rule_overrides ?? {}) as Record<string, import('./scoring/rule-overrides.js').RuleSeverityOverride>,
    }

    const context = {
      rootDirectory: rootDir,
      languages,
      frameworks,
      files,
      installedTools: {} as Record<string, string | boolean>,
      config,
    }

    // Scan before fix
    const scanBefore = await runScan(context)
    const scoreBefore = scanBefore.score

    const allDiagnostics = scanBefore.engines.flatMap((e) => e.diagnostics)

    // Run fix pipeline
    const fixResult = await runFixPipeline(allDiagnostics, context, {
      mode: safe ? 'safe' : 'force',
      dryRun: false,
      verify: true,
    })

    // Re-scan after fix
    const scanAfter = await runScan(context)
    const scoreAfter = scanAfter.score

    const remainingIssues = scanAfter.totalDiagnostics

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          ok: !fixResult.rolledBack,
          fixedCount: fixResult.diagnosticsFixed,
          scoreBefore,
          scoreAfter,
          delta: (scoreAfter ?? 0) - (scoreBefore ?? 0),
          remainingIssues,
        }, null, 2),
      }],
    }
  },
)

// ── Tool 4: deep_slop_engines ──────────────────────────
server.tool(
  "deep_slop_engines",
  "List all 21 detection engines and their descriptions",
  {},
  async () => {
    const engines = [
      { name: "ast-slop", rules: 10, desc: "AI-authored code patterns: narrative comments, decorative blocks, console leftovers, generic names, hallucinated imports" },
      { name: "import-intelligence", rules: 7, desc: "Alternative import paths, barrel optimization, alias validation, circular deps, unused/duplicate imports" },
      { name: "dead-flow", rules: 7, desc: "Unreachable code, dead conditionals, unused exports/variables, empty blocks, dead switch cases" },
      { name: "type-safety", rules: 6, desc: "as-any casts with context suggestions, double assertions, missing return types, ts-suppress, non-null, generic-any" },
      { name: "syntax-deep", rules: 12, desc: "BOM, CRLF, mixed line endings, escape sequences, regex issues, precision loss, unicode anomalies" },
      { name: "security-deep", rules: 7, desc: "eval, innerHTML, SQL/shell injection, SSRF, prototype pollution, hardcoded secrets" },
      { name: "arch-constraints", rules: 3, desc: "Circular dependencies, coupling metrics, layer violations" },
      { name: "dup-detect", rules: 2, desc: "Structural duplicates, copy-paste with rename" },
      { name: "perf-hints", rules: 4, desc: "N+1 patterns, React memoization, sync-in-async, loop allocations" },
      { name: "i18n-lint", rules: 3, desc: "Hardcoded strings, missing translation keys, locale mismatches" },
      { name: "config-lint", rules: 3, desc: "tsconfig, ESLint, bundler configuration validation" },
      { name: "meta-quality", rules: 2, desc: "Scoring weights, trend analysis, diff scoring, quality gate" },
      { name: "framework-lint", rules: 15, desc: "Framework-specific AI slop: Next.js client/server issues, Tailwind CSS anti-patterns" },
      { name: "markup-lint", rules: 20, desc: "Quality checks for JSON, YAML, CSS, HTML, and Markdown files" },
      { name: "rust-deep", rules: 9, desc: "Rust-specific analysis: unwrap/expect, todo!/unimplemented!, clone-on-copy, unsafe, match wildcards, large enum variants" },
      { name: "python-deep", rules: 11, desc: "Python-specific analysis: bare/broad exceptions, type hints, mutable defaults, star imports, global variables, pass stubs, prints, f-string logging, missing docstrings" },
      { name: "go-deep", rules: 9, desc: "Go-specific idiomatic and architectural rules: unchecked errors, empty interfaces, missing docs, value copies, init side effects, defer-in-loop, missing context, goto, package cycles" },
    ]

    return {
      content: [{
        type: "text",
        text: `deep-slop engines (${engines.length} total, ${engines.reduce((s, e) => s + e.rules, 0)} rules):\n\n` +
          engines.map((e) => `  ${e.name.padEnd(22)} ${e.rules} rules — ${e.desc}`).join("\n"),
      }],
    }
  },
)

// ── Tool 5: deep_slop_rules ────────────────────────────
server.tool(
  "deep_slop_rules",
  "List all available rules with metadata, or search by name/description",
  {
    search: z.string().optional().describe("Fuzzy search query for rule name or description"),
  },
  async ({ search }) => {
    const catalog = search ? findRule(search) : getCatalog()

    if (catalog.length === 0) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            message: "No rules found matching query",
            query: search,
            totalAvailable: getCatalog().length,
          }, null, 2),
        }],
      }
    }

    return {
      content: [{
        type: "text",
        text: JSON.stringify(catalog.map((r) => ({
          id: r.id,
          engine: r.engine,
          severity: r.severity,
          impactTier: r.impactTier,
          fixable: r.fixable,
          description: r.description,
        })), null, 2),
      }],
    }
  },
)

// ── Tool 6: deep_slop_score ────────────────────────────
server.tool(
  "deep_slop_score",
  "Quick quality score check (fast, returns just the score)",
  {
    path: z.string().default(".").describe("Project directory"),
  },
  async ({ path }) => {
    const rootDir = resolve(path)
    const languages = await detectLanguages(rootDir)
    const frameworks = await detectFrameworks(rootDir)
    const files = await collectFiles(rootDir, languages)

    const result = await runScan({
      rootDirectory: rootDir,
      languages,
      frameworks,
      files,
      installedTools: {},
      config: DEFAULT_CONFIG,
    })

    return {
      content: [{
        type: "text",
        text: `Score: ${result.score}/100 | Errors: ${result.bySeverity.error} | Warnings: ${result.bySeverity.warning} | Files: ${result.meta.filesScanned}`,
      }],
    }
  },
)

// ── Tool 7: deep_slop_baseline ──────────────────────────
server.tool(
  "deep_slop_baseline",
  "Check the current quality baseline before making changes. Returns baseline score, last scan time, and file count.",
  {
    path: z.string().optional().describe("Project directory (defaults to current directory)"),
  },
  async ({ path }) => {
    const rootDir = resolve(path ?? '.')
    const baseline = readBaseline(rootDir)

    if (!baseline) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            exists: false,
            hint: "Run 'deep-slop hook baseline' to capture",
          }, null, 2),
        }],
      }
    }

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          exists: true,
          score: baseline.score,
          lastScanAt: baseline.timestamp,
          fileCount: baseline.diagnostics.total,
        }, null, 2),
      }],
    }
  },
)

// ── Tool 8: deep_slop_report ─────────────────────────────
server.tool(
  "deep_slop_report",
  "Generate an HTML trend report from scan history",
  {
    path: z.string().default(".").describe("Project directory to scan history from"),
    limit: z.number().default(50).describe("Number of recent scans to include"),
  },
  async ({ path, limit }) => {
    const rootDir = resolve(path)
    const records = readHistory(rootDir, limit)
    const html = generateHTMLReport(records, {
      title: `deep-slop Trend Report — ${path}`,
      rootDir,
    })

    const reportPath = join(rootDir, '.deep-slop', 'report.html')
    mkdirSync(join(rootDir, '.deep-slop'), { recursive: true })
    writeFileSync(reportPath, html, 'utf8')

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          reportPath,
          records: records.length,
        }, null, 2),
      }],
    }
  },
)

// ── Tool 9: deep_slop_fix_preview ────────────────────────
server.tool(
  "deep_slop_fix_preview",
  "Preview what fixes would be applied without modifying files",
  {
    path: z.string().describe("Project directory to preview fixes for"),
    rules: z.array(z.string()).optional().describe("Only preview fixes for these rule IDs"),
  },
  async ({ path, rules }) => {
    const rootDir = resolve(path)

    const languages = await detectLanguages(rootDir)
    const frameworks = await detectFrameworks(rootDir)
    const files = await collectFiles(rootDir, languages)

    const context = {
      rootDirectory: rootDir,
      languages,
      frameworks,
      files,
      installedTools: {} as Record<string, string | boolean>,
      config: DEFAULT_CONFIG,
    }

    const scanResult = await runScan(context)
    const allDiagnostics = scanResult.engines.flatMap((e) => e.diagnostics)

    const fixResult = await runFixPipeline(allDiagnostics, context, {
      mode: 'safe',
      dryRun: false,
      verify: false,
      plan: true,
      rules,
    })

    const preview = extractPlanPreview(fixResult)
    if (!preview) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            preview: null,
            diagnosticsAddressed: 0,
            filesAffected: [],
            items: [],
          }, null, 2),
        }],
      }
    }

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          preview: {
            scoreBefore: preview.scoreBefore,
            estimatedScoreAfter: preview.estimatedScoreAfter,
            estimatedEffort: preview.estimatedEffort,
            diagnosticsAddressed: preview.diagnosticsAddressed,
            filesAffected: preview.filesAffected,
            items: preview.items.map((item) => ({
              filePath: item.filePath,
              rule: item.rule,
              startLine: item.startLine,
              endLine: item.endLine,
              confidence: item.confidence,
              before: item.before,
              after: item.after,
            })),
          },
        }, null, 2),
      }],
    }
  },
)

// ── Tool 10: deep_slop_engines_detail ─────────────────────
server.tool(
  "deep_slop_engines_detail",
  "Get detailed information about a specific engine",
  {
    engine: z.string().describe("Engine name (e.g. 'ast-slop')"),
  },
  async ({ engine }) => {
    const catalog = getCatalog()
    const engineRules = catalog.filter((r) => r.engine === engine)

    let description = "Unknown engine"
    let supportedLanguages: string[] = []
    let fixableRules: string[] = []

    if (engineRules.length > 0) {
      description = engineRules[0].description
    }

    const loader = ENGINE_REGISTRY[engine as EngineName]
    if (loader) {
      try {
        const e = await loader()
        description = e.description
        supportedLanguages = e.supportedLanguages
      } catch {
        // Keep defaults
      }
    }

    fixableRules = engineRules.filter((r) => r.fixable).map((r) => r.id)

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          name: engine,
          description,
          supportedLanguages,
          rules: engineRules.map((r) => ({
            id: r.id,
            severity: r.severity,
            impactTier: r.impactTier,
            fixable: r.fixable,
            description: r.description,
          })),
          fixableRules,
        }, null, 2),
      }],
    }
  },
)

// ── Start MCP server ────────────────────────────────────
async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
}

main().catch(console.error)

