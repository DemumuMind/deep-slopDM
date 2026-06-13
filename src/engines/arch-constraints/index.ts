// ── Architecture Constraints Engine ─────────────────────────────────
// Detects structural / architectural issues: high coupling, layer violations,
// god files, circular dependencies, deep nesting, and unstable dependencies.

import { relative, resolve, dirname, extname, basename } from "node:path";
import type {
  Diagnostic,
  Engine,
  EngineContext,
  EngineResult,
  Severity,
  Suggestion,
} from "../../types/index.js";
import { readFileContent, extractImports, toLines, type ImportInfo } from "../../utils/file-utils.js";
import { collectFiles } from "../../utils/discover.js";

// ── Helper ──────────────────────────────────────────────────────────

/** Build a diagnostic with common fields filled */
function diag(opts: {
  filePath: string;
  rule: string;
  severity: Severity;
  message: string;
  help: string;
  line: number;
  column: number;
  fixable: boolean;
  suggestion?: Suggestion;
  detail?: Record<string, unknown>;
}): Diagnostic {
  return {
    filePath: opts.filePath,
    engine: "arch-constraints",
    rule: opts.rule,
    severity: opts.severity,
    message: opts.message,
    help: opts.help,
    line: opts.line,
    column: opts.column,
    category: "architecture",
    fixable: opts.fixable,
    suggestion: opts.suggestion,
    detail: opts.detail,
  };
}

// ── Context-aware threshold multipliers ────────────────────────

interface ThresholdMultiplier {
  fileLocMultiplier: number
  functionLocMultiplier: number
}

/** Determine threshold multipliers based on file extension and naming convention */
function getThresholdMultiplier(filePath: string): ThresholdMultiplier {
  const ext = extname(filePath)
  const name = basename(filePath, ext)

  // .d.ts files: exempt from size checks
  if (filePath.endsWith('.d.ts')) {
    return { fileLocMultiplier: Infinity, functionLocMultiplier: Infinity }
  }

  // Rust files: 2.5x file limit, 1.5x function limit
  if (ext === '.rs') {
    return { fileLocMultiplier: 2.5, functionLocMultiplier: 1.5 }
  }

  // Go files: 1.5x file limit
  if (ext === '.go') {
    return { fileLocMultiplier: 1.5, functionLocMultiplier: 1.0 }
  }

  // TSX/JSX files
  if (ext === '.tsx' || ext === '.jsx') {
    // PascalCase (React components): 1.5x file limit, 2.0x function limit
    if (/^[A-Z][a-zA-Z0-9]+$/.test(name)) {
      return { fileLocMultiplier: 1.5, functionLocMultiplier: 2.0 }
    }
    // Non-component TSX/JSX: 1.5x file limit
    return { fileLocMultiplier: 1.5, functionLocMultiplier: 1.0 }
  }

  // Default: no multiplier
  return { fileLocMultiplier: 1.0, functionLocMultiplier: 1.0 }
}

// ── 1. High Coupling ────────────────────────────────────────────────

/** Count imports per file, flag files exceeding maxCoupling threshold */
function detectHighCoupling(
  imports: ImportInfo[],
  filePath: string,
  maxCoupling: number,
): Diagnostic[] {
  const results: Diagnostic[] = [];
  // Count unique import sources (skip type-only for coupling metric)
  const couplingImports = imports.filter((imp) => !imp.isTypeOnly);
  const uniqueSources = new Set(couplingImports.map((imp) => imp.source));
  const couplingCount = uniqueSources.size;

  if (couplingCount > maxCoupling) {
    // Find the first non-type-only import line for the diagnostic
    const firstImport = couplingImports[0];
    const line = firstImport?.line ?? 1;
    const col = firstImport?.raw
      ? firstImport.raw.indexOf(firstImport.source) + 1
      : 1;

    results.push(
      diag({
        filePath,
        rule: "arch-constraints/high-coupling",
        severity: "warning",
        message: `File has ${couplingCount} imports (max: ${maxCoupling}) — high coupling`,
        help: "Split this file into focused modules with fewer dependencies. Each module should have a single responsibility. Consider extracting related logic into a separate module that this file and others can share.",
        line,
        column: col,
        fixable: false,
        suggestion: {
          type: "refactor",
          text: `/* Split into focused modules — ${couplingCount} imports exceeds threshold of ${maxCoupling} */`,
          confidence: 0.7,
          reason: `Files with many imports are tightly coupled to many other modules, making them hard to test, refactor, and reason about independently. Breaking them into smaller, focused modules reduces coupling and improves maintainability.`,
        },
        detail: {
          couplingCount,
          threshold: maxCoupling,
          sources: [...uniqueSources],
        },
      }),
    );
  }
  return results;
}

// ── 2. Layer Violation ──────────────────────────────────────────────

