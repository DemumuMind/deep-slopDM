// ── Type-Safety Engine ──────────────────────────────────────────────────────
// Detects type safety issues with CONTEXT-AWARE suggestions.
// This is what separates deep-slop from aislop — we don't just flag,
// we suggest the concrete fix.

import { readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import {
  buildEarlyExitResult,
  EARLY_EXIT_BATCH_SIZE,
  isEngineEarlyExitEnabled,
} from "../../config/engine-utils.js";
import type {
  Diagnostic,
  Engine,
  EngineContext,
  EngineResult,
  Suggestion,
} from "../../types/index.js";

// ── Helpers ────────────────────────────────────────────────────────────────

/** Check whether a file path is a TypeScript/JavaScript file we should scan */
function isTargetFile(filePath: string): boolean {
  return /\.(ts|tsx|js|jsx|mjs|cjs)$/i.test(filePath);
}

/** Check whether a file path is TypeScript (not plain JS) */
function isTypeScriptFile(filePath: string): boolean {
  return /\.(ts|tsx)$/i.test(filePath);
}

/** Check whether a file is a JSX/TSX file */
function isJsxFile(filePath: string): boolean {
  return /\.(tsx|jsx)$/i.test(filePath);
}

/** Walk a directory recursively collecting target files (excludes configured patterns) */
async function collectFiles(
  root: string,
  exclude: string[],
  filter?: string[],
): Promise<string[]> {
  const { readdir } = await import("node:fs/promises");
  const results: string[] = [];

  async function walk(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      const rel = relative(root, fullPath);

      // Check exclude patterns
      const shouldExclude = exclude.some(
        (pattern) =>
          rel.includes(pattern) ||
          entry.name === pattern ||
          new RegExp(pattern.replace(/\*/g, ".*")).test(rel),
      );
      if (shouldExclude) continue;

      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (isTargetFile(entry.name)) {
        // If specific files filter provided, only include those
        if (filter && filter.length > 0) {
          const normalizedRel = rel.replace(/\\/g, "/");
          if (filter.some((f) => normalizedRel === f.replace(/\\/g, "/"))) {
            results.push(fullPath);
          }
        } else {
          results.push(fullPath);
        }
      }
    }
  }

  await walk(root);
  return results;
}

/** Count leading spaces/tabs for column calculation */
function columnForIndex(line: string, index: number): number {
  // We return 1-based column of the match within the line
  return index + 1;
}

// ── Context-Aware Pattern Detectors ────────────────────────────────────────

interface AsAnyContext {
  severity: "warning" | "info" | "suggestion";
  message: string;
  help: string;
  suggestion: Suggestion;
  rule: string;
}

/**
 * Analyze the surrounding context of an `as any` cast and produce
 * a CONTEXT-AWARE suggestion. This is the crown jewel of this engine.
 */
