// ── Import Intelligence Engine ─────────────────────────────────────────
// Deep analysis of import statements: alternatives, barrels, aliases,
// circular deps, classification, unused detection, and duplicate merging.
// Far beyond aislop's simple "unused / hallucinated" detection.

import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative, resolve, dirname, extname, basename } from "node:path";
import type {
  Diagnostic,
  Engine,
  EngineContext,
  EngineResult,
  Suggestion,
  Severity,
} from "../../types/index.js";
import { readFileContent, extractImports, toLines, type ImportInfo } from "../../utils/file-utils.js";
import { collectFiles } from "../../utils/discover.js";

// ── Constants ─────────────────────────────────────────────────────────

/** Packages known to support deep / tree-shakeable imports */
const TREE_SHAKEABLE_PACKAGES: Record<string, string> = {
  lodash: "lodash/{symbol}",
  "lodash-es": "lodash-es/{symbol}",
  ramda: "ramda/src/{symbol}",
  underscore: "underscore/cjs/{symbol}",
  rxjs: "rxjs/{symbol}",
  d3: "d3-{symbol}",        // d3 is a mono-repo: d3-scale, d3-array, etc.
  "date-fns": "date-fns/{symbol}",  // already tree-shakeable but still worth flagging named
};

/** Side-effect-only import pattern (no bindings) */
const SIDE_EFFECT_RE = /^import\s+['"][^'"]+['"];?\s*$/;

/** Named-import extraction: `import { A, B as C, ... } from ...` */
const NAMED_IMPORTS_RE = /import\s+(?:type\s+)?\{([^}]+)\}/;

