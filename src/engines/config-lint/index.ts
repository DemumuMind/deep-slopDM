import { readdir, stat } from "node:fs/promises";
import { join, basename } from "node:path";
import type { Engine, EngineContext, EngineResult, Diagnostic } from "../../types/index.js";
import { readFileContent } from "../../utils/file-utils.js";

// ── Helpers ──────────────────────────────────────────────

/** Create a config-lint diagnostic */
function diag(overrides: Partial<Diagnostic> & Pick<Diagnostic, "rule" | "severity" | "message" | "filePath">): Diagnostic {
  return {
    engine: "config-lint" as const,
    category: "config",
    line: 1,
    column: 1,
    fixable: false,
    help: "",
    ...overrides,
  };
}

/** Try to read and parse a JSON file; returns undefined if missing or invalid */
async function readJsonFile<T = Record<string, unknown>>(filePath: string): Promise<T | undefined> {
  try {
    const content = await readFileContent(filePath);
    return JSON.parse(content) as T;
  } catch {
    return undefined;
  }
}

/** Check whether a file exists */
async function fileExists(filePath: string): Promise<boolean> {
  try {
    const s = await stat(filePath);
    return s.isFile();
  } catch {
    return false;
  }
}

/** Find the first file matching a set of candidate names in a directory */
async function findFile(dir: string, candidates: string[]): Promise<string | undefined> {
  for (const name of candidates) {
    const fullPath = join(dir, name);
    if (await fileExists(fullPath)) return fullPath;
  }
  return undefined;
}

/** Find all files matching a glob-like prefix pattern (e.g. ".eslintrc.*") */
async function findFilesWithPrefix(dir: string, prefix: string): Promise<string[]> {
  try {
    const entries = await readdir(dir);
    return entries
      .filter((e) => e.startsWith(prefix))
      .map((e) => join(dir, e));
  } catch {
    return [];
  }
}

/** Find files matching a glob-like suffix pattern (e.g. "eslint.config.*") */
async function findFilesWithName(dir: string, name: string): Promise<string[]> {
  try {
    const entries = await readdir(dir);
    return entries
      .filter((e) => e === name || e.startsWith(name + "."))
      .map((e) => join(dir, e));
  } catch {
    return [];
  }
}

// ── Rule: tsconfig-strict ────────────────────────────────

async function checkTsconfigStrict(root: string): Promise<Diagnostic[]> {
  const diagnostics: Diagnostic[] = [];
  const tsconfigPath = await findFile(root, ["tsconfig.json"]);
  if (!tsconfigPath) return diagnostics;

  const tsconfig = await readJsonFile<{ compilerOptions?: Record<string, unknown>; extends?: string }>(tsconfigPath);
  if (!tsconfig) return diagnostics;

  const co = tsconfig.compilerOptions ?? {};
  const relPath = "tsconfig.json";

  // Check strict flag
  if (co.strict !== true) {
    diagnostics.push(diag({
      filePath: relPath,
      rule: "config-lint/tsconfig-strict",
      severity: "info",
      message: `compilerOptions.strict is not enabled (current: ${JSON.stringify(co.strict) ?? "unset"})`,
      help: 'Set "strict": true in compilerOptions to enable all strict type-checking options.',
      detail: { key: "strict", current: co.strict ?? null, recommended: true },
    }));
  }

  // Individual strict flags — only report if strict is not already true
  if (co.strict !== true) {
    const strictFlags = [
      { key: "noImplicitAny", label: "noImplicitAny" },
      { key: "strictNullChecks", label: "strictNullChecks" },
      { key: "noUncheckedIndexedAccess", label: "noUncheckedIndexedAccess" },
    ];

    for (const { key, label } of strictFlags) {
      if (co[key] !== true) {
        diagnostics.push(diag({
          filePath: relPath,
          rule: "config-lint/tsconfig-strict",
          severity: "info",
          message: `compilerOptions.${label} is not enabled`,
          help: `Set "${label}": true in compilerOptions to catch more type errors at compile time.`,
          detail: { key, current: co[key] ?? null, recommended: true },
        }));
      }
    }
  }

  return diagnostics;
}

