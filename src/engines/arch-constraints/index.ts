import { relative } from "node:path"
import type {
  Diagnostic,
  Engine,
  EngineContext,
  EngineResult,
} from "../../types/index.js"
import { readFileContent, extractImports, toLines, type ImportInfo } from "../../utils/file-utils.js"
import { collectFiles } from "../../utils/discover.js"
import { getThresholdMultiplier } from "./helpers.js"
import {
  buildImportGraph,
  countExports,
  detectCycles,
  detectDeepNesting,
  detectGodFile,
  detectHighCoupling,
  detectLayerViolations,
  detectUnstableDependencies,
  reportCircularDependencies,
} from "./rules.js"

// ── Engine Definition ────────────────────────────────────────────────

export const archConstraintsEngine: Engine = {
  name: "arch-constraints" as const,
  description:
    "Architecture constraint validation: high coupling, layer violations, god files, " +
    "circular dependencies, deep nesting, and unstable dependencies.",
  supportedLanguages: ["typescript", "javascript"],

  async run(context: EngineContext): Promise<EngineResult> {
    const start = performance.now();
    const { rootDirectory, config } = context;

    // Read thresholds from config
    const maxCoupling = config.quality.maxCoupling;
    const maxFileLoc = config.quality.maxFileLoc;
    const maxNesting = config.quality.maxNesting;

    // Collect TS/JS files
    const files = await collectFiles(
      rootDirectory,
      ["typescript", "javascript"],
      config.exclude,
      context.files,
    );

    if (files.length === 0) {
      return {
        engine: this.name,
        diagnostics: [],
        elapsed: performance.now() - start,
        skipped: true,
        skipReason: "No TypeScript or JavaScript files found to scan.",
      };
    }

    const diagnostics: Diagnostic[] = [];

    // Phase 1: Per-file analysis (high-coupling, layer-violation, god-file, deep-nesting, unstable-dependency)
    const fileImportsMap = new Map<string, ImportInfo[]>();

    for (const absPath of files) {
      const relPath = relative(rootDirectory, absPath);
      let content: string;
      try {
        content = await readFileContent(absPath);
      } catch {
        continue; // skip unreadable files
      }

      const lines = toLines(content);
      const imports = extractImports(content, "typescript");
      fileImportsMap.set(absPath, imports);

      // Apply context-aware threshold multipliers per file
      const multiplier = getThresholdMultiplier(relPath)
      const effectiveFileLoc = Math.round(maxFileLoc * multiplier.fileLocMultiplier)

      // 1. High coupling
      diagnostics.push(...detectHighCoupling(imports, relPath, maxCoupling));

      // 2. Layer violations
      diagnostics.push(...detectLayerViolations(imports, relPath));

      // 3. God file (with context-aware file limit)
      const lineCount = lines.length;
      const exportCount = countExports(lines);
      diagnostics.push(...detectGodFile(lineCount, exportCount, relPath, effectiveFileLoc));

      // 5. Deep nesting
      diagnostics.push(...detectDeepNesting(lines, relPath, maxNesting));

      // 6. Unstable dependency
      diagnostics.push(...detectUnstableDependencies(imports, relPath));
    }

    // Phase 2: Cross-file analysis (circular dependency)
    const graph = buildImportGraph(fileImportsMap, rootDirectory);
    const maxCircularDepth = config.imports.maxCircularDepth;
    const cycles = detectCycles(graph, maxCircularDepth);
    diagnostics.push(...reportCircularDependencies(cycles, rootDirectory));

    return {
      engine: this.name,
      diagnostics,
      elapsed: performance.now() - start,
      skipped: false,
    };
  },
};