function analyzeAsAnyContext(
  lineText: string,
  matchIndex: number,
  _line: number,
  _filePath: string,
  surroundingLines: { before: string[]; after: string[] },
): AsAnyContext {
  const before = surroundingLines.before.join("\n").toLowerCase();
  const after = surroundingLines.after.join("\n").toLowerCase();
  const full = `${before}\n${lineText.toLowerCase()}\n${after}`;

  // ── Prisma / Drizzle query context ───────────────────────────────────
  const prismaDrizzlePatterns = [
    /\.\s*findFirst\s*\(/,
    /\.\s*findMany\s*\(/,
    /\.\s*findUnique\s*\(/,
    /\.\s*create\s*\(/,
    /\.\s*update\s*\(/,
    /\.\s*delete\s*\(/,
    /\.\s*upsert\s*\(/,
    /\.\s*query\s*\(/,
    /\.\s*execute\s*\(/,
    /prisma\./,
    /drizzle\./,
    /\.\s*select\s*\(/,
    /\.\s*from\s*\(/,
    /\.\s*where\s*\(/,
    /db\.\s*\(/,
  ];

  const isOrmQuery = prismaDrizzlePatterns.some((p) => p.test(full));
  if (isOrmQuery) {
    return {
      severity: "suggestion",
      rule: "types/as-any-orm",
      message: "`as any` cast after ORM query — common Drizzle/Prisma workaround",
      help: "ORMs like Drizzle sometimes produce incomplete types. Consider defining the return type explicitly instead of casting to any.",
      suggestion: {
        type: "refactor",
        text: "as Awaited<ReturnType<typeof db.query.table>>",
        confidence: 0.6,
        reason:
          "ORM query return types can be inferred. Use ReturnType or define a specific row interface instead of `as any`. This is a known Drizzle workaround but should be typed explicitly.",
      },
    };
  }

  // ── window / document context ─────────────────────────────────────────
  const windowDocPatterns = [
    /\bwindow\b/,
    /\bdocument\b/,
    /\bnavigator\b/,
    /\bglobalThis\b/,
  ];

  const isWindowDoc = windowDocPatterns.some((p) => p.test(lineText));
  if (isWindowDoc) {
    // Extract what's being cast — try to get the variable name
    const varMatch = lineText.match(
      /(\w+)\s*(?:\.\s*\w+\s*)*=\s*.*window.*as\s+any/,
    );
    const varName = varMatch?.[1] ?? "CustomWindow";

    return {
      severity: "warning",
      rule: "types/as-any-window",
      message: `\`as any\` cast on window/document — use interface extension instead`,
      help: `Declare an extended Window interface to add custom properties instead of casting to any.`,
      suggestion: {
        type: "insert",
        text: `interface ${varName.replace(/window/i, "XWindow")} extends Window {\n  // Add your custom properties here\n}\n\n// Then use: window as ${varName.replace(/window/i, "XWindow")}`,
        confidence: 0.85,
        reason:
          "Extending the Window interface is the TypeScript-idiomatic way to add custom globals. It preserves type safety for all standard properties while allowing your extensions.",
      },
    };
  }

  // ── JSON.parse context ────────────────────────────────────────────────
  const jsonParsePattern = /json\s*\.\s*parse\s*\(/i;
  if (jsonParsePattern.test(full) || jsonParsePattern.test(lineText)) {
    return {
      severity: "warning",
      rule: "types/as-any-json-parse",
      message: "`as any` cast on JSON.parse result — use runtime validation instead",
      help: "JSON.parse returns `any` by default. Instead of casting, use a validation library to ensure the data matches your expected shape at runtime.",
      suggestion: {
        type: "refactor",
        text: `import { z } from "zod";\nconst MySchema = z.object({ /* ... */ });\nconst data = MySchema.parse(JSON.parse(raw));`,
        confidence: 0.8,
        reason:
          "zod (or io-ts/valibot) validates at runtime AND gives you a typed result. This eliminates both the `any` and the risk of malformed data slipping through.",
      },
    };
  }

  // ── Function parameter context ────────────────────────────────────────
  const funcParamPattern =
    /(?:function\s*\w*\s*\(|(?:const|let|var)\s+\w+\s*=\s*(?:\([^)]*\)|[^=]+)=>)\s*[^)]*as\s+any/;
  const isFuncParam =
    funcParamPattern.test(lineText) ||
    /(?:param|arg|option|config|ctx|event)\w*\s*:\s*any/i.test(lineText);

  if (isFuncParam) {
    // Try to extract a meaningful name from the parameter
    const paramMatch = lineText.match(
      /(\w+)\s*(?::\s*any|:\s*unknown|\.\.\.)[^=]*as\s+any/,
    );
    const paramName = paramMatch?.[1] ?? "params";

    return {
      severity: "warning",
      rule: "types/as-any-param",
      message: `\`as any\` cast on function parameter — define an interface for \`${paramName}\``,
      help: `Instead of casting parameters to any, define an interface that describes the expected shape.`,
      suggestion: {
        type: "refactor",
        text: `interface ${capitalize(paramName)}Params {\n  // Define expected properties\n}\n\n// Use: (${paramName}: ${capitalize(paramName)}Params) => ...`,
        confidence: 0.7,
        reason:
          "Explicit interfaces on function parameters provide documentation, IDE autocompletion, and compile-time safety. `as any` removes all of these benefits.",
      },
    };
  }

  // ── Generic / default fallback ────────────────────────────────────────
  return {
    severity: "warning",
    rule: "types/as-any",
    message: "Unsafe `as any` cast — disables type checking",
    help: "Replace `as any` with a concrete type. If the type is truly unknown, use `unknown` and narrow with type guards.",
    suggestion: {
      type: "replace",
      text: "as unknown", // at least forces narrowing
      confidence: 0.5,
      reason:
        "`unknown` is the type-safe alternative to `any` — it requires narrowing before use, preventing accidental property access on the wrong type. If you know the shape, declare an interface instead.",
    },
  };
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ── Main Analysis Functions ────────────────────────────────────────────────

/**
 * Detect `as any` casts with context-aware suggestions.
 * Rule: types/as-any, types/as-any-orm, types/as-any-window,
 *       types/as-any-json-parse, types/as-any-param
 */
function detectAsAny(
  lines: string[],
  filePath: string,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const regex = /\bas\s+any\b/g;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let match: RegExpExecArray | null;

    while ((match = regex.exec(line)) !== null) {
      const col = columnForIndex(line, match.index);

      // Gather surrounding lines for context analysis
      const before = lines.slice(Math.max(0, i - 5), i);
      const after = lines.slice(i + 1, Math.min(lines.length, i + 6));

      const ctx = analyzeAsAnyContext(line, match.index, i + 1, filePath, {
        before,
        after,
      });

      diagnostics.push({
        filePath,
        engine: "type-safety",
        rule: ctx.rule,
        severity: ctx.severity,
        message: ctx.message,
        help: ctx.help,
        line: i + 1,
        column: col,
        category: "types",
        fixable: false,
        suggestion: ctx.suggestion,
      });
    }
  }

  return diagnostics;
}

/**
 * Detect double type assertions: `as unknown as X`
 * Rule: types/double-assertion
 */
function detectDoubleAssertions(
  lines: string[],
  filePath: string,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const regex = /\bas\s+unknown\s+as\s+(\w+)/g;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let match: RegExpExecArray | null;

    while ((match = regex.exec(line)) !== null) {
      const targetTypeName = match[1];
      const col = columnForIndex(line, match.index);

      diagnostics.push({
        filePath,
        engine: "type-safety",
        rule: "types/double-assertion",
        severity: "warning",
        message: `Double type assertion \`as unknown as ${targetTypeName}\` — use a named interface instead`,
        help: `Double assertions bypass TypeScript's safety checks. Define an interface (like the YaWindow pattern) and cast once to it.`,
        line: i + 1,
        column: col,
        category: "types",
        fixable: true,
        suggestion: {
          type: "refactor",
          text: `interface ${targetTypeName.startsWith("I") ? targetTypeName : `I${targetTypeName}`} {\n  // Define the expected shape\n}\n\n// Then use: ... as I${targetTypeName}`,
          confidence: 0.75,
          reason: `A named interface with a single cast is safer than \`as unknown as ${targetTypeName}\`. Double assertions hide real type mismatches — a named interface forces you to think about the actual shape.`,
        },
      });
    }
  }

  return diagnostics;
}

/**
 * Detect missing return type annotations on functions in TS files.
 * Skip simple arrow functions in JSX/TSX files.
 * Rule: types/missing-return-type
 */
function detectMissingReturnTypes(
  lines: string[],
  filePath: string,
): Diagnostic[] {
  if (!isTypeScriptFile(filePath)) return [];

  const diagnostics: Diagnostic[] = [];
  const isJsx = isJsxFile(filePath);

  // Matches: function name(...) {   OR   const name = (...) => {   OR   (...) => {
  // But NOT if there's already a `: Type` before the `{` or `=>`
  const funcPatterns = [
    // Named function: function foo(
    /function\s+(\w+)\s*\([^)]*\)\s*\{/,
    // Arrow with block body: const foo = (...) => {
    /(?:const|let|var)\s+(\w+)\s*=\s*\([^)]*\)\s*=>\s*\{/,
    // Arrow with block body (single param, no parens): const foo = x => {
    /(?:const|let|var)\s+(\w+)\s*=\s*\w+\s*=>\s*\{/,
  ];

  // For non-JSX files, also check exported functions
  if (!isJsx) {
    funcPatterns.push(
      // export function
      /export\s+(?:async\s+)?function\s+(\w+)\s*\([^)]*\)\s*\{/,
      // export default function
      /export\s+default\s+(?:async\s+)?function\s+(\w+)\s*\([^)]*\)\s*\{/,
    );
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Skip single-line arrow functions in JSX (they're usually inline callbacks)
    if (isJsx && /^\s*(?:const|let)\s+\w+\s*=\s*\([^)]*\)\s*=>\s*[^{]/.test(line)) {
      continue;
    }

    for (const pattern of funcPatterns) {
      const match = pattern.exec(trimmed);
      if (!match) continue;

      const funcName = match[1] || "anonymous";

      // Check if there's already a return type annotation (`: Type` before `{` or `=>`)
      const hasReturnType =
        /:\s*\w+(\[\])?\s*(=>|\{)/.test(trimmed) ||
        /:\s*\w+<[^>]+>\s*(=>|\{)/.test(trimmed);

      if (hasReturnType) continue;

      // Skip constructor / lifecycle methods in classes
      if (/^(constructor|render|componentDidMount|useEffect|useState)/.test(funcName)) {
        continue;
      }

      diagnostics.push({
        filePath,
        engine: "type-safety",
        rule: "types/missing-return-type",
        severity: "info",
        message: `Function \`${funcName}\` has no explicit return type annotation`,
        help: "Add an explicit return type to document the function's contract and catch mismatches at compile time.",
        line: i + 1,
        column: trimmed.indexOf(funcName) + 1,
        category: "types",
        fixable: true,
        suggestion: {
          type: "refactor",
          text: `: /* infer return type */ = `,
          confidence: 0.4,
          reason:
            "Explicit return types serve as documentation and catch accidental return-type changes. Hover over the function in your IDE to see the inferred type, then add it explicitly.",
        },
      });

      break; // only one diagnostic per line
    }
  }

  return diagnostics;
}

/**
 * Detect @ts-ignore and @ts-expect-error comments.
 * Rule: types/ts-suppress
 */
function detectTsSuppress(
  lines: string[],
  filePath: string,
): Diagnostic[] {
  if (!isTypeScriptFile(filePath)) return [];

  const diagnostics: Diagnostic[] = [];
  const patterns: Array<{ regex: RegExp; label: string }> = [
    { regex: /\/\/\s*@ts-ignore/, label: "@ts-ignore" },
    { regex: /\/\/\s*@ts-expect-error/, label: "@ts-expect-error" },
  ];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    for (const { regex, label } of patterns) {
      const match = regex.exec(line);
      if (!match) continue;

      const col = columnForIndex(line, match.index);

      // Check the next line for what type error is being suppressed
      const nextLine = i + 1 < lines.length ? lines[i + 1].trim() : "";
      const suppressedHint = nextLine
        ? ` The suppressed line is: \`${nextLine}\``
        : "";

      diagnostics.push({
        filePath,
        engine: "type-safety",
        rule: "types/ts-suppress",
        severity: "warning",
        message: `\`${label}\` suppresses a TypeScript error — fix the underlying type issue instead`,
        help: `Type-suppression comments hide real problems.${suppressedHint} Fix the type error on the next line and remove this comment.`,
        line: i + 1,
        column: col,
        category: "types",
        fixable: true,
        suggestion: {
          type: "delete",
          text: `// Remove ${label} and fix the type error on the next line`,
          confidence: 0.7,
          reason: `${label} hides type errors that could cause runtime failures. Fix the underlying type mismatch instead of suppressing it. If the error is in a dependency's type definitions, use \`declare module\` or a local override.`,
        },
      });
    }
  }

  return diagnostics;
}

/**
 * Detect non-null assertions: `x!` operator.
 * Rule: types/non-null-assertion
 */
function detectNonNullAssertions(
  lines: string[],
  filePath: string,
): Diagnostic[] {
  if (!isTypeScriptFile(filePath)) return [];

  const diagnostics: Diagnostic[] = [];
  // Match identifier followed by ! but NOT != and NOT inside strings/regex
  // Negative lookbehind for != and lookahead to avoid !: (definite assignment)
  const regex = /(\w+)!(?![=:(])/g;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Skip lines that are comments or strings (rough heuristic)
    if (/^\s*\/\//.test(line) || /^\s*\*/.test(line)) continue;

    let match: RegExpExecArray | null;
    while ((match = regex.exec(line)) !== null) {
      const identifier = match[1];
      const col = columnForIndex(line, match.index + identifier.length);

      // Avoid false positives: don't flag in string literals (rough check)
      const beforeMatch = line.substring(0, match.index);
      const singleQuotes = (beforeMatch.match(/'/g) || []).length;
      const doubleQuotes = (beforeMatch.match(/"/g) || []).length;
      if (singleQuotes % 2 === 1 || doubleQuotes % 2 === 1) continue;

      // Avoid flagging in template expressions
      if (beforeMatch.includes("`") && !beforeMatch.includes("}")) continue;

      diagnostics.push({
        filePath,
        engine: "type-safety",
        rule: "types/non-null-assertion",
        severity: "warning",
        message: `Non-null assertion \`${identifier}!\` — this assertion is unchecked at runtime`,
        help: `Non-null assertions (\`!\`) tell TypeScript to assume a value is non-null, but this isn't checked at runtime. Add an explicit null check instead.`,
        line: i + 1,
        column: col,
        category: "types",
        fixable: true,
        suggestion: {
          type: "replace",
          text: `if (${identifier} != null) { /* use ${identifier} safely */ }`,
          confidence: 0.65,
          reason:
            "An explicit null check provides runtime safety AND narrows the type in TypeScript. The `!` operator only satisfies the compiler — it can cause runtime errors if the value is actually null/undefined.",
        },
      });
    }
  }

  return diagnostics;
}

/**
 * Detect `any` used as a generic type parameter.
 * Rule: types/generic-any
 */
function detectGenericAny(
  lines: string[],
  filePath: string,
): Diagnostic[] {
  if (!isTypeScriptFile(filePath)) return [];

  const diagnostics: Diagnostic[] = [];

  // Patterns for any as generic parameter
  const genericPatterns: Array<{
    regex: RegExp;
    construct: string;
    suggestion: string;
  }> = [
    {
      regex: /Array\s*<\s*any\s*>/g,
      construct: "Array<any>",
      suggestion: "unknown[]",
    },
    {
      regex: /ReadonlyArray\s*<\s*any\s*>/g,
      construct: "ReadonlyArray<any>",
      suggestion: "readonly unknown[]",
    },
    {
      regex: /Promise\s*<\s*any\s*>/g,
      construct: "Promise<any>",
      suggestion: "Promise<unknown>",
    },
    {
      regex: /Record\s*<\s*([^,]+)\s*,\s*any\s*>/g,
      construct: "Record<K, any>",
      suggestion: "Record<K, unknown>",
    },
    {
      regex: /Map\s*<\s*([^,]+)\s*,\s*any\s*>/g,
      construct: "Map<K, any>",
      suggestion: "Map<K, unknown>",
    },
    {
      regex: /Set\s*<\s*any\s*>/g,
      construct: "Set<any>",
      suggestion: "Set<unknown>",
    },
    {
      regex: /Partial\s*<\s*any\s*>/g,
      construct: "Partial<any>",
      suggestion: "Partial<Record<string, unknown>>",
    },
    {
      regex: /Omit\s*<\s*any\s*,/g,
      construct: "Omit<any, K>",
      suggestion: "Omit<Record<string, unknown>, K>",
    },
    {
      regex: /Pick\s*<\s*any\s*,/g,
      construct: "Pick<any, K>",
      suggestion: "Pick<Record<string, unknown>, K>",
    },
    {
      regex: /ReturnType\s*<\s*any\s*>/g,
      construct: "ReturnType<any>",
      suggestion: "ReturnType<typeof fn>",
    },
    {
      // Catch-all: <any> as generic parameter in other contexts
      regex: /(\w+)\s*<\s*any\s*>/g,
      construct: "T<any>",
      suggestion: "T<unknown>",
    },
  ];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Skip comments
    if (/^\s*\/\//.test(line) || /^\s*\*/.test(line)) continue;

    for (const pattern of genericPatterns) {
      let match: RegExpExecArray | null;
      while ((match = pattern.regex.exec(line)) !== null) {
        const col = columnForIndex(line, match.index);

        // Build specific suggestion text
        let suggestionText: string;
        let reason: string;

        if (pattern.construct === "Record<K, any>") {
          const keyType = match[1]?.trim() ?? "string";
          suggestionText = `Record<${keyType}, unknown>`;
          reason = `Using \`any\` as the value type in Record allows unrestricted access. Use \`unknown\` to require narrowing before use, or define a specific value interface.`;
        } else if (pattern.construct === "Map<K, any>") {
          const keyType = match[1]?.trim() ?? "string";
          suggestionText = `Map<${keyType}, unknown>`;
          reason = `Using \`any\` as the value type in Map allows unrestricted access. Use \`unknown\` to require narrowing, or define a specific value interface.`;
        } else if (pattern.construct === "Omit<any, K>" || pattern.construct === "Pick<any, K>") {
          const constructName = pattern.construct.startsWith("Omit") ? "Omit" : "Pick";
          suggestionText = `${constructName}<Record<string, unknown>, K>`;
          reason = `Using \`any\` as the base type in ${constructName} makes the result essentially untyped. Define a proper interface as the base.`;
        } else if (pattern.construct === "T<any>") {
          const typeName = match[1] ?? "T";
          suggestionText = `${typeName}<unknown>`;
          reason = `Using \`any\` as a generic parameter defeats the purpose of generics. Use \`unknown\` or a specific type.`;
        } else {
          suggestionText = pattern.suggestion;
          reason = `Using \`any\` as a generic type parameter disables all type checking for that parameter. Use \`unknown\` to require narrowing, or define a specific type.`;
        }

        // Dedup: if a more specific pattern already matched this line at the same column, skip
        const alreadyReported = diagnostics.some(
          (d) => d.line === i + 1 && d.column === col,
        );
        if (alreadyReported) continue;

        diagnostics.push({
          filePath,
          engine: "type-safety",
          rule: "types/generic-any",
          severity: "warning",
          message: `\`${match[0]}\` uses \`any\` as a generic type parameter`,
          help: `Replace \`any\` with a concrete type or \`unknown\` to preserve type safety.`,
          line: i + 1,
          column: col,
          category: "types",
          fixable: true,
          suggestion: {
            type: "replace",
            text: suggestionText,
            confidence: 0.7,
            reason,
          },
        });
      }
    }
  }

  return diagnostics;
}

// ── Engine Implementation ──────────────────────────────────────────────────

export const typeSafetyEngine: Engine = {
  name: "type-safety",
  description:
    "Detects type safety issues with context-aware suggestions — as any casts, double assertions, missing return types, ts-suppress comments, non-null assertions, and generic any parameters.",
  supportedLanguages: ["typescript", "javascript"],

  async run(context: EngineContext): Promise<EngineResult> {
    const startTime = performance.now();

    // Respect config flags
    const { flagAsAny, suggestTypes, flagDoubleAssertion } = context.config.types;

    // If all features are disabled, skip
    if (!flagAsAny && !suggestTypes && !flagDoubleAssertion) {
      return {
        engine: "type-safety",
        diagnostics: [],
        elapsed: performance.now() - startTime,
        skipped: true,
        skipReason: "All type-safety checks disabled in config",
      };
    }

    // Determine files to scan
    const root = context.rootDirectory;
    const exclude = context.config.exclude;
    const files = context.files
      ? context.files.filter((f) => isTargetFile(f)).map((f) => join(root, f))
      : await collectFiles(root, exclude);

    if (files.length === 0) {
      return {
        engine: "type-safety",
        diagnostics: [],
        elapsed: performance.now() - startTime,
        skipped: true,
        skipReason: "No TypeScript/JavaScript files found to scan",
      };
    }

    const allDiagnostics: Diagnostic[] = [];
    const earlyExit = isEngineEarlyExitEnabled(
      context.config.engines["type-safety"],
      "type-safety",
    );
    // Use orchestrator-provided disabled rules for early-exit accuracy
    const disabledRules = context.disabledRules ?? new Set<string>()
    const wildcardOff: string[] = (context as any)._wildcardOff ?? []

    // Helper: is a rule effectively disabled?
    const isRuleDisabled = (rule: string) =>
      disabledRules.has(rule) || wildcardOff.some(p => rule.startsWith(p))

    // Process each file
    for (let i = 0; i < files.length; i++) {
      const filePath = files[i];
      let content: string;
      try {
        content = await readFile(filePath, "utf-8");
      } catch {
        // Skip files that can't be read
        continue;
      }

      const lines = content.split("\n");
      const relPath = relative(root, filePath).replace(/\\/g, "/");

      // 1. `as any` detection (if enabled)
      if (flagAsAny) {
        allDiagnostics.push(...detectAsAny(lines, relPath));
      }

      // 2. Double type assertions (if enabled)
      if (flagDoubleAssertion) {
        allDiagnostics.push(...detectDoubleAssertions(lines, relPath));
      }

      // 3. Missing return types (if suggestTypes enabled)
      if (suggestTypes) {
        allDiagnostics.push(...detectMissingReturnTypes(lines, relPath));
      }

      // 4. @ts-ignore / @ts-expect-error (always on for TS files)
      allDiagnostics.push(...detectTsSuppress(lines, relPath));

      // 5. Non-null assertions (always on for TS files)
      allDiagnostics.push(...detectNonNullAssertions(lines, relPath));

      // 6. Generic type parameter misuse (always on for TS files)
      allDiagnostics.push(...detectGenericAny(lines, relPath));

      // Early-exit heuristic: after scanning the first batch with zero
      // non-disabled diagnostics, skip remaining files if the engine is not mandatory.
      const activeDiagCount = allDiagnostics.filter(d => !isRuleDisabled(d.rule)).length
      if (
        earlyExit &&
        i >= EARLY_EXIT_BATCH_SIZE - 1 &&
        activeDiagCount === 0
      ) {
        return buildEarlyExitResult("type-safety", performance.now() - startTime);
      }

    }

    return {
      engine: "type-safety",
      diagnostics: allDiagnostics,
      elapsed: performance.now() - startTime,
      skipped: false,
    };
  },

  async fix(
    diagnostics: Diagnostic[],
    _context: EngineContext,
  ): Promise<import("../../types/index.js").FixResult> {
    // Auto-fix is limited to simple replacements.
    // Most type-safety fixes require human judgment (designing interfaces),
    // so we only handle a few high-confidence cases.

    const fixable = diagnostics.filter(
      (d) =>
        d.fixable &&
        d.suggestion &&
        d.suggestion.type === "replace" &&
        d.suggestion.confidence >= 0.8,
    );

    // For now, we report what could be fixed but don't modify files
    // since most fixes require understanding the broader code context.
    // Future: implement targeted replacements for high-confidence suggestions.

    return {
      fixed: 0,
      remaining: diagnostics,
      modifiedFiles: [],
    };
  },
};