/** Patterns indicating UI layer */
const UI_PATH_PATTERNS = [
  /\/components?\//i,
  /\/views?\//i,
  /\/pages?\//i,
  /\/ui\//i,
  /\/screens?\//i,
  /\.(tsx|jsx)$/i,
];

/** Patterns indicating data/DB layer */
const DB_IMPORT_PATTERNS = [
  /(?:^|\.\.\/|\.\/)(?:db|database|models?|repositories?|entities?|knex|prisma|drizzle|sequelize|typeorm|mongoose)\//i,
  /\/db\//i,
  /\/lib\/db\//i,
  /\/data\/(?:models?|repositories?|entities?)\//i,
];

/** Patterns indicating API routes */
const API_ROUTE_PATTERNS = [
  /\/api\//i,
  /\/routes?\//i,
  /\/controllers?\//i,
  /\/handlers?\//i,
  /\/endpoints?\//i,
];

/** Patterns indicating service layer */
const SERVICE_IMPORT_PATTERNS = [
  /\/services?\//i,
  /\/use-?cases?\//i,
  /\/business\//i,
  /\/domain\//i,
];

function isUIFile(relPath: string): boolean {
  return UI_PATH_PATTERNS.some((p) => p.test(relPath));
}

function isAPIRoute(relPath: string): boolean {
  return API_ROUTE_PATTERNS.some((p) => p.test(relPath));
}

function isDBImport(source: string): boolean {
  return DB_IMPORT_PATTERNS.some((p) => p.test(source));
}

function isServiceImport(source: string): boolean {
  return SERVICE_IMPORT_PATTERNS.some((p) => p.test(source));
}

function detectLayerViolations(
  imports: ImportInfo[],
  filePath: string,
): Diagnostic[] {
  const results: Diagnostic[] = [];

  // UI files importing from data/DB layer directly
  if (isUIFile(filePath)) {
    for (const imp of imports) {
      if (isDBImport(imp.source)) {
        const col = imp.raw.indexOf(imp.source) + 1;
        results.push(
          diag({
            filePath,
            rule: "arch-constraints/layer-violation",
            severity: "warning",
            message: `UI component imports directly from data layer: '${imp.source}'`,
            help: "UI components should not import from the data layer directly. Introduce a service/hook layer between UI and data. For React, use custom hooks; for Vue, use composables; for Angular, use services.",
            line: imp.line,
            column: col,
            fixable: false,
            suggestion: {
              type: "refactor",
              text: `/* Replace direct DB import '${imp.source}' with a service or hook layer */`,
              confidence: 0.8,
              reason: "Direct data-layer imports in UI components violate separation of concerns and make the UI fragile to data-layer changes. A service layer encapsulates data access and provides a stable API for the UI.",
            },
            detail: {
              violationType: "ui-to-data",
              importSource: imp.source,
            },
          }),
        );
      }
    }
  }

  // API routes importing DB models without going through a service layer
  if (isAPIRoute(filePath)) {
    for (const imp of imports) {
      if (isDBImport(imp.source) && !isServiceImport(imp.source)) {
        const col = imp.raw.indexOf(imp.source) + 1;
        results.push(
          diag({
            filePath,
            rule: "arch-constraints/layer-violation",
            severity: "warning",
            message: `API route imports DB layer directly (bypasses service): '${imp.source}'`,
            help: "API routes should delegate business logic to a service layer rather than importing DB models directly. This ensures consistent business rules, easier testing, and a clean separation between HTTP handling and data access.",
            line: imp.line,
            column: col,
            fixable: false,
            suggestion: {
              type: "refactor",
              text: `/* Route '${imp.source}' through a service layer instead of direct DB import */`,
              confidence: 0.75,
              reason: "Bypassing the service layer in API routes couples HTTP handling to data access, making it hard to change the data layer or reuse business logic. A service layer provides a single source of truth for business rules.",
            },
            detail: {
              violationType: "api-bypasses-service",
              importSource: imp.source,
            },
          }),
        );
      }
    }
  }

  return results;
}

// ── 3. God File ─────────────────────────────────────────────────────

/** Count named exports in a file (export function, export const, export class, etc.) */
function countExports(lines: { num: number; text: string }[]): number {
  let count = 0;
  for (const { text } of lines) {
    const trimmed = text.trim();
    // export function, export const, export class, export interface, export type, export enum
    if (/^export\s+(?:default\s+)?(?:function|const|let|var|class|interface|type|enum)\s+/.test(trimmed)) {
      count++;
    }
    // export { X, Y, Z } — count individual names
    const namedExport = trimmed.match(/^export\s+\{([^}]+)\}/);
    if (namedExport) {
      count += namedExport[1].split(",").filter((s) => s.trim()).length;
    }
    // export default — count as 1
    if (/^export\s+default\s+/.test(trimmed) && !/^export\s+default\s+function/.test(trimmed) && !/^export\s+default\s+class/.test(trimmed)) {
      count++;
    }
  }
  return count;
}

