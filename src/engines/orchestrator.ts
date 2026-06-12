import { performance } from 'node:perf_hooks'
import type { Engine, EngineContext, EngineName, EngineResult, ScanResult, Severity, Category, Diagnostic } from '../types/index.js'
import { calculateScore } from '../scoring/index.js'
import { applyRuleSeverities } from '../scoring/rule-overrides.js'
import { appendRecord, type HistoryRecord } from '../history/store.js'
import { LiveGrid } from '../ui/live-grid.js'
import { preloadFiles, clearFileCache } from '../utils/file-cache.js'

/** Registry of all 15 engines (loaded lazily) */
const ENGINE_REGISTRY: Record<EngineName, () => Promise<Engine>> = {
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
};

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

  // Preload all source files into cache for faster engine access
  clearFileCache()
  if (context.files?.length) {
    await preloadFiles(context.files)
  }

  // Determine which engines to run
  const enabledEngines = Object.entries(ENGINE_REGISTRY).filter(
    ([name]) => context.config.engines[name as EngineName] !== false,
  );

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
        result.elapsed = performance.now() - start;
        callbacks?.onEngineComplete?.(result);
        completed++;
        callbacks?.onProgress?.(completed, enabledEngines.length);
        return result;
      } catch (error) {
        const result: EngineResult = {
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
  const allDiagnostics = applyRuleSeverities(rawDiagnostics, context.config.rules || {})

  // Propagate adjusted diagnostics back into engine results
  for (const r of results) {
    r.diagnostics = allDiagnostics.filter((d) => d.engine === r.engine)
  }

  const bySeverity: Record<Severity, number> = { error: 0, warning: 0, info: 0, suggestion: 0 };
  const byEngine: Record<EngineName, number> = {} as Record<EngineName, number>;
  const categoryScores: Record<Category, number> = {} as Record<Category, number>;

  for (const d of allDiagnostics) {
    bySeverity[d.severity]++;
    byEngine[d.engine] = (byEngine[d.engine] ?? 0) + 1;
  }

  // Calculate score: density-aware logarithmic scoring
  const fileCount = context.files?.length ?? 0
  const scoringResult = calculateScore(allDiagnostics, fileCount)
  const score = scoringResult.score

  const scanResult: ScanResult = {
    engines: results,
    score,
    categoryScores,
    totalDiagnostics: allDiagnostics.length,
    bySeverity,
    byEngine,
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