/** Default-import extraction: `import X from ...` (no braces) */
const DEFAULT_IMPORT_RE = /^import\s+(?:type\s+)?(\w+)\s+from\s+['"]/;

/** Namespace import: `import * as X from ...` */
const NAMESPACE_IMPORT_RE = /^import\s+\*\s+as\s+(\w+)\s+from\s+['"]/;

/** React version threshold for automatic JSX runtime */
const REACT_AUTOMATIC_JSX_VERSION = 17;

/** Drizzle ORM symbols that are commonly flagged as unused (false positives) */
const DRIZZLE_FP_SYMBOLS = new Set([
  "sql", "count", "desc", "and", "inArray", "eq", "ne", "gt", "gte",
  "lt", "lte", "like", "ilike", "not", "or", "between", "exists",
  "notInArray", "isNull", "isNotNull",
]);

/** Packages that are Drizzle ORM */
const DRIZZLE_PACKAGES = new Set([
  "drizzle-orm", "drizzle-orm/sqlite-core", "drizzle-orm/pg-core",
  "drizzle-orm/mysql-core", "drizzle-orm/sqlite-singlestore-core",
]);

// ── Internal types ────────────────────────────────────────────────────

interface ParsedImport extends ImportInfo {
  symbols: string[];       // extracted identifiers
  isSideEffect: boolean;   // `import 'foo'`
  isNamespace: boolean;    // `import * as X`
  namespaceAlias: string;  // the `X` in `import * as X`
}

interface BarrelFile {
  filePath: string;
  reExports: { source: string; symbols: string[]; isWildcard: boolean }[];
}

interface TsConfigPaths {
  [alias: string]: string[];
}

interface ImportGraph {
  /** adjacency list: filePath → Set of imported module paths */
  adjacency: Map<string, Set<string>>;
  /** reverse mapping: module → files that import it */
  reverse: Map<string, Set<string>>;
}

// ── Helpers ───────────────────────────────────────────────────────────

/** Make a Diagnostic with sensible defaults */
function diag(
  filePath: string,
  rule: string,
  severity: Severity,
  message: string,
  line: number,
  help: string,
  opts: Partial<Pick<Diagnostic, "suggestion" | "detail" | "fixable" | "column">> = {},
): Diagnostic {
  return {
    filePath,
    engine: "import-intelligence",
    rule,
    severity,
    message,
    help,
    line,
    column: opts.column ?? 1,
    category: "imports",
    fixable: opts.fixable ?? false,
    suggestion: opts.suggestion,
    detail: opts.detail,
  };
}

/** Parse an import line into richer ParsedImport */
function parseImport(imp: ImportInfo): ParsedImport {
  const raw = imp.raw.trim();
  const isSideEffect = SIDE_EFFECT_RE.test(raw);

  // Extract named symbols
  let symbols: string[] = [];
  const namedMatch = raw.match(NAMED_IMPORTS_RE);
  if (namedMatch) {
    symbols = namedMatch[1]
      .split(",")
      .map((s) => {
        const trimmed = s.trim();
        // Handle `B as C` — track the local name `C`
        const asMatch = trimmed.match(/^(\w+)\s+as\s+(\w+)$/);
        return asMatch ? asMatch[2] : trimmed;
      })
      .filter(Boolean);
  }

  // Default import
  const defaultMatch = raw.match(DEFAULT_IMPORT_RE);
  if (defaultMatch && !raw.includes("{")) {
    symbols.push(defaultMatch[1]);
  }

  // Namespace import
  let isNamespace = false;
  let namespaceAlias = "";
  const nsMatch = raw.match(NAMESPACE_IMPORT_RE);
  if (nsMatch) {
    isNamespace = true;
    namespaceAlias = nsMatch[1];
    symbols.push(nsMatch[1]);
  }

  return {
    ...imp,
    symbols,
    isSideEffect,
    isNamespace,
    namespaceAlias,
  };
}

/** Check if a symbol is used in the file body (text after the import block) */
function isSymbolUsed(symbol: string, bodyAfterImports: string): boolean {
  // Word-boundary check to avoid substring matches
  // Matches: standalone use, property access prefix, or as type annotation
  const re = new RegExp(`\\b${escapeRegex(symbol)}\\b`);
  return re.test(bodyAfterImports);
}

/** Escape special regex characters */
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Read and parse package.json */
async function readPackageJson(rootDir: string): Promise<Record<string, string> | null> {
  try {
    const content = await readFileContent(join(rootDir, "package.json"));
    const pkg = JSON.parse(content);
    return { ...pkg.dependencies, ...pkg.devDependencies, ...pkg.peerDependencies };
  } catch {
    return null;
  }
}

/** Read and parse tsconfig.json for paths and compilerOptions */
async function readTsConfig(rootDir: string): Promise<{
  paths?: TsConfigPaths;
  baseUrl?: string;
  jsx?: string;
  jsxImportSource?: string;
}> {
  try {
    const content = await readFileContent(join(rootDir, "tsconfig.json"));
    const tsconfig = JSON.parse(content);
    const co = tsconfig.compilerOptions ?? {};
    return {
      paths: co.paths,
      baseUrl: co.baseUrl,
      jsx: co.jsx,
      jsxImportSource: co.jsxImportSource,
    };
  } catch {
    return {};
  }
}

/** Check whether a file path exists */
async function fileExists(p: string): Promise<boolean> {
  try {
    const s = await stat(p);
    return s.isFile();
  } catch {
    return false;
  }
}

/** Check whether a directory exists */
async function dirExists(p: string): Promise<boolean> {
  try {
    const s = await stat(p);
    return s.isDirectory();
  } catch {
    return false;
  }
}

/** Try to resolve a module specifier relative to a file */
async function resolveModulePath(
  source: string,
  fromFile: string,
  rootDir: string,
): Promise<string | null> {
  // Absolute or relative path
  if (source.startsWith(".") || source.startsWith("/")) {
    const baseDir = dirname(fromFile);
    for (const ext of ["", ".ts", ".tsx", ".js", ".jsx", "/index.ts", "/index.tsx", "/index.js"]) {
      const candidate = resolve(baseDir, source + ext);
      if (await fileExists(candidate)) return candidate;
    }
    // Check if it's a directory with index
    const dirCandidate = resolve(baseDir, source);
    if (await dirExists(dirCandidate)) {
      for (const idx of ["index.ts", "index.tsx", "index.js"]) {
        if (await fileExists(join(dirCandidate, idx))) return join(dirCandidate, idx);
      }
    }
    return null;
  }

  // node_modules — just check existence
  const nodeModulesPath = join(rootDir, "node_modules", source);
  if (await dirExists(nodeModulesPath)) return nodeModulesPath;
  // Check with extensions
  for (const ext of [".ts", ".tsx", ".js", ".jsx"]) {
    if (await fileExists(nodeModulesPath + ext)) return nodeModulesPath + ext;
  }
  return null;
}

/** Resolve a tsconfig path alias to a real path */
function resolveAliasPath(
  source: string,
  paths: TsConfigPaths,
  baseUrl: string,
  rootDir: string,
): { alias: string; resolvedPattern: string } | null {
  // Sort aliases longest-first so more specific matches win
  const sortedAliases = Object.keys(paths).sort((a, b) => b.length - a.length);

  for (const alias of sortedAliases) {
    // alias pattern like "@/*" — we convert to regex
    const aliasRegexStr = "^" + escapeRegex(alias).replace(/\\\*/g, "(.*)") + "$";
    const match = source.match(new RegExp(aliasRegexStr));
    if (match) {
      // Substitute the wildcard into the target pattern
      const targetPattern = paths[alias][0]; // take first target
      const resolved = targetPattern.replace(/\*/g, match[1]);
      const fullResolved = resolve(rootDir, baseUrl ?? ".", resolved);
      return { alias, resolvedPattern: fullResolved };
    }
  }
  return null;
}

// ── Feature 1: Alternative Import Suggestions ─────────────────────────

function checkAlternativeImports(
  parsed: ParsedImport,
  filePath: string,
  dependencies: Record<string, string> | null,
  frameworks: string[],
  isReactAutoJsx: boolean,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  // Tree-shakeable package suggestions
  const pkgName = parsed.source.startsWith("@")
    ? parsed.source.split("/").slice(0, 2).join("/")  // scoped package
    : parsed.source.split("/")[0];                       // unscoped

  const template = TREE_SHAKEABLE_PACKAGES[pkgName];
  if (template && parsed.symbols.length > 0 && !parsed.isNamespace) {
    const alternatives = parsed.symbols.map((sym) => {
      const altPath = template.replace("{symbol}", sym);
      return `import ${sym} from '${altPath}'`;
    });

    diagnostics.push(
      diag(filePath, "import-intelligence/tree-shakeable", "suggestion",
        `Tree-shakeable alternative available for '${pkgName}' import`,
        parsed.line,
        `Replace with deep imports so bundlers can eliminate unused code.`,
        {
          fixable: true,
          suggestion: {
            type: "replace",
            text: alternatives.join("\n"),
            range: {
              startLine: parsed.line,
              startCol: 1,
              endLine: parsed.line,
              endCol: parsed.raw.length + 1,
            },
            confidence: 0.85,
            reason: `Deep imports from '${pkgName}' allow bundlers to tree-shake unused modules, reducing bundle size significantly. Named imports from the barrel pull in the entire package.`,
          },
        },
      ),
    );
  }

  // React automatic JSX runtime check
  if (isReactAutoJsx && parsed.source === "react") {
    // `import React from 'react'` is unnecessary with automatic JSX runtime
    if (parsed.isDefault && parsed.symbols.length === 1 && parsed.symbols[0] === "React") {
      diagnostics.push(
        diag(filePath, "import-intelligence/react-auto-jsx", "suggestion",
          `Default React import is unnecessary with automatic JSX runtime`,
          parsed.line,
          `Remove the default React import or switch to named imports (hooks, etc.) if you use them.`,
          {
            fixable: true,
            suggestion: {
              type: "delete",
              text: "",
              range: {
                startLine: parsed.line,
                startCol: 1,
                endLine: parsed.line,
                endCol: parsed.raw.length + 1,
              },
              confidence: 0.8,
              reason: `With React ${REACT_AUTOMATIC_JSX_VERSION}+ automatic JSX runtime (jsx: 'react-jsx' in tsconfig), 'import React' is not needed for JSX transforms. Removing it reduces unused imports.`,
            },
          },
        ),
      );
    }

    // `import React, { useState } from 'react'` — suggest removing default
    if (parsed.isDefault && parsed.symbols.length > 1 && parsed.symbols.includes("React")) {
      const namedSymbols = parsed.symbols.filter((s) => s !== "React");
      const replacement = `import { ${namedSymbols.join(", ")} } from 'react'`;
      diagnostics.push(
        diag(filePath, "import-intelligence/react-auto-jsx-named", "suggestion",
          `Default React import is unnecessary with automatic JSX runtime; keep named imports only`,
          parsed.line,
          `Remove the default React import and keep only the named hooks/utilities.`,
          {
            fixable: true,
            suggestion: {
              type: "replace",
              text: replacement,
              range: {
                startLine: parsed.line,
                startCol: 1,
                endLine: parsed.line,
                endCol: parsed.raw.length + 1,
              },
              confidence: 0.8,
              reason: `With automatic JSX runtime, the default 'React' import is unused. Keeping only named imports is cleaner and avoids pulling in the full React object.`,
            },
          },
        ),
      );
    }
  }

  return diagnostics;
}

// ── Feature 2: Barrel File Optimization ───────────────────────────────

/** Detect barrel files (index.ts that only re-export) */
function detectBarrelFile(content: string): BarrelFile | null {
  const lines = toLines(content);
  const reExports: BarrelFile["reExports"] = [];
  let hasNonExportCode = false;

  for (const { text } of lines) {
    const trimmed = text.trim();
    if (trimmed === "" || trimmed.startsWith("//") || trimmed.startsWith("/*")) continue;

    // `export { X } from './module'`
    const namedExport = trimmed.match(/^export\s+\{([^}]+)\}\s+from\s+['"]([^'"]+)['"];?/);
    if (namedExport) {
      const symbols = namedExport[1].split(",").map((s) => s.trim()).filter(Boolean);
      reExports.push({ source: namedExport[2], symbols, isWildcard: false });
      continue;
    }

    // `export * from './module'`
    const wildcardExport = trimmed.match(/^export\s+\*\s+from\s+['"]([^'"]+)['"];?/);
    if (wildcardExport) {
      reExports.push({ source: wildcardExport[1], symbols: [], isWildcard: true });
      continue;
    }

    // `export type { X } from './module'` — also barrel behavior
    const typeExport = trimmed.match(/^export\s+type\s+\{([^}]+)\}\s+from\s+['"]([^'"]+)['"];?/);
    if (typeExport) {
      const symbols = typeExport[1].split(",").map((s) => s.trim()).filter(Boolean);
      reExports.push({ source: typeExport[2], symbols, isWildcard: false });
      continue;
    }

    // `export { X, Y }` (re-exporting from earlier import) — still barrel-ish
    const localExport = trimmed.match(/^export\s+\{([^}]+)\};?/);
    if (localExport) {
      // These could be re-exports of locally imported things; still barrel-ish
      const symbols = localExport[1].split(",").map((s) => s.trim()).filter(Boolean);
      reExports.push({ source: ".", symbols, isWildcard: false });
      continue;
    }

    // Any other code means it's NOT a pure barrel file
    hasNonExportCode = true;
    break;
  }

  if (reExports.length > 0 && !hasNonExportCode) {
    return { filePath: "", reExports };
  }
  return null;
}