// ── Rule: tsconfig-target ─────────────────────────────────

const MODERN_TARGETS = new Set([
  "es2022", "es2023", "esnext",
  "es2024", "es2025",
]);

const OLD_TARGETS = new Set([
  "es3", "es5", "es6", "es2015",
  "es2016", "es2017", "es2018", "es2019", "es2020", "es2021",
]);

async function checkTsconfigTarget(root: string): Promise<Diagnostic[]> {
  const diagnostics: Diagnostic[] = [];
  const tsconfigPath = await findFile(root, ["tsconfig.json"]);
  if (!tsconfigPath) return diagnostics;

  const tsconfig = await readJsonFile<{ compilerOptions?: Record<string, unknown> }>(tsconfigPath);
  if (!tsconfig) return diagnostics;

  const target = (tsconfig.compilerOptions?.target as string | undefined)?.toLowerCase();
  const relPath = "tsconfig.json";

  if (!target) {
    diagnostics.push(diag({
      filePath: relPath,
      rule: "config-lint/tsconfig-target",
      severity: "info",
      message: "compilerOptions.target is not set (defaults to ES3)",
      help: 'Set "target": "ES2022" or later in compilerOptions for modern JavaScript output.',
      detail: { key: "target", current: null, recommended: "ES2022" },
    }));
  } else if (OLD_TARGETS.has(target)) {
    diagnostics.push(diag({
      filePath: relPath,
      rule: "config-lint/tsconfig-target",
      severity: "info",
      message: `compilerOptions.target is set to "${target}", which is outdated`,
      help: `Upgrade "target" to "ES2022" or later for modern JavaScript features and better optimization.`,
      detail: { key: "target", current: target, recommended: "ES2022" },
    }));
  } else if (!MODERN_TARGETS.has(target)) {
    // Target is set but not recognized as modern or old — still info
    diagnostics.push(diag({
      filePath: relPath,
      rule: "config-lint/tsconfig-target",
      severity: "info",
      message: `compilerOptions.target is set to "${target}" — consider using ES2022+ for modern output`,
      help: 'Consider setting "target" to "ES2022" or "ESNext" for modern JavaScript output.',
      detail: { key: "target", current: target, recommended: "ES2022" },
    }));
  }

  return diagnostics;
}

// ── Rule: missing-eslint ──────────────────────────────────

async function checkMissingEslint(root: string): Promise<Diagnostic[]> {
  const pkgJson = await readJsonFile<{ name?: string; dependencies?: Record<string, unknown>; devDependencies?: Record<string, unknown> }>(join(root, "package.json"));

  // Projects that use deep-slop itself as a linter (self-referencing) don't need ESLint
  if (pkgJson && (pkgJson.name === "deep-slop" || pkgJson.dependencies?.["deep-slop"] || pkgJson.devDependencies?.["deep-slop"])) {
    return [];
  }

  // Check for .eslintrc.* files
  const eslintrcFiles = await findFilesWithPrefix(root, ".eslintrc");
  if (eslintrcFiles.length > 0) return [];

  // Check for eslint.config.* (flat config)
  const flatConfigFiles = await findFilesWithName(root, "eslint.config");
  if (flatConfigFiles.length > 0) return [];

  // Check for eslintConfig in package.json
  if (pkgJson && "eslintConfig" in pkgJson) return [];

  // None found — suggest adding ESLint
  return [diag({
    filePath: "package.json",
    rule: "config-lint/missing-eslint",
    severity: "info",
    message: "No ESLint configuration found in the project",
    help: 'Add ESLint for code quality enforcement. Run: npm init @eslint/config@latest or create an eslint.config.js file.',
    detail: { checked: [".eslintrc.*", "eslint.config.*", "package.json#eslintConfig"] },
  })];
}

// ── Rule: package-json-scripts ────────────────────────────

