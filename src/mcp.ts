#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { resolve } from "node:path";
import { z } from "zod";
import { runScan, runFix } from "./engines/orchestrator.js";
import { detectLanguages, detectFrameworks, collectFiles } from "./utils/discover.js";
import { DEFAULT_CONFIG, type DeepSlopConfig, type EngineName } from "./types/index.js";

const server = new McpServer({
  name: "deep-slop",
  version: "0.1.0",
});

// ── Tool 1: deep_slop_scan ─────────────────────────────
server.tool(
  "deep_slop_scan",
  "Scan project for AI slop and code quality issues with 12 engines",
  {
    path: z.string().default(".").describe("Project directory to scan"),
    engines: z.array(z.string()).optional().describe("Only run these engines"),
    exclude: z.array(z.string()).optional().describe("Exclude patterns"),
    minSeverity: z.enum(["error", "warning", "info", "suggestion"]).default("info"),
  },
  async ({ path, engines, exclude, minSeverity }) => {
    const rootDir = resolve(path);
    const languages = await detectLanguages(rootDir);
    const frameworks = await detectFrameworks(rootDir);
    const files = await collectFiles(rootDir, languages, exclude);

    const config: DeepSlopConfig = {
      ...DEFAULT_CONFIG,
      exclude: [...DEFAULT_CONFIG.exclude, ...(exclude ?? [])],
    };

    if (engines) {
      for (const name of Object.keys(DEFAULT_CONFIG.engines)) {
        config.engines[name as keyof typeof config.engines] = false;
      }
      for (const name of engines) {
        config.engines[name as keyof typeof config.engines] = true;
      }
    }

    const result = await runScan({
      rootDirectory: rootDir,
      languages,
      frameworks,
      files,
      installedTools: {},
      config,
    });

    // Filter by severity
    const sevOrder = { error: 0, warning: 1, info: 2, suggestion: 3 };
    const minOrder = sevOrder[minSeverity];
    for (const e of result.engines) {
      e.diagnostics = e.diagnostics.filter((d: { severity: keyof typeof sevOrder }) => sevOrder[d.severity] <= minOrder);
    }

    return {
      content: [{
        type: "text",
        text: JSON.stringify(result, null, 2),
      }],
    };
  },
);

// ── Tool 2: deep_slop_fix ──────────────────────────────
server.tool(
  "deep_slop_fix",
  "Auto-fix detected issues (safe transforms only)",
  {
    path: z.string().default(".").describe("Project directory"),
    engine: z.string().describe("Engine to fix issues from"),
    safe: z.boolean().default(true).describe("Only apply safe fixes"),
  },
  async ({ path, engine, safe }) => {
    // First scan, then fix
    const rootDir = resolve(path);
    const languages = await detectLanguages(rootDir);
    const frameworks = await detectFrameworks(rootDir);
    const files = await collectFiles(rootDir, languages);

    const config = { ...DEFAULT_CONFIG };
    // Enable only the target engine
    for (const name of Object.keys(config.engines)) {
      config.engines[name as keyof typeof config.engines] = false;
    }
    config.engines[engine as keyof typeof config.engines] = true;

    const result = await runScan({
      rootDirectory: rootDir,
      languages,
      frameworks,
      files,
      installedTools: {},
      config,
    });

    const diags = result.engines.flatMap((e: { diagnostics: any[] }) => e.diagnostics);
    const fixable = safe ? diags.filter((d: any) => d.fixable) : diags;

    const fixResult = await runFix(engine as EngineName, fixable, {
      rootDirectory: rootDir,
      languages,
      frameworks,
      files,
      installedTools: {},
      config,
    });

    return {
      content: [{
        type: "text",
        text: JSON.stringify(fixResult ?? { error: "Fix not available for this engine" }, null, 2),
      }],
    };
  },
);