function checkBarrelOptimization(
  parsed: ParsedImport,
  filePath: string,
  barrelCache: Map<string, BarrelFile>,
  rootDir: string,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  // Only check relative imports (skip node_modules)
  if (!parsed.source.startsWith(".")) return diagnostics;

  // Check if the import target is a known barrel file
  const barrelKey = parsed.source;
  const barrel = barrelCache.get(barrelKey);
  if (!barrel) return diagnostics;

  // Build suggestion: map imported symbols to their original source modules
  const symbolToSource = new Map<string, string>();
  for (const reExport of barrel.reExports) {
    if (reExport.isWildcard) {
      // Can't easily trace wildcard re-exports — skip
      continue;
    }
    for (const sym of reExport.symbols) {
      // Handle `X as Y` in re-export
      const localName = sym.includes(" as ") ? sym.split(" as ")[1].trim() : sym;
      const originalName = sym.includes(" as ") ? sym.split(" as ")[0].trim() : sym;
      symbolToSource.set(localName, reExport.source);
    }
  }

  // Generate direct import suggestions
  const sourceGroups = new Map<string, string[]>();
  for (const sym of parsed.symbols) {
    const source = symbolToSource.get(sym);
    if (source && source !== ".") {
      if (!sourceGroups.has(source)) sourceGroups.set(source, []);
      sourceGroups.get(source)!.push(sym);
    }
  }

  if (sourceGroups.size > 0) {
    const replacementLines: string[] = [];
    for (const [source, symbols] of sourceGroups) {
      replacementLines.push(`import { ${symbols.join(", ")} } from '${source}'`);
    }

    diagnostics.push(
      diag(filePath, "import-intelligence/barrel-bypass", "suggestion",
        `Import directly from source instead of barrel file '${parsed.source}'`,
        parsed.line,
        `Direct imports avoid the barrel file indirection, improving tree-shaking and build speed.`,
        {
          fixable: true,
          suggestion: {
            type: "replace",
            text: replacementLines.join("\n"),
            range: {
              startLine: parsed.line,
              startCol: 1,
              endLine: parsed.line,
              endCol: parsed.raw.length + 1,
            },
            confidence: 0.7,
            reason: `Barrel files (index.ts re-exporting from sub-modules) prevent bundlers from tree-shaking effectively. Importing from the source module directly allows the bundler to only include what you actually use, and reduces module resolution overhead during builds.`,
          },
        },
      ),
    );
  }

  return diagnostics;
}