const REQUIRED_SCRIPTS = ["build", "test", "lint"] as const;

async function checkPackageJsonScripts(root: string): Promise<Diagnostic[]> {
  const diagnostics: Diagnostic[] = [];
  const pkgPath = join(root, "package.json");
  const pkgJson = await readJsonFile<{ scripts?: Record<string, string> }>(pkgPath);
  if (!pkgJson) return diagnostics;

  const scripts = pkgJson.scripts ?? {};
  const missing: string[] = [];

  for (const name of REQUIRED_SCRIPTS) {
    if (!scripts[name]) {
      missing.push(name);
    }
  }

  if (missing.length > 0) {
    diagnostics.push(diag({
      filePath: "package.json",
      rule: "config-lint/package-json-scripts",
      severity: "warning",
      message: `Missing recommended scripts in package.json: ${missing.join(", ")}`,
      help: `Add the following scripts to package.json: ${missing.map((s) => `"${s}"`).join(", ")}. Standard scripts improve CI/CD integration and developer experience.`,
      detail: { missing, present: Object.keys(scripts) },
    }));
  }

  return diagnostics;
}

// ── Rule: missing-prettier ─────────────────────────────────

async function checkMissingPrettier(root: string): Promise<Diagnostic[]> {
  // Check for .prettierrc* files
  const prettierrcFiles = await findFilesWithPrefix(root, ".prettierrc");
  if (prettierrcFiles.length > 0) return [];

  // Check for prettier.config.* files
  const prettierConfigFiles = await findFilesWithName(root, "prettier.config");
  if (prettierConfigFiles.length > 0) return [];

  // Check for "prettier" key in package.json
  const pkgJson = await readJsonFile<Record<string, unknown>>(join(root, "package.json"));
  if (pkgJson && "prettier" in pkgJson) return [];

  return [diag({
    filePath: "package.json",
    rule: "config-lint/missing-prettier",
    severity: "info",
    message: "No Prettier configuration found in the project",
    help: 'Add Prettier for consistent code formatting. Run: npm install --save-dev prettier && echo {} > .prettierrc',
    detail: { checked: [".prettierrc.*", "prettier.config.*", "package.json#prettier"] },
  })];
}

// ── Rule: vite-config ─────────────────────────────────────

async function checkViteConfig(root: string): Promise<Diagnostic[]> {
  const diagnostics: Diagnostic[] = [];

  const viteConfigPath = await findFile(root, [
    "vite.config.ts",
    "vite.config.js",
    "vite.config.mts",
    "vite.config.mjs",
  ]);
  if (!viteConfigPath) return diagnostics;

  const relPath = basename(viteConfigPath);
  const content = await readFileContent(viteConfigPath);

  // Check for build.sourcemap
  const hasSourcemap =
    /build\s*:\s*\{[^}]*sourcemap\s*:/s.test(content) ||
    /sourcemap\s*:\s*true/.test(content);

  if (!hasSourcemap) {
    diagnostics.push(diag({
      filePath: relPath,
      rule: "config-lint/vite-config",
      severity: "info",
      message: `Vite config does not enable build.sourcemap`,
      help: 'Add `build: { sourcemap: true }` to your Vite config for better debugging with source maps.',
      detail: { key: "build.sourcemap", current: null, recommended: true },
    }));
  }

  // Check for server.port
  const hasServerPort =
    /server\s*:\s*\{[^}]*port\s*:/s.test(content);

  if (!hasServerPort) {
    diagnostics.push(diag({
      filePath: relPath,
      rule: "config-lint/vite-config",
      severity: "info",
      message: `Vite config does not set server.port`,
      help: 'Add `server: { port: 3000 }` (or your preferred port) to your Vite config for a consistent dev server port.',
      detail: { key: "server.port", current: null, recommended: 3000 },
    }));
  }

  return diagnostics;
}

// ── Rule: next-config ─────────────────────────────────────

