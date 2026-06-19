import { performance } from 'node:perf_hooks'
import type { Engine, EngineContext, EngineName, EngineResult, ScanResult, Severity, Category, Diagnostic, Language } from '../types/index.js'
import { calculateScore } from '../scoring/index.js'
import { applyRuleSeverities } from '../scoring/rule-overrides.js'
import { appendRecord, type HistoryRecord } from '../history/store.js'
import { preloadFiles, clearFileCache } from '../utils/file-cache.js'
import { clearBatch } from '../utils/batch-processor.js'
import { clearParseCache } from '../utils/tree-sitter/index.js'
import { discoverAndLoadPlugins, pluginRegistry } from '../plugins/registry.js'
import { applySuppressDirectives, loadIgnoreFile } from '../utils/suppress.js'
import { isEngineEnabled } from '../config/engine-utils.js'

/** File extension to Language mapping (for scoreability check) */
const EXT_TO_LANG: Record<string, Language> = {
  '.ts': 'typescript',
  '.tsx': 'tsx',
  '.js': 'javascript',
  '.jsx': 'jsx',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.py': 'python',
  '.go': 'go',
  '.rs': 'rust',
  '.rb': 'ruby',
  '.php': 'php',
  '.java': 'java',
  '.cs': 'csharp',
  '.swift': 'swift',
}

/** Registry of all 20 engines (loaded lazily) */
export const ENGINE_REGISTRY: Record<EngineName, () => Promise<Engine>> = {
  "ast-slop": () => import("../engines/ast-slop/index.js").then((m) => m.astSlopEngine),
  "import-intelligence": () => import("../engines/import-intelligence/index.js").then((m) => m.importIntelligenceEngine),
  "dead-flow": () => import("../engines/dead-flow/index.js").then((m) => m.deadFlowEngine),
  "type-safety": () => import("../engines/type-safety/index.js").then((m) => m.typeSafetyEngine),
  "syntax-deep": () => import("../engines/syntax-deep/index.js").then((m) => m.syntaxDeepEngine),
  "security-deep": () => import("../engines/security-deep/index.js").then((m) => m.securityDeepEngine),
  "arch-constraints": () => import("../engines/arch-constraints/index.js").then((m) => m.archConstraintsEngine),
  "dup-detect": () => import("../engines/dup-detect/index.js").then((m) => m.dupDetectEngine),
  "perf-hints": () => import("../engines/perf-hints/index.js").then((m) => m.perfHintsEngine),
  "i18n-lint": () => import("../engines/i18n-lint/index.js").then((m) => m.i18nLintEngine),
  "config-lint": () => import("../engines/config-lint/index.js").then((m) => m.configLintEngine),
  "meta-quality": () => import("../engines/meta-quality/index.js").then((m) => m.metaQualityEngine),
  "lint-external": () => import("../engines/lint-external/index.js").then((m) => m.lintExternalEngine),
  "arch-rules": () => import("../engines/arch-rules/index.js").then((m) => m.archRulesEngine),
  "knip": () => import("../engines/knip/index.js").then((m) => m.knipEngine),
  "format-lint": () => import("../engines/format-lint/index.js").then((m) => m.formatLintEngine),
  "framework-lint": () => import("../engines/framework-lint/index.js").then((m) => m.frameworkLintEngine),
  "markup-lint": () => import("../engines/markup-lint/index.js").then((m) => m.markupLintEngine),
  "rust-deep": () => import("../engines/rust-deep/index.js").then((m) => m.rustDeepEngine),
  "python-deep": () => import("../engines/python-deep/index.js").then((m) => m.pythonDeepEngine),
  "go-deep": () => import("../engines/go-deep/index.js").then((m) => m.goDeepEngine),
};

/** Pre-registered engines (used by bundled CLI to avoid dynamic imports) */
const eagerEngines: Partial<Record<EngineName, Engine>> = {}

/**
 * Register engines eagerly (used by the bundled CLI entry point).
 * When engines are registered here, the lazy dynamic imports are skipped.
 */
export function registerEngines(engines: Record<string, Engine>): void {
  for (const [name, engine] of Object.entries(engines)) {
    eagerEngines[name as EngineName] = engine
    // Replace lazy loader with eager resolver
    ENGINE_REGISTRY[name as EngineName] = () => Promise.resolve(engine)
  }
}

export interface OrchestratorCallbacks {
  onEngineStart?: (name: EngineName) => void;
  onEngineComplete?: (result: EngineResult) => void;
  onProgress?: (completed: number, total: number) => void;
}