// ── Feature 3: Alias Resolution ───────────────────────────────────────

async function checkAliasResolution(
  parsed: ParsedImport,
  filePath: string,
  paths: TsConfigPaths | undefined,
  baseUrl: string | undefined,
  rootDir: string,
): Promise<Diagnostic[]> {
  const diagnostics: Diagnostic[] = [];
  if (!paths || Object.keys(paths).length === 0) return diagnostics;

  // Check if this import uses an alias
  const aliasResult = resolveAliasPath(parsed.source, paths, baseUrl ?? ".", rootDir);
  if (!aliasResult) return diagnostics;

  // Verify the resolved path actually exists
  const resolvedPath = aliasResult.resolvedPattern;
  let found = false;
  for (const ext of ["", ".ts", ".tsx", ".js", ".jsx", "/index.ts", "/index.tsx", "/index.js"]) {
    if (await fileExists(resolvedPath + ext)) {
      found = true;
      break;
    }
  }

  if (!found) {
    diagnostics.push(
      diag(filePath, "import-intelligence/broken-alias", "error",
        `Alias '${aliasResult.alias}' resolves to '${resolvedPath}' which does not exist`,
        parsed.line,
        `Fix the tsconfig paths mapping or the import path.`,
        {
          fixable: false,
          suggestion: {
            type: "replace",
            text: `/* TODO: fix alias — ${parsed.source} resolves to non-existent ${resolvedPath} */`,
            confidence: 0.9,
            reason: `The tsconfig paths alias '${aliasResult.alias}' maps to '${resolvedPath}', but no file exists at that location. This will cause a TypeScript compilation error or runtime module-not-found.`,
          },
          detail: {
            alias: aliasResult.alias,
            resolvedPath,
            originalImport: parsed.source,
          },
        },
      ),
    );
  } else {
    // Suggest canonical relative path for clarity (info level)
    const relPath = relative(dirname(filePath), resolvedPath);
    const canonicalPath = relPath.startsWith(".") ? relPath : "./" + relPath;
    // Only suggest if the canonical path is significantly different
    if (parsed.source !== canonicalPath && !parsed.source.startsWith(".")) {
      diagnostics.push(
        diag(filePath, "import-intelligence/alias-canonical", "info",
          `Alias '${parsed.source}' resolves to '${canonicalPath}'`,
          parsed.line,
          `Consider using the relative path for explicitness in small projects, or keep the alias for large monorepos.`,
          {
            suggestion: {
              type: "replace",
              text: `from '${canonicalPath}'`,
              confidence: 0.5,
              reason: `Using the resolved relative path makes the dependency graph explicit without relying on tsconfig alias resolution, but aliases are often preferred for readability in large codebases.`,
            },
          },
        ),
      );
    }
  }

  return diagnostics;
}