function detectGodFile(
  lineCount: number,
  exportCount: number,
  filePath: string,
  maxFileLoc: number,
): Diagnostic[] {
  const results: Diagnostic[] = [];
  const GOD_EXPORT_THRESHOLD = 5;

  if (lineCount > maxFileLoc && exportCount > GOD_EXPORT_THRESHOLD) {
    results.push(
      diag({
        filePath,
        rule: "arch-constraints/god-file",
        severity: "warning",
        message: `God file: ${lineCount} lines (max: ${maxFileLoc}) with ${exportCount} exports (threshold: ${GOD_EXPORT_THRESHOLD})`,
        help: "Split this file into smaller, focused modules. Files that are both large and export many things violate the Single Responsibility Principle. Each module should do one thing well.",
        line: 1,
        column: 1,
        fixable: false,
        suggestion: {
          type: "refactor",
          text: `/* Split this ${lineCount}-line file with ${exportCount} exports into focused modules */`,
          confidence: 0.8,
          reason: `Files with ${lineCount} lines and ${exportCount} exports are doing too much. Splitting improves readability, testability, and makes it easier for multiple developers to work on the codebase simultaneously.`,
        },
        detail: {
          lineCount,
          exportCount,
          maxFileLoc,
          exportThreshold: GOD_EXPORT_THRESHOLD,
        },
      }),
    );
  }
  return results;
}

// ── 4. Circular Dependency ──────────────────────────────────────────

interface ImportGraph {
  /** adjacency list: filePath → Set of imported module paths */
  adjacency: Map<string, Set<string>>;
}

/** Build import graph from all files (only relative imports) */
function buildImportGraph(
  fileImports: Map<string, ImportInfo[]>,
  rootDir: string,
): ImportGraph {
  const adjacency = new Map<string, Set<string>>();

  for (const [filePath, imports] of fileImports) {
    const deps = new Set<string>();
    for (const imp of imports) {
      // Only track relative imports for circular detection
      if (imp.source.startsWith(".")) {
        // Resolve to a best-effort absolute path
        const resolved = resolve(dirname(filePath), imp.source);
        deps.add(resolved);
      }
    }
    adjacency.set(filePath, deps);
  }

  return { adjacency };
}

/** DFS-based cycle detection with path tracking */
function detectCycles(
  graph: ImportGraph,
  maxDepth: number,
): { cycle: string[]; depth: number }[] {
  const cycles: { cycle: string[]; depth: number }[] = [];
  const visited = new Set<string>();
  const inStack = new Set<string>();
  const stack: string[] = [];

  function dfs(node: string): void {
    if (inStack.has(node)) {
      // Found a cycle — extract it
      const cycleStart = stack.indexOf(node);
      if (cycleStart !== -1) {
        const cyclePath = stack.slice(cycleStart);
        cyclePath.push(node); // close the cycle
        cycles.push({ cycle: cyclePath, depth: cyclePath.length - 1 });
      }
      return;
    }
    if (visited.has(node)) return;

    visited.add(node);
    inStack.add(node);
    stack.push(node);

    // Only recurse up to maxDepth to avoid runaway exploration
    if (stack.length <= maxDepth) {
      const neighbors = graph.adjacency.get(node) ?? new Set();
      for (const neighbor of neighbors) {
        dfs(neighbor);
      }
    }

    stack.pop();
    inStack.delete(node);
  }

  for (const node of graph.adjacency.keys()) {
    dfs(node);
  }

  // Deduplicate cycles (same cycle starting from different nodes)
  const seen = new Set<string>();
  const unique: typeof cycles = [];
  for (const c of cycles) {
    // Normalize: sort the cycle members (excluding the closing repeat) and join
    const key = [...c.cycle.slice(0, -1)].sort().join("→");
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(c);
    }
  }

  return unique;
}

function reportCircularDependencies(
  cycles: { cycle: string[]; depth: number }[],
  rootDir: string,
): Diagnostic[] {
  const results: Diagnostic[] = [];

  for (const { cycle, depth } of cycles) {
    const involvedFiles = cycle.slice(0, -1); // exclude the repeated closer
    const chain = involvedFiles.map((p) => relative(rootDir, p) || p).join(" → ");
    const backToFirst = relative(rootDir, cycle[0]) || cycle[0];
    const fullChain = `${chain} → ${backToFirst}`;

    // Report on the first file in the cycle
    const firstFile = involvedFiles[0] ?? "";
    const relFirst = relative(rootDir, firstFile) || firstFile;

    results.push(
      diag({
        filePath: relFirst,
        rule: "arch-constraints/circular-dependency",
        severity: "error",
        message: `Circular dependency detected: ${fullChain}`,
        help: "Break the cycle by extracting shared logic into a separate module that both files can import without creating a loop. Circular dependencies cause initialization order issues and make the module graph fragile.",
        line: 1,
        column: 1,
        fixable: false,
        suggestion: {
          type: "refactor",
          text: `/* Circular: ${fullChain} — extract shared code to break the cycle */`,
          confidence: 0.95,
          reason: "Circular dependencies create fragile coupling, can cause initialization order bugs, and make the module graph harder to reason about. Extracting the shared dependency into a third module breaks the cycle cleanly.",
        },
        detail: {
          cycle: involvedFiles.map((p) => relative(rootDir, p)),
          depth,
        },
      }),
    );
  }

  return results;
}