// ── Tool 3: deep_slop_why ──────────────────────────────
server.tool(
  "deep_slop_why",
  "Explain why a specific rule flagged this code",
  {
    rule: z.string().describe("Rule ID (e.g. 'ast-slop/narrative-comment')"),
  },
  async ({ rule }) => {
    const explanations: Record<string, string> = {
      "ast-slop/narrative-comment": "AI agents often leave comments that describe WHAT code does rather than WHY. These comments add noise and don't help future readers. Remove them or replace with WHY explanations.",
      "ast-slop/decorative-comment": "Decorative separators (// ===, // ───) are visual noise that AI agents add to structure code. Use plain section labels without the padding.",
      "ast-slop/console-leftover": "console.log/console.debug are debug statements left by AI agents. Remove from production code, keep console.error/warn in catch blocks.",
      "ast-slop/as-any": "`as any` bypasses TypeScript's type safety. AI agents use it as a shortcut. Replace with proper types or named interfaces.",
      "import-intelligence/alternative-path": "Tree-shakeable imports reduce bundle size. Instead of `import { X } from 'lodash'`, use `import X from 'lodash/X'` so only X is included.",
      "import-intelligence/barrel-optimization": "Barrel files (index.ts) re-export from submodules. Importing from the barrel forces bundlers to process the entire barrel. Direct imports are more efficient.",
      "import-intelligence/circular-dependency": "Circular imports create initialization order problems and can cause runtime errors. Refactor to break the cycle.",
      "import-intelligence/unused-import": "Unused imports increase bundle size and indicate incomplete refactoring. Remove them, but verify they aren't used in type positions first.",
      "import-intelligence/duplicate-import": "Multiple imports from the same module should be merged into one import statement for clarity.",
      "import-intelligence/broken-alias": "The tsconfig path alias doesn't resolve to an existing file. This will cause build failures or incorrect module resolution.",
      "dead-flow/unreachable-after-terminator": "Code after return/throw/break/continue can never execute. Remove it to reduce confusion.",
      "dead-flow/unused-export": "Exported symbols that nothing imports are dead code. Either remove them or they indicate a missing consumer.",
      "dead-flow/unused-variable": "Variables declared but never used waste memory and indicate incomplete refactoring. Prefix with _ if intentionally unused.",
      "dead-flow/empty-block": "Empty blocks after if/for/while/try/catch are suspicious. Either add logic or add a comment explaining why it's intentionally empty.",
      "type-safety/double-assertion": "`as unknown as X` double casts bypass the type system entirely. Use a named interface extending the source type instead.",
      "type-safety/ts-suppress": "@ts-ignore and @ts-expect-error suppress type errors. Fix the underlying type error instead of suppressing it.",
      "type-safety/non-null-assertion": "The `!` operator asserts a value is non-null without checking. Add explicit null checks instead.",
      "type-safety/generic-any": "Using `any` as a generic parameter (e.g., Array<any>) defeats the purpose of generics. Use `unknown` or a specific type.",
      "syntax-deep/bom-present": "UTF-8 BOM characters cause issues with some parsers and tools. Strip them for consistent file processing.",
      "syntax-deep/crlf-line-endings": "CRLF line endings cause git diff noise and tooling issues on Unix systems. Normalize to LF.",
      "syntax-deep/precision-loss": "Floating-point literals with >15 significant digits lose precision at runtime. Use the shortest decimal that represents the same double.",
      "syntax-deep/unicode-anomaly": "Control characters, zero-width spaces, or RTL overrides in source code can cause subtle bugs or security issues.",
    };

    const explanation = explanations[rule] ?? `No detailed explanation available for rule '${rule}'. This rule is part of deep-slop's detection engine. Consult the documentation for more information.`;

    return {
      content: [{ type: "text", text: explanation }],
    };
  },
);

// ── Tool 4: deep_slop_engines ──────────────────────────
server.tool(
  "deep_slop_engines",
  "List all 12 detection engines and their descriptions",
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
    ];

    return {
      content: [{
        type: "text",
        text: `deep-slop engines (${engines.length} total, ${engines.reduce((s, e) => s + e.rules, 0)} rules):\n\n` +
          engines.map((e) => `  ${e.name.padEnd(22)} ${e.rules} rules — ${e.desc}`).join("\n"),
      }],
    };
  },
);

// ── Tool 5: deep_slop_score ────────────────────────────
server.tool(
  "deep_slop_score",
  "Quick quality score check (fast, returns just the score)",
  {
    path: z.string().default(".").describe("Project directory"),
  },
  async ({ path }) => {
    const rootDir = resolve(path);
    const languages = await detectLanguages(rootDir);
    const frameworks = await detectFrameworks(rootDir);
    const files = await collectFiles(rootDir, languages);

    const result = await runScan({
      rootDirectory: rootDir,
      languages,
      frameworks,
      files,
      installedTools: {},
      config: DEFAULT_CONFIG,
    });

    return {
      content: [{
        type: "text",
        text: `Score: ${result.score}/100 | Errors: ${result.bySeverity.error} | Warnings: ${result.bySeverity.warning} | Files: ${result.meta.filesScanned}`,
      }],
    };
  },
);

// ── Start MCP server ────────────────────────────────────
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