async function checkNextConfig(root: string): Promise<Diagnostic[]> {
  const diagnostics: Diagnostic[] = [];

  const nextConfigPath = await findFile(root, [
    "next.config.ts",
    "next.config.js",
    "next.config.mjs",
  ]);
  if (!nextConfigPath) return diagnostics;

  const relPath = basename(nextConfigPath);
  const content = await readFileContent(nextConfigPath);

  // Check for reactStrictMode
  const hasStrictMode =
    /reactStrictMode\s*:\s*true/.test(content);

  if (!hasStrictMode) {
    diagnostics.push(diag({
      filePath: relPath,
      rule: "config-lint/next-config",
      severity: "info",
      message: `Next.js config does not enable reactStrictMode`,
      help: 'Add `reactStrictMode: true` to your Next.js config. This helps identify unsafe lifecycle methods and deprecated patterns.',
      detail: { key: "reactStrictMode", current: false, recommended: true },
    }));
  }

  // Check for poweredByHeader: false
  const hasPoweredByHeaderFalse =
    /poweredByHeader\s*:\s*false/.test(content);

  if (!hasPoweredByHeaderFalse) {
    diagnostics.push(diag({
      filePath: relPath,
      rule: "config-lint/next-config",
      severity: "info",
      message: `Next.js config does not disable X-Powered-By header`,
      help: 'Add `poweredByHeader: false` to your Next.js config to hide the "X-Powered-By: Next.js" response header for security.',
      detail: { key: "poweredByHeader", current: true, recommended: false },
    }));
  }

  return diagnostics;
}

// ── Rule: editorconfig ────────────────────────────────────

async function checkEditorconfig(root: string): Promise<Diagnostic[]> {
  const editorconfigPath = join(root, ".editorconfig");
  if (await fileExists(editorconfigPath)) return [];

  return [diag({
    filePath: ".editorconfig",
    rule: "config-lint/editorconfig",
    severity: "info",
    message: "No .editorconfig file found in the project root",
    help: 'Add an .editorconfig file to enforce consistent coding style (indentation, charset, line endings) across editors and contributors.',
    suggestion: {
      type: "insert",
      text: [
        "root = true",
        "",
        "[*]",
        "indent_style = space",
        "indent_size = 2",
        "end_of_line = lf",
        "charset = utf-8",
        "trim_trailing_whitespace = true",
        "insert_final_newline = true",
        "",
        "[*.md]",
        "trim_trailing_whitespace = false",
      ].join("\n"),
      confidence: 0.9,
      reason: "A standard .editorconfig ensures consistent formatting across all contributors and editors.",
    },
  })];
}

// ── Engine ────────────────────────────────────────────────

export const configLintEngine: Engine = {
  name: "config-lint" as const,
  description:
    "Configuration validation: tsconfig strictness & target, ESLint/Prettier presence, package.json scripts, Vite/Next config checks, editorconfig",
  supportedLanguages: ["typescript", "javascript"],

  async run(context: EngineContext): Promise<EngineResult> {
    const start = performance.now();
    const diagnostics: Diagnostic[] = [];
    const root = context.rootDirectory;

    // Only run if TypeScript or JavaScript is in the detected languages
    const isRelevant =
      context.languages.includes("typescript") ||
      context.languages.includes("javascript");
    if (!isRelevant) {
      return {
        engine: this.name,
        diagnostics: [],
        elapsed: performance.now() - start,
        skipped: true,
        skipReason: "No TypeScript or JavaScript detected in project",
      };
    }

    // Run all checks in parallel for efficiency
    const results = await Promise.all([
      checkTsconfigStrict(root),
      checkTsconfigTarget(root),
      checkMissingEslint(root),
      checkPackageJsonScripts(root),
      checkMissingPrettier(root),
      checkViteConfig(root),
      checkNextConfig(root),
      checkEditorconfig(root),
    ]);

    for (const ruleDiagnostics of results) {
      diagnostics.push(...ruleDiagnostics);
    }

    return {
      engine: this.name,
      diagnostics,
      elapsed: performance.now() - start,
      skipped: false,
    };
  },
};