// ── 5. Deep Nesting ─────────────────────────────────────────────────

/** Count maximum nesting depth of blocks (if/for/while/try/switch/catch/functions) */
function detectDeepNesting(
  lines: { num: number; text: string }[],
  filePath: string,
  maxNesting: number,
): Diagnostic[] {
  const results: Diagnostic[] = [];
  let currentDepth = 0;
  let maxDepthReached = 0;
  let maxDepthLine = 0;

  for (const { num, text } of lines) {
    const trimmed = text.trim();

    // Skip comment-only and blank lines
    if (trimmed === "" || trimmed.startsWith("//") || trimmed.startsWith("/*") || trimmed.startsWith("*")) {
      continue;
    }

    // Count opening braces that increase nesting
    for (let i = 0; i < trimmed.length; i++) {
      if (trimmed[i] === "{") {
        currentDepth++;
        if (currentDepth > maxDepthReached) {
          maxDepthReached = currentDepth;
          maxDepthLine = num;
        }
      }
      if (trimmed[i] === "}") {
        currentDepth = Math.max(0, currentDepth - 1);
      }
    }
  }

  if (maxDepthReached > maxNesting) {
    results.push(
      diag({
        filePath,
        rule: "arch-constraints/deep-nesting",
        severity: "warning",
        message: `Maximum nesting depth ${maxDepthReached} exceeds threshold of ${maxNesting}`,
        help: "Reduce nesting by using early returns, guard clauses, extracting nested logic into separate functions, or inverting conditions. Deep nesting makes code hard to follow and error-prone to modify.",
        line: maxDepthLine,
        column: 1,
        fixable: false,
        suggestion: {
          type: "refactor",
          text: `/* Reduce nesting depth from ${maxDepthReached} to ≤${maxNesting} using early returns or extracted functions */`,
          confidence: 0.7,
          reason: `Deep nesting (${maxDepthReached} levels) makes code difficult to read and maintain. Early returns (guard clauses) and function extraction flatten the structure and improve readability.`,
        },
        detail: {
          maxDepthReached,
          threshold: maxNesting,
          deepestLine: maxDepthLine,
        },
      }),
    );
  }

  return results;
}

// ── 6. Unstable Dependency ──────────────────────────────────────────

/** Path segments that indicate unstable / work-in-progress code */
const UNSTABLE_PATTERNS = [
  /\binternal\b/i,
  /\bprivate\b/i,
  /\btemp\b/i,
  /\bhack\b/i,
  /\bwip\b/i,
  /\bexperimental\b/i,
  /\bunstable\b/i,
  /\bprototype\b/i,
];

function detectUnstableDependencies(
  imports: ImportInfo[],
  filePath: string,
): Diagnostic[] {
  const results: Diagnostic[] = [];

  for (const imp of imports) {
    // Only check relative imports (bare specifiers like 'internal-pkg' could be legitimate packages)
    if (!imp.source.startsWith(".")) continue;

    for (const pattern of UNSTABLE_PATTERNS) {
      if (pattern.test(imp.source)) {
        const matchLabel = imp.source.match(pattern)?.[0] ?? "unstable";
        const col = imp.raw.indexOf(imp.source) + 1;
        results.push(
          diag({
            filePath,
            rule: "arch-constraints/unstable-dependency",
            severity: "info",
            message: `Import from unstable path: '${imp.source}' (contains '${matchLabel}')`,
            help: `The import path contains '${matchLabel}', which typically indicates work-in-progress, internal, or temporary code. This dependency may change or disappear without notice. Consider depending on a stable, published API instead.`,
            line: imp.line,
            column: col,
            fixable: false,
            suggestion: {
              type: "refactor",
              text: `/* Consider replacing unstable import '${imp.source}' with a stable API */`,
              confidence: 0.6,
              reason: `Paths containing '${matchLabel}' signal provisional code that may be refactored or removed. Depending on it creates fragile coupling to code that isn't guaranteed to remain stable.`,
            },
            detail: {
              importSource: imp.source,
              unstablePattern: matchLabel,
            },
          }),
        );
        // Only report one unstable-pattern diagnostic per import line
        break;
      }
    }
  }

  return results;
}

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