/** Run selected engines and produce aggregated scan result */
export async function runScan(
  context: EngineContext,
  callbacks?: OrchestratorCallbacks,
): Promise<ScanResult> {
  const startTotal = performance.now();

  // Clear caches between scans
  clearFileCache()
  clearBatch() // Clear shared batch cache between scans
  clearParseCache() // Clear AST cache between scans
  // NOTE: We do NOT preload all files here. Instead, engines read files
  // lazily via readFileContent() → readFileCached(). This allows engines
  // with early-exit to stop after scanning just the first batch of files,
  // saving significant I/O time for zero-issue engines.

  // Pre-compute disabled rules from config for early-exit accuracy
  const disabledRules = new Set<string>()
  const rulesConfig = context.config.rules ?? {}
  for (const [rule, severity] of Object.entries(rulesConfig)) {
    if (severity === 'off') disabledRules.add(rule)
  }
  // Also expand wildcard rules (e.g. "type-safety/*") into concrete rule IDs
  const wildcardOff: string[] = []
  for (const [key, severity] of Object.entries(rulesConfig)) {
    if (severity === 'off' && key.endsWith('/*')) {
      wildcardOff.push(key.slice(0, -2))
    }
  }
  // Pass the full rules config so engines can check severity overrides
  // (e.g. type-safety rules set to 'info' still produce diagnostics, but
  //  engines can early-exit if ALL their rules are effectively non-default)
  ;(context as any)._wildcardOff = wildcardOff
  ;(context as any).rulesConfig = rulesConfig
  context.disabledRules = disabledRules

  // Also add globally suppressed rules from .deep-slop/.deep-slop-ignore
  // so engines can early-exit when all their rules are suppressed
  const precomputedIgnored = new Set(loadIgnoreFile(context.rootDirectory))
  for (const rule of precomputedIgnored) {
    context.disabledRules.add(rule)
  }
  ;(context as any)._globallySuppressed = precomputedIgnored

  // Discover and load plugins AFTER built-in engines
  const pluginEngines = await discoverAndLoadPlugins(context.rootDirectory)

  // Determine which engines to run
  const enabledEngines = Object.entries(ENGINE_REGISTRY).filter(
    ([name]) => isEngineEnabled(context.config.engines[name as EngineName]),
  );

  // Add plugin engines (loaded after built-ins)
  for (const pluginEngine of pluginEngines) {
    // Check if plugin is disabled via config
    if (isEngineEnabled(context.config.engines[pluginEngine.name])) {
      enabledEngines.push([
        pluginEngine.name as EngineName,
        () => Promise.resolve(pluginEngine),
      ])
    }
  }

  const results: EngineResult[] = [];
  let completed = 0;

  // Run engines in parallel (with optional concurrency limit)
  const settled = await Promise.allSettled(
    enabledEngines.map(async ([name, loader]) => {
      callbacks?.onEngineStart?.(name as EngineName);

      try {
        const engine = await loader();
        const start = performance.now();

        // Skip engine if language not supported
        if (!engine.supportedLanguages.some((l) => context.languages.includes(l))) {
          const result: EngineResult = {
            name: name as EngineName,
            engine: name as EngineName,
            diagnostics: [],
            elapsed: 0,
            skipped: true,
            skipReason: `No supported language found (engine supports: ${engine.supportedLanguages.join(", ")})`,
          };
          callbacks?.onEngineComplete?.(result);
          completed++;
          callbacks?.onProgress?.(completed, enabledEngines.length);
          return result;
        }

        const result = await engine.run(context);
        result.name = name as EngineName;
        result.elapsed = performance.now() - start;
        callbacks?.onEngineComplete?.(result);
        completed++;
        callbacks?.onProgress?.(completed, enabledEngines.length);
        return result;
      } catch (error) {
        const result: EngineResult = {
          name: name as EngineName,
          engine: name as EngineName,
          diagnostics: [],
          elapsed: 0,
          skipped: true,
          skipReason: error instanceof Error ? error.message : String(error),
        };
        callbacks?.onEngineComplete?.(result);
        completed++;
        callbacks?.onProgress?.(completed, enabledEngines.length);
        return result;
      }
    }),
  );

  // Collect results
  for (const r of settled) {
    results.push(r.status === "fulfilled" ? r.value : {
      name: "ast-slop" as EngineName,
      engine: "ast-slop" as EngineName, // fallback
      diagnostics: [],
      elapsed: 0,
      skipped: true,
      skipReason: r.reason instanceof Error ? r.reason.message : String(r.reason),
    });
  }

  // Collect raw diagnostics from all engines
  const rawDiagnostics = results.flatMap((r) => r.diagnostics)

  // Apply per-rule severity overrides from config
  let allDiagnostics = applyRuleSeverities(rawDiagnostics, context.config.rules || {})

  // Apply suppress directives BEFORE scoring
  // Read file contents for suppress parsing
  const fileContents = new Map<string, string>()
  if (context.files?.length) {
    const { readFile: fsReadFile } = await import('node:fs/promises')
    const { join } = await import('node:path')
    const uniquePaths = new Set(allDiagnostics.map((d) => d.filePath))
    for (const relPath of uniquePaths) {
      try {
        const absPath = join(context.rootDirectory, relPath)
        const content = await fsReadFile(absPath, 'utf-8')
        fileContents.set(relPath, content)
      } catch {
        // File read failure — skip suppress for this file
      }
    }
  }

  const globallySuppressed = (context as any)._globallySuppressed ?? new Set(loadIgnoreFile(context.rootDirectory))
  const { filtered, suppressedCount } = applySuppressDirectives(allDiagnostics, fileContents, globallySuppressed)
  allDiagnostics = filtered

  // Propagate adjusted diagnostics back into engine results
  for (const r of results) {
    r.diagnostics = allDiagnostics.filter((d) => d.engine === r.engine)
  }

  const bySeverity: Record<Severity, number> = { error: 0, warning: 0, info: 0, suggestion: 0 };
  const byEngine: Record<EngineName, number> = {} as Record<EngineName, number>;
  const categoryScores: Record<Category, number> = {} as Record<Category, number>;

  for (const d of allDiagnostics) {
    bySeverity[d.severity]++
    byEngine[d.engine] = (byEngine[d.engine] ?? 0) + 1
  }

  // Calculate score: density-aware logarithmic scoring
  const fileCount = context.files?.length ?? 0
  const scoringResult = calculateScore(allDiagnostics, fileCount)
  let score: number | null = scoringResult.score

  // Determine scoreability: check if >80% of files are in unsupported languages
  // Languages with dedicated rules (engines that ran and weren't skipped)
  const supportedLangs = new Set<Language>()
  for (const r of results) {
    if (!r.skipped) {
      // Find the engine's supported languages from the registry
      const engineLoader = ENGINE_REGISTRY[r.engine]
      if (engineLoader) {
        try {
          const engine = await engineLoader()
          for (const l of engine.supportedLanguages) {
            supportedLangs.add(l)
          }
        } catch {
          // Engine load failure — skip
        }
      }
    }
  }

  const unsupportedFileCount = context.files
    ? context.files.filter((f) => {
        const ext = f.split('.').pop()?.toLowerCase() ?? ''
        const lang = EXT_TO_LANG[`.${ext}`]
        return lang && !supportedLangs.has(lang)
      }).length
    : 0
  const totalFileCount = context.files?.length ?? 0
  const unsupportedRatio = totalFileCount > 0 ? unsupportedFileCount / totalFileCount : 0
  const scoreable = unsupportedRatio < 0.8

  if (!scoreable) {
    score = null
  }

  const scanResult: ScanResult = {
    engines: results,
    score,
    scoreable,
    categoryScores,
    totalDiagnostics: allDiagnostics.length,
    bySeverity,
    byEngine,
    suppressedCount,
    meta: {
      rootDirectory: context.rootDirectory,
      languages: context.languages,
      frameworks: context.frameworks,
      filesScanned: context.files?.length ?? 0,
      elapsed: performance.now() - startTotal,
      diffScope: context.diffScope,
    },
  }

  // Persist history for full scans (not diff/staged/ci)
  if (!context.diffScope) {
    const record: HistoryRecord = {
      timestamp: new Date().toISOString(),
      score: scanResult.score,
      errors: bySeverity.error,
      warnings: bySeverity.warning,
      info: bySeverity.info,
      suggestions: bySeverity.suggestion,
      filesScanned: scanResult.meta.filesScanned,
      engines: results.filter((r) => !r.skipped).map((r) => r.engine),
      durationMs: scanResult.meta.elapsed,
    }
    try {
      appendRecord(context.rootDirectory, record)
    } catch {
      // History write failure should not break scan
    }
  }

  return scanResult
}
/** Run auto-fix for a specific engine */
export async function runFix(
  engineName: EngineName,
  diagnostics: Diagnostic[],
  context: EngineContext,
): Promise<import("../types/index.js").FixResult | null> {
  const loader = ENGINE_REGISTRY[engineName];
  if (!loader) return null;

  const engine = await loader();
  if (!engine.fix) return null;

  return engine.fix(diagnostics, context);
}