// ── Feature 4: Import Graph & Circular Dependency Detection ────────────

function buildImportGraph(
  fileImports: Map<string, ParsedImport[]>,
  rootDir: string,
): ImportGraph {
  const adjacency = new Map<string, Set<string>>();
  const reverse = new Map<string, Set<string>>();

  for (const [filePath, imports] of fileImports) {
    const deps = new Set<string>();
    for (const imp of imports) {
      // Only track relative imports for circular detection (skip node_modules)
      if (imp.source.startsWith(".")) {
        // Resolve to a best-effort path (we'll normalize later)
        const resolved = resolve(dirname(filePath), imp.source);
        deps.add(resolved);
      }
    }
    adjacency.set(filePath, deps);
    // Build reverse graph
    for (const dep of deps) {
      if (!reverse.has(dep)) reverse.set(dep, new Set());
      reverse.get(dep)!.add(filePath);
    }
  }

  return { adjacency, reverse };
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

    // Only recurse up to maxDepth to avoid infinite exploration
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

function reportCycles(
  cycles: { cycle: string[]; depth: number }[],
  rootDir: string,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  for (const { cycle, depth } of cycles) {
    // Format the cycle chain with relative paths
    const chain = cycle.map((p) => relative(rootDir, p) || p).join(" → ");
    const involvedFiles = cycle.slice(0, -1); // exclude the repeated closer

    // Report on the first file in the cycle
    const firstFile = involvedFiles[0] ?? "";
    const relFirst = relative(rootDir, firstFile) || firstFile;

    diagnostics.push(
      diag(relFirst, "import-intelligence/circular-dependency", "warning",
        `Circular dependency detected: ${chain}`,
        1, // file-level diagnostic
        `Break the cycle by extracting shared logic into a separate module that both files can import without creating a loop.`,
        {
          fixable: false,
          detail: {
            cycle: involvedFiles.map((p) => relative(rootDir, p)),
            depth,
          },
          suggestion: {
            type: "refactor",
            text: `/* Circular: ${chain} — extract shared code to break the cycle */`,
            confidence: 0.95,
            reason: `Circular dependencies create fragile coupling, can cause initialization order bugs, and make the module graph harder to reason about. Extracting the shared dependency into a third module breaks the cycle cleanly.`,
          },
        },
      ),
    );
  }

  return diagnostics;
}

// ── Feature 5: Smart Import Classification ────────────────────────────

function checkImportClassification(
  parsed: ParsedImport,
  filePath: string,
  fileContent: string,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  // Side-effect imports
  if (parsed.isSideEffect) {
    diagnostics.push(
      diag(filePath, "import-intelligence/side-effect-import", "info",
        `Side-effect import: '${parsed.source}' (no bindings imported)`,
        parsed.line,
        `Ensure this import is needed for its side effects (polyfills, CSS, etc.). Remove if unnecessary.`,
        {
          suggestion: {
            type: "delete",
            text: "",
            confidence: 0.3,
            reason: `Side-effect imports ('import foo') load a module for its side effects only. This is correct for polyfills, CSS, and global setup, but can be an accidental leftover if the module was expected to provide bindings.`,
          },
        },
      ),
    );
    return diagnostics;
  }

  // Dynamic imports — only flag if there are multiple dynamic imports from same source
  // (single dynamic import is normal code splitting, not worth reporting)
  // Skip this check — dynamic imports are intentional, not a smell
  if (parsed.isDynamic) {
    // Don't report individual dynamic imports — they're intentional code splitting
    return diagnostics;
  }

  // Type-only import suggestion: if ALL symbols from this import are only used
  // as types (not in value positions), suggest `import type`
  if (!parsed.isTypeOnly && parsed.symbols.length > 0) {
    const bodyAfterImports = getBodyAfterImports(fileContent, parsed.line);
    const allTypeUsage = parsed.symbols.every((sym) => {
      // A symbol is type-only if it only appears in type positions
      return isTypeOnlyUsage(sym, bodyAfterImports);
    });

    if (allTypeUsage) {
      const replacement = parsed.raw
        .replace(/^import\s+/, "import type ")
        .replace(/^import\s+type\s+type\s+/, "import type "); // guard double-type

      diagnostics.push(
        diag(filePath, "import-intelligence/type-only-import", "suggestion",
          `All imported symbols from '${parsed.source}' are used only as types — use 'import type'`,
          parsed.line,
          `Switch to 'import type' for better tree-shaking and to make intent explicit.`,
          {
            fixable: true,
            suggestion: {
              type: "replace",
              text: replacement,
              range: {
                startLine: parsed.line,
                startCol: 1,
                endLine: parsed.line,
                endCol: parsed.raw.length + 1,
              },
              confidence: 0.75,
              reason: `Using 'import type' makes it explicit that the import is type-only, allowing TypeScript compilers and bundlers to erase it at build time. This reduces runtime bundle size and clarifies the module's role.`,
            },
          },
        ),
      );
    }
  }

  return diagnostics;
}

/** Get the file content after the last import line */
function getBodyAfterImports(content: string, lastImportLine: number): string {
  const lines = content.split("\n");
  return lines.slice(lastImportLine).join("\n");
}

/** Heuristic: check if a symbol is used only in type positions */
function isTypeOnlyUsage(symbol: string, body: string): boolean {
  // Look for value-position uses of the symbol
  // Type positions: after `:`, in `as`, in `extends`, in `implements`,
  // in generic `<...>`, in `interface`, in `type ... =`

  // Simple heuristic: remove all type-position occurrences and see if
  // the symbol still appears
  let stripped = body;

  // Remove type annotations: `: Symbol`, `: Symbol | Other`
  stripped = stripped.replace(/:\s*[A-Z]\w*(?:\s*[&|]\s*[A-Z]\w*)*/g, "");

  // Remove generic type params: `<Symbol>`, `<Symbol, Other>`
  stripped = stripped.replace(/<[^>]*>/g, "");

  // Remove `as Symbol` casts
  stripped = stripped.replace(/\bas\s+[A-Z]\w*/g, "");

  // Remove `extends Symbol` / `implements Symbol`
  stripped = stripped.replace(/\b(?:extends|implements)\s+[A-Z]\w*/g, "");

  // Remove `type X = Symbol` declarations
  stripped = stripped.replace(/\btype\s+\w+\s*=\s*[A-Z]\w*/g, "");

  // Remove `interface X extends Symbol`
  stripped = stripped.replace(/\binterface\s+\w+[^{]*/g, "");

  // If the symbol no longer appears, it's type-only
  return !new RegExp(`\\b${escapeRegex(symbol)}\\b`).test(stripped);
}

// ── Feature 6: Unused Import Detection ─────────────────────────────────

function checkUnusedImports(
  parsed: ParsedImport,
  filePath: string,
  fileContent: string,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  // Skip side-effect, namespace, and dynamic imports
  if (parsed.isSideEffect || parsed.isNamespace || parsed.isDynamic) return diagnostics;

  const bodyAfterImports = getBodyAfterImports(fileContent, parsed.line);
  const unusedSymbols: string[] = [];

  for (const sym of parsed.symbols) {
    // Skip Drizzle ORM false positives
    if (DRIZZLE_FP_SYMBOLS.has(sym) && DRIZZLE_PACKAGES.has(parsed.source.split("/").slice(0, 2).join("/"))) {
      continue;
    }

    if (!isSymbolUsed(sym, bodyAfterImports)) {
      unusedSymbols.push(sym);
    }
  }

  if (unusedSymbols.length > 0 && unusedSymbols.length < parsed.symbols.length) {
    // Some but not all symbols are unused
    const usedSymbols = parsed.symbols.filter((s) => !unusedSymbols.includes(s));
    const replacement = parsed.raw
      .replace(/\{[^}]+\}/, `{ ${usedSymbols.join(", ")} }`);

    diagnostics.push(
      diag(filePath, "import-intelligence/unused-symbol", "warning",
        `Unused imported symbols: ${unusedSymbols.join(", ")}`,
        parsed.line,
        `Remove unused symbols from the import to keep the codebase clean.`,
        {
          fixable: true,
          suggestion: {
            type: "replace",
            text: replacement,
            range: {
              startLine: parsed.line,
              startCol: 1,
              endLine: parsed.line,
              endCol: parsed.raw.length + 1,
            },
            confidence: 0.9,
            reason: `Unused imported symbols add noise and may cause bundlers to include dead code. Removing them clarifies what the module actually depends on.`,
          },
        },
      ),
    );
  } else if (unusedSymbols.length === parsed.symbols.length) {
    // ALL symbols are unused — suggest removing the entire import line
    // But skip for Drizzle ORM
    const isDrizzle = DRIZZLE_PACKAGES.has(parsed.source.split("/").slice(0, 2).join("/"));
    const allDrizzleFPs = parsed.symbols.every((s) => DRIZZLE_FP_SYMBOLS.has(s));

    if (isDrizzle && allDrizzleFPs) {
      // Skip — Drizzle false positive
      return diagnostics;
    }

    diagnostics.push(
      diag(filePath, "import-intelligence/unused-import", "warning",
        `Entire import from '${parsed.source}' is unused`,
        parsed.line,
        `Remove the unused import line entirely.`,
        {
          fixable: true,
          suggestion: {
            type: "delete",
            text: "",
            range: {
              startLine: parsed.line,
              startCol: 1,
              endLine: parsed.line,
              endCol: parsed.raw.length + 1,
            },
            confidence: 0.85,
            reason: `This import is never used in the file. Removing it reduces bundle size and avoids misleading readers about the module's dependencies.`,
          },
        },
      ),
    );
  }

  return diagnostics;
}

// ── Feature 7: Duplicate Import Merge ──────────────────────────────────

function checkDuplicateImports(
  allImports: ParsedImport[],
  filePath: string,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  // Group by source module
  const bySource = new Map<string, ParsedImport[]>();
  for (const imp of allImports) {
    const key = imp.source;
    if (!bySource.has(key)) bySource.set(key, []);
    bySource.get(key)!.push(imp);
  }

  for (const [source, imports] of bySource) {
    if (imports.length < 2) continue;

    // Merge: combine all symbols and suggest a single import
    const allSymbols: string[] = [];
    const hasDefault = imports.some((imp) => imp.isDefault);
    const defaultImport = hasDefault ? imports.find((imp) => imp.isDefault) : undefined;
    const defaultSymbol = defaultImport
      ? defaultImport.symbols.find((s) => !imports.find((imp2) => imp2 !== defaultImport && imp2.symbols.includes(s) && !imp2.isDefault))
      : null;

    for (const imp of imports) {
      for (const sym of imp.symbols) {
        if (!allSymbols.includes(sym)) {
          allSymbols.push(sym);
        }
      }
    }

    // Build merged import
    let merged: string;
    const namedSymbols = allSymbols.filter((s) => {
      // Filter out the default import symbol from named section
      if (hasDefault) {
        const defImp = imports.find((imp) => imp.isDefault);
        if (defImp && defImp.symbols[0] === s && s !== "React") return false;
      }
      return true;
    });

    if (hasDefault && namedSymbols.length > 0) {
      const defSym = imports.find((imp) => imp.isDefault)!.symbols[0];
      merged = `import ${defSym}, { ${namedSymbols.join(", ")} } from '${source}'`;
    } else if (hasDefault) {
      const defSym = imports.find((imp) => imp.isDefault)!.symbols[0];
      merged = `import ${defSym} from '${source}'`;
    } else {
      merged = `import { ${allSymbols.join(", ")} } from '${source}'`;
    }

    // Report on the first duplicate line
    const firstLine = Math.min(...imports.map((imp) => imp.line));
    diagnostics.push(
      diag(filePath, "import-intelligence/duplicate-import", "suggestion",
        `Multiple import statements from '${source}' — merge into one`,
        firstLine,
        `Combine imports from the same module into a single statement.`,
        {
          fixable: true,
          suggestion: {
            type: "replace",
            text: merged,
            range: {
              startLine: Math.min(...imports.map((imp) => imp.line)),
              startCol: 1,
              endLine: Math.max(...imports.map((imp) => imp.line)),
              endCol: imports.reduce((max, imp) => (imp.line === Math.max(...imports.map((i) => i.line)) ? Math.max(max, imp.raw.length + 1) : max), 0),
            },
            confidence: 0.9,
            reason: `Multiple import statements from the same module are redundant and add visual noise. Merging them into a single line makes the dependency on that module clearer and is the conventional style.`,
          },
          detail: {
            duplicateLines: imports.map((imp) => imp.line),
            mergedImport: merged,
          },
        },
      ),
    );
  }

  return diagnostics;
}

// ── Scan barrel files in the project ───────────────────────────────────

async function scanBarrelFiles(
  rootDir: string,
  files: string[],
): Promise<Map<string, BarrelFile>> {
  const barrels = new Map<string, BarrelFile>();

  // Find all index.ts / index.tsx files
  const indexFiles = files.filter((f) => {
    const base = basename(f);
    return base === "index.ts" || base === "index.tsx" || base === "index.js";
  });

  for (const idxFile of indexFiles) {
    try {
      const content = await readFileContent(idxFile);
      const barrel = detectBarrelFile(content);
      if (barrel) {
        // Key is the relative directory path (what you'd import from)
        const dir = dirname(idxFile);
        const relDir = relative(rootDir, dir);
        barrel.filePath = idxFile;

        // Register both relative path forms
        barrels.set(relDir, barrel);
        barrels.set("./" + relDir, barrel);
        barrels.set(".//" + relDir, barrel);

        // Also register with the basename of the parent directory as a possible import
        // e.g. `import { X } from './utils'` where utils/index.ts is a barrel
        const parentDir = dirname(idxFile);
        const parentRel = relative(rootDir, parentDir);
        barrels.set(parentRel, barrel);
      }
    } catch {
      // skip unreadable files
    }
  }

  return barrels;
}

// ── Main Engine ────────────────────────────────────────────────────────

export const importIntelligenceEngine: Engine = {
  name: "import-intelligence",
  description:
    "Deep import analysis: tree-shakeable alternatives, barrel optimization, " +
    "alias validation, circular dependency detection, import classification, " +
    "unused detection (with Drizzle FP suppression), and duplicate merging.",
  supportedLanguages: ["typescript", "javascript"],

  async run(context: EngineContext): Promise<EngineResult> {
    const startTime = Date.now();
    const diagnostics: Diagnostic[] = [];
    const { rootDirectory, frameworks, config } = context;
    const cfg = config.imports;

    // Collect TS/JS files
    const files = await collectFiles(
      rootDirectory,
      ["typescript", "javascript"],
      config.exclude,
      context.files,
    );

    if (files.length === 0) {
      return {
        engine: "import-intelligence",
        diagnostics: [],
        elapsed: Date.now() - startTime,
        skipped: true,
        skipReason: "No TypeScript or JavaScript files found to scan.",
      };
    }

    // ── Read project metadata ──────────────────────────────────────
    const dependencies = await readPackageJson(rootDirectory);
    const tsconfig = await readTsConfig(rootDirectory);

    // Determine if React automatic JSX runtime is active
    const isReactAutoJsx =
      frameworks.includes("react") || frameworks.includes("next.js")
        ? (() => {
            const reactVersion = dependencies?.["react"] ?? dependencies?.["react-dom"] ?? "0";
            const major = parseInt(reactVersion.replace(/[^0-9]/g, ""), 10) || 0;
            return (
              major >= REACT_AUTOMATIC_JSX_VERSION ||
              tsconfig.jsx === "react-jsx" ||
              tsconfig.jsx === "react-jsxdev"
            );
          })()
        : false;

    // ── Scan barrel files ───────────────────────────────────────────
    let barrelCache = new Map<string, BarrelFile>();
    if (cfg.optimizeBarrels) {
      barrelCache = await scanBarrelFiles(rootDirectory, files);
    }

    // ── Per-file analysis ───────────────────────────────────────────
    const fileImportsMap = new Map<string, ParsedImport[]>();

    for (const filePath of files) {
      const relPath = relative(rootDirectory, filePath);
      let content: string;
      try {
        content = await readFileContent(filePath);
      } catch {
        continue; // skip unreadable files
      }

      const rawImports = extractImports(content, "typescript");
      const parsedImports = rawImports.map(parseImport);
      fileImportsMap.set(filePath, parsedImports);

      for (const parsed of parsedImports) {
        // Feature 1: Alternative import suggestions
        if (cfg.suggestAlternatives) {
          diagnostics.push(
            ...checkAlternativeImports(parsed, relPath, dependencies, frameworks, isReactAutoJsx),
          );
        }

        // Feature 2: Barrel file optimization
        if (cfg.optimizeBarrels) {
          diagnostics.push(
            ...checkBarrelOptimization(parsed, relPath, barrelCache, rootDirectory),
          );
        }

        // Feature 3: Alias resolution
        if (cfg.validateAliases && tsconfig.paths) {
          const aliasDiagnostics = await checkAliasResolution(
            parsed, relPath, tsconfig.paths, tsconfig.baseUrl, rootDirectory,
          );
          diagnostics.push(...aliasDiagnostics);
        }

        // Feature 5: Smart import classification
        diagnostics.push(...checkImportClassification(parsed, relPath, content));

        // Feature 6: Unused import detection
        diagnostics.push(...checkUnusedImports(parsed, relPath, content));
      }

      // Feature 7: Duplicate import merge (per-file)
      diagnostics.push(...checkDuplicateImports(parsedImports, relPath));
    }

    // ── Feature 4: Import graph & circular dependency detection ─────
    if (cfg.buildGraph) {
      const graph = buildImportGraph(fileImportsMap, rootDirectory);
      const cycles = detectCycles(graph, cfg.maxCircularDepth);
      const cycleDiagnostics = reportCycles(cycles, rootDirectory);
      diagnostics.push(...cycleDiagnostics);
    }

    return {
      engine: "import-intelligence",
      diagnostics,
      elapsed: Date.now() - startTime,
      skipped: false,
    };
  },
};
