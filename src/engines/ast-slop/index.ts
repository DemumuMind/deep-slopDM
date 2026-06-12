// ── AST-Slop Engine ─────────────────────────────────────
// Detects AI-authored code patterns using regex + context.
// Tree-sitter integration provides AST-aware enhancements;
// regex remains the default fallback when tree-sitter is unavailable.

import { readFile } from "node:fs/promises";
import { join, extname, relative } from "node:path";
import type {
  Diagnostic,
  Engine,
  EngineContext,
  EngineResult,
  FixResult,
  Language,
  Severity,
  Suggestion,
} from "../../types/index.js";
import { readFileContent, toLines, extractImports } from "../../utils/file-utils.js";
// Tree-sitter imports removed — will be re-integrated in v0.3
// import { initParser, parseFile, ... } from "../../utils/tree-sitter.js";
// import type { Tree } from "web-tree-sitter";

// ── Helpers ─────────────────────────────────────────────

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
    engine: "ast-slop",
    rule: opts.rule,
    severity: opts.severity,
    message: opts.message,
    help: opts.help,
    line: opts.line,
    column: opts.column,
    category: "ai-slop",
    fixable: opts.fixable,
    suggestion: opts.suggestion,
    detail: opts.detail,
  };
}

/** Determine language from file extension */
function languageFromPath(filePath: string): Language | null {
  const ext = extname(filePath);
  const map: Record<string, Language> = {
    ".ts": "typescript",
    ".tsx": "typescript",
    ".js": "javascript",
    ".jsx": "javascript",
    ".mjs": "javascript",
    ".cjs": "javascript",
    ".py": "python",
  };
  return map[ext] ?? null;
}

// tsLangHint removed — will be re-integrated in v0.3 with tree-sitter
// function tsLangHint(filePath: string): "typescript" | "tsx" | "javascript" { ... }

/** Check whether an import source is a bare specifier (not relative, not absolute) */
function isBareSpecifier(source: string): boolean {
  return !source.startsWith(".") && !source.startsWith("/");
}

/** Check whether a bare specifier is scoped (@org/pkg) and return the package name */
function scopedPackageName(source: string): string | null {
  const match = source.match(/^(@[^/]+\/[^/]+)/);
  return match ? match[1] : null;
}

/** Load package.json dependencies (including devDependencies) */
async function loadPackageDeps(rootDir: string): Promise<Set<string>> {
  try {
    const raw = await readFile(join(rootDir, "package.json"), "utf-8");
    const pkg = JSON.parse(raw);
    return new Set([
      ...Object.keys(pkg.dependencies ?? {}),
      ...Object.keys(pkg.devDependencies ?? {}),
      ...Object.keys(pkg.peerDependencies ?? {}),
      ...Object.keys(pkg.optionalDependencies ?? {}),
    ]);
  } catch {
    return new Set();
  }
}

/** Load requirements.txt / pyproject.toml for Python */
async function loadPythonDeps(rootDir: string): Promise<Set<string>> {
  const deps = new Set<string>();
  try {
    const raw = await readFile(join(rootDir, "requirements.txt"), "utf-8");
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const name = trimmed.split(/[=<>!\[]/)[0].split("[")[0].trim();
      if (name) deps.add(name);
    }
  } catch { /* no requirements.txt */ }

  try {
    const raw = await readFile(join(rootDir, "pyproject.toml"), "utf-8");
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      const depMatch = trimmed.match(/^"?([a-zA-Z0-9_-]+)"?\s*[=<>]/);
      if (depMatch) deps.add(depMatch[1]);
    }
  } catch { /* no pyproject.toml */ }

  return deps;
}

// ── Pattern Detectors (regex-based, always available) ──

// 1. Narrative comments — describe WHAT, not WHY
const NARRATIVE_PATTERNS: { regex: RegExp; label: string }[] = [
  { regex: /\/\/\s*Initialize/i, label: "Initialize" },
  { regex: /\/\/\s*Set up/i, label: "Set up" },
  { regex: /\/\/\s*Handle/i, label: "Handle" },
  { regex: /\/\/\s*Process/i, label: "Process" },
  { regex: /\/\/\s*Create/i, label: "Create" },
  { regex: /\/\/\s*Update/i, label: "Update" },
  { regex: /\/\/\s*Calculate/i, label: "Calculate" },
  { regex: /\/\/\s*Check if/i, label: "Check if" },
  { regex: /\/\/\s*Define/i, label: "Define" },
  { regex: /\/\*\s*We need to/i, label: "We need to" },
  { regex: /\/\*\s*This function/i, label: "This function" },
];

const NARRATIVE_PATTERNS_PY: { regex: RegExp; label: string }[] = [
  { regex: /#\s*Initialize/i, label: "Initialize" },
  { regex: /#\s*Set up/i, label: "Set up" },
  { regex: /#\s*Handle/i, label: "Handle" },
  { regex: /#\s*Process/i, label: "Process" },
  { regex: /#\s*Create/i, label: "Create" },
  { regex: /#\s*Update/i, label: "Update" },
  { regex: /#\s*Calculate/i, label: "Calculate" },
  { regex: /#\s*Check if/i, label: "Check if" },
  { regex: /#\s*Define/i, label: "Define" },
  { regex: /"""\s*We need to/i, label: "We need to" },
  { regex: /"""\s*This function/i, label: "This function" },
];

function detectNarrativeComments(
  lines: { num: number; text: string }[],
  filePath: string,
  language: Language,
): Diagnostic[] {
  const patterns = language === "python" ? NARRATIVE_PATTERNS_PY : NARRATIVE_PATTERNS;
  const results: Diagnostic[] = [];

  for (const { num, text } of lines) {
    const trimmed = text.trim();
    for (const { regex, label } of patterns) {
      if (regex.test(trimmed)) {
        const col = text.indexOf(trimmed.charAt(0)) + 1;
        results.push(
          diag({
            filePath,
            rule: "ast-slop/narrative-comment",
            severity: "info",
            message: `Narrative comment: "${label}" — describes WHAT, not WHY`,
            help: "Remove or replace with a comment explaining the reasoning (WHY), not the mechanics (WHAT). Code should be self-documenting for the WHAT.",
            line: num,
            column: col,
            fixable: true,
            suggestion: {
              type: "delete",
              text: "",
              range: { startLine: num, startCol: 1, endLine: num, endCol: text.length + 1 },
              confidence: 0.7,
              reason: "Narrative comments that only describe what the code does add noise. Delete or replace with a WHY comment.",
            },
          }),
        );
        break;
      }
    }
  }
  return results;
}

// 2. Decorative comment blocks
const DECORATIVE_PATTERNS = [
  /\/\/\s*[=]{3,}/,
  /\/\/\s*[─━]{3,}/,
  /\/\/\s*[*]{3,}/,
  /\/\/\s*[~]{3,}/,
  /\/\/\s*[-]{3,}\s*$/,
  /#\s*[=]{3,}/,
  /#\s*[─━]{3,}/,
  /#\s*[*]{3,}/,
  /#\s*[~]{3,}/,
  /#\s*[-]{3,}\s*$/,
];

function detectDecorativeComments(
  lines: { num: number; text: string }[],
  filePath: string,
): Diagnostic[] {
  const results: Diagnostic[] = [];
  for (const { num, text } of lines) {
    const trimmed = text.trim();
    for (const pattern of DECORATIVE_PATTERNS) {
      if (pattern.test(trimmed)) {
        const col = text.indexOf(trimmed.charAt(0)) + 1;
        results.push(
          diag({
            filePath,
            rule: "ast-slop/decorative-comment",
            severity: "info",
            message: "Decorative comment block — visual noise typical of AI-generated code",
            help: "Remove decorative separators. Use blank lines to separate logical sections instead.",
            line: num,
            column: col,
            fixable: true,
            suggestion: {
              type: "delete",
              text: "",
              range: { startLine: num, startCol: 1, endLine: num, endCol: text.length + 1 },
              confidence: 0.9,
              reason: "Decorative comment lines add visual clutter without conveying information.",
            },
          }),
        );
        break;
      }
    }
  }
  return results;
}

// 3. Trivial / restating comments
function detectTrivialComments(
  lines: { num: number; text: string }[],
  filePath: string,
  language: Language,
): Diagnostic[] {
  const results: Diagnostic[] = [];
  const commentPrefix = language === "python" ? "#" : "//";

  for (let i = 0; i < lines.length - 1; i++) {
    const current = lines[i].text.trim();
    const next = lines[i + 1].text.trim();

    if (!current.startsWith(commentPrefix)) continue;
    if (!next || next.startsWith(commentPrefix)) continue;

    const commentText = current.replace(new RegExp(`^\\s*${commentPrefix.replace("/", "\\/")}\\s*`), "").trim().toLowerCase();
    if (!commentText) continue;

    const normalizedComment = commentText
      .replace(/^(initialize|set up|handle|process|create|update|calculate|check if|define|get|set|return|add|remove|delete|fetch|load|save|validate|parse|reset|clear|log|assign|declare|call|invoke)\s+/i, "")
      .replace(/^(the |a |an |this |that |these |those )/i, "")
      .trim();

    if (!normalizedComment || normalizedComment.length < 3) continue;

    const codeLower = next.toLowerCase();
    const commentWords = normalizedComment.split(/\s+/).filter((w) => w.length > 2);
    if (commentWords.length === 0) continue;

    const matchCount = commentWords.filter((w) => codeLower.includes(w)).length;
    const matchRatio = matchCount / commentWords.length;

    if (matchRatio >= 0.6 && matchCount >= 2) {
      const col = lines[i].text.indexOf(current.charAt(0)) + 1;
      results.push(
        diag({
          filePath,
          rule: "ast-slop/trivial-comment",
          severity: "suggestion",
          message: `Comment restates the obvious: next line already expresses "${normalizedComment}"`,
          help: "Remove comments that simply restate what the code does. If the code isn't clear enough, improve the code instead.",
          line: lines[i].num,
          column: col,
          fixable: true,
          suggestion: {
            type: "delete",
            text: "",
            range: { startLine: lines[i].num, startCol: 1, endLine: lines[i].num, endCol: lines[i].text.length + 1 },
            confidence: 0.65,
            reason: "The comment merely restates what the next line of code already makes obvious.",
          },
        }),
      );
    }
  }
  return results;
}

// 4. Console.log / console.debug leftovers
function detectConsoleLeftovers(
  lines: { num: number; text: string }[],
  filePath: string,
  language: Language,
): Diagnostic[] {
  const results: Diagnostic[] = [];

  for (const { num, text } of lines) {
    const trimmed = text.trim();

    if (language !== "python") {
      const logMatch = trimmed.match(/console\.(log|debug)\s*\(/);
      if (logMatch) {
        const isInCatch = isInCatchBlock(lines, num);
        if (isInCatch) continue;

        const col = text.indexOf("console") + 1;
        results.push(
          diag({
            filePath,
            rule: "ast-slop/console-leftover",
            severity: "warning",
            message: `console.${logMatch[1]}() leftover — likely debugging artifact`,
            help: "Remove debug logging before committing. Use a proper logging library for production, or guard with environment checks.",
            line: num,
            column: col,
            fixable: true,
            suggestion: {
              type: "delete",
              text: "",
              range: { startLine: num, startCol: 1, endLine: num, endCol: text.length + 1 },
              confidence: 0.85,
              reason: "console.log/console.debug statements are typically debugging artifacts that should not be in committed code.",
            },
          }),
        );
      }
    }

    if (language === "python") {
      const printMatch = trimmed.match(/^print\s*\(/);
      if (printMatch) {
        const prevLines = lines.filter((l) => l.num < num && l.num >= num - 5);
        const isMainGuard = prevLines.some((l) => l.text.includes('if __name__'));
        if (isMainGuard) continue;

        const col = text.indexOf("print") + 1;
        results.push(
          diag({
            filePath,
            rule: "ast-slop/console-leftover",
            severity: "warning",
            message: "print() leftover — likely debugging artifact",
            help: "Replace print() with proper logging (logging.debug, logger.debug) or remove entirely.",
            line: num,
            column: col,
            fixable: true,
            suggestion: {
              type: "replace",
              text: trimmed.replace(/^print\s*\((.+)\)/, "logger.debug($1)"),
              range: { startLine: num, startCol: 1, endLine: num, endCol: text.length + 1 },
              confidence: 0.6,
              reason: "Replace bare print() with structured logging for maintainability.",
            },
          }),
        );
      }
    }
  }
  return results;
}

function isInCatchBlock(lines: { num: number; text: string }[], lineNum: number): boolean {
  let depth = 0;
  for (let i = lineNum - 1; i >= 1; i--) {
    const line = lines.find((l) => l.num === i);
    if (!line) continue;
    const t = line.text.trim();
    for (const ch of t) {
      if (ch === "}") depth--;
      if (ch === "{") depth++;
    }
    if (t.includes("catch") && depth >= 0) return true;
    if (depth < 0) return false;
  }
  return false;
}

// 5. TODO stubs
const TODO_PATTERNS = [
  /\bTODO\b/i,
  /\bFIXME\b/i,
  /\bHACK\b/i,
  /\bXXX\b/i,
];

function detectTodoStubs(
  lines: { num: number; text: string }[],
  filePath: string,
  language: Language,
): Diagnostic[] {
  const results: Diagnostic[] = [];
  const commentPrefix = language === "python" ? "#" : "//";

  for (const { num, text } of lines) {
    const trimmed = text.trim();
    const isComment = trimmed.startsWith(commentPrefix) || trimmed.startsWith("/*") || trimmed.startsWith("*");
    if (!isComment) continue;

    for (const pattern of TODO_PATTERNS) {
      if (pattern.test(trimmed)) {
        const col = text.indexOf(trimmed.charAt(0)) + 1;
        const tag = trimmed.match(/\b(TODO|FIXME|HACK|XXX)\b/i)?.[1] ?? "TODO";
        const hasFollowUp = /(?:#\d+|@[a-zA-Z0-9_-]+|\(\d{4}-\d{2}-\d{2}\)|https?:\/\/)/.test(trimmed);

        if (!hasFollowUp) {
          results.push(
            diag({
              filePath,
              rule: "ast-slop/todo-stub",
              severity: "info",
              message: `${tag} comment without ticket reference or assignee — likely a stub`,
              help: "Add a ticket/issue number (e.g. TODO(#123)) or assignee (e.g. TODO(@dev)), or remove if not actionable.",
              line: num,
              column: col,
              fixable: false,
              detail: { tag },
            }),
          );
        }
        break;
      }
    }
  }
  return results;
}

// 6. Generic variable names
const GENERIC_NAMES = new Set([
  "data", "result", "info", "temp", "obj", "item",
  "value1", "value2", "value3", "tmp", "retval", "stuff",
]);

function isGenericNameAcceptable(
  name: string,
  fullLine: string,
  prevLine: string | undefined,
  nextLine: string | undefined,
): boolean {
  if (/\b(?:name|id)\s*=\s*["']/.test(fullLine)) return true;
  if (/\b(?:function|=>|callback|handler)\b/.test(fullLine) && /\(\s*\w*\s*,?\s*\b/.test(fullLine)) return true;
  if (/\b(?:query|params|req|request|ctx|context)\s*[.\[]\s*/.test(fullLine)) return true;
  if (/\{\s*[^}]*\b\w+\b[^}]*\}\s*=/.test(fullLine) && fullLine.includes(name)) {
    if (/\b(?:response|res|result|axios|fetch|api)\b/.test(fullLine)) return true;
  }
  if (/\b(?:FormData|event|CustomEvent)\b/.test(fullLine)) return true;
  if (/\b(?:useQuery|useMutation|useSWR|useFetch)\b/.test(fullLine)) return true;
  return false;
}

function detectGenericNames(
  lines: { num: number; text: string }[],
  filePath: string,
  language: Language,
): Diagnostic[] {
  const results: Diagnostic[] = [];

  for (let i = 0; i < lines.length; i++) {
    const { num, text } = lines[i];
    const trimmed = text.trim();

    const varPattern = language === "python"
      ? /(?:^|\s)(\w+)\s*=\s*/
      : /(?:const|let|var)\s+(\w+)\s*[=:]?/;

    const match = trimmed.match(varPattern);
    if (!match) continue;

    const varName = match[1];
    if (!GENERIC_NAMES.has(varName)) continue;

    const prevLine = i > 0 ? lines[i - 1].text.trim() : undefined;
    const nextLine = i < lines.length - 1 ? lines[i + 1].text.trim() : undefined;

    if (isGenericNameAcceptable(varName, trimmed, prevLine, nextLine)) continue;

    const col = text.indexOf(varName) + 1;
    results.push(
      diag({
        filePath,
        rule: "ast-slop/generic-name",
        severity: "suggestion",
        message: `Generic variable name "${varName}" — lacks descriptive intent`,
        help: `Rename "${varName}" to convey its purpose (e.g. "userData", "fetchResult", "configInfo"). Generic names are a hallmark of AI-generated code.`,
        line: num,
        column: col,
        fixable: false,
        detail: { variableName: varName },
      }),
    );
  }
  return results;
}

// 7. Defensive coding patterns
function detectDefensivePatterns(
  lines: { num: number; text: string }[],
  filePath: string,
  language: Language,
): Diagnostic[] {
  const results: Diagnostic[] = [];

  for (const { num, text } of lines) {
    const trimmed = text.trim();

    if (language === "typescript") {
      const typeofMatch = trimmed.match(/typeof\s+(\w+)\s*===?\s*['"]undefined['"]/);
      if (typeofMatch) {
        const col = text.indexOf("typeof") + 1;
        results.push(
          diag({
            filePath,
            rule: "ast-slop/defensive-typeof",
            severity: "info",
            message: `typeof ${typeofMatch[1]} === 'undefined' — unnecessary in TypeScript; use optional chaining or type guards instead`,
            help: "In TypeScript, variables are type-checked at compile time. Use optional chaining (?.), type narrowing, or explicit null checks instead of runtime typeof guards for declared variables.",
            line: num,
            column: col,
            fixable: true,
            suggestion: {
              type: "refactor",
              text: `${typeofMatch[1]} != null`,
              confidence: 0.6,
              reason: "Replace typeof undefined check with a simpler null check when the variable is already typed.",
            },
          }),
        );
      }
    }

    if (language === "python") {
      const isinstanceMatch = trimmed.match(/isinstance\s*\(\s*(\w+)\s*,/);
      if (isinstanceMatch && trimmed.includes("type: ignore")) {
        const col = text.indexOf("isinstance") + 1;
        results.push(
          diag({
            filePath,
            rule: "ast-slop/defensive-isinstance",
            severity: "info",
            message: `Defensive isinstance check for "${isinstanceMatch[1]}" — contradicts type hints`,
            help: "If the variable has a type annotation, isinstance checks at runtime indicate distrust of the type system. Strengthen the types or use a TypeGuard instead.",
            line: num,
            column: col,
            fixable: false,
          }),
        );
      }
    }
  }
  return results;
}

// 8. Swallowed exceptions (regex fallback)
function detectSwallowedExceptions(
  lines: { num: number; text: string }[],
  filePath: string,
  language: Language,
): Diagnostic[] {
  const results: Diagnostic[] = [];

  for (let i = 0; i < lines.length; i++) {
    const { num, text } = lines[i];
    const trimmed = text.trim();

    if (language === "python") {
      const exceptMatch = trimmed.match(/^except\s*(?:\w+(?:\s+as\s+\w+)?)?\s*:/);
      if (exceptMatch) {
        for (let j = i + 1; j < Math.min(i + 3, lines.length); j++) {
          const nextTrimmed = lines[j].text.trim();
          if (nextTrimmed === "pass" || nextTrimmed === "...") {
            const col = text.indexOf("except") + 1;
            results.push(
              diag({
                filePath,
                rule: "ast-slop/swallowed-exception",
                severity: "warning",
                message: "Swallowed exception: except block contains only pass/ellipsis",
                help: "At minimum, log the error. Silently swallowing exceptions hides bugs. Consider: logger.error(f'...: {e}', exc_info=True)",
                line: num,
                column: col,
                fixable: true,
                suggestion: {
                  type: "insert",
                  text: "    logger.error(f'Unexpected error: {e}', exc_info=True)",
                  range: { startLine: lines[j].num, startCol: 1, endLine: lines[j].num, endCol: lines[j].text.length + 1 },
                  confidence: 0.7,
                  reason: "Replace bare pass with error logging to avoid silently hiding failures.",
                },
              }),
            );
            break;
          }
          if (nextTrimmed && !nextTrimmed.startsWith("#") && nextTrimmed !== "pass" && nextTrimmed !== "...") {
            break;
          }
        }
      }
    } else {
      const catchMatch = trimmed.match(/catch\s*(?:\(\s*\w+\s*\))?\s*\{\s*\}\s*$/);
      if (catchMatch) {
        const col = text.indexOf("catch") + 1;
        results.push(
          diag({
            filePath,
            rule: "ast-slop/swallowed-exception",
            severity: "warning",
            message: "Swallowed exception: empty catch block",
            help: "Handle the error (log, rethrow, or recover). Empty catch blocks silently swallow errors, making bugs invisible.",
            line: num,
            column: col,
            fixable: true,
            suggestion: {
              type: "refactor",
              text: "catch (error) { console.error(error); }",
              confidence: 0.6,
              reason: "Add at least error logging to avoid silently swallowing exceptions.",
            },
          }),
        );
      } else {
        const catchStartMatch = trimmed.match(/catch\s*(?:\(\s*(\w+)\s*\))?\s*\{\s*$/);
        if (catchStartMatch) {
          const catchVar = catchStartMatch[1] ?? "error";
          for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
            const nextTrimmed = lines[j].text.trim();
            if (nextTrimmed === "}") {
              const col = text.indexOf("catch") + 1;
              results.push(
                diag({
                  filePath,
                  rule: "ast-slop/swallowed-exception",
                  severity: "warning",
                  message: "Swallowed exception: empty catch block",
                  help: "Handle the error (log, rethrow, or recover). Empty catch blocks silently swallow errors, making bugs invisible.",
                  line: num,
                  column: col,
                  fixable: true,
                  suggestion: {
                    type: "insert",
                    text: `  console.error(${catchVar});`,
                    range: { startLine: lines[j].num, startCol: 1, endLine: lines[j].num, endCol: 1 },
                    confidence: 0.65,
                    reason: "Add at least error logging to the empty catch block.",
                  },
                }),
              );
              break;
            }
            if (nextTrimmed && nextTrimmed !== "" && nextTrimmed !== "}" && !nextTrimmed.startsWith("//")) {
              break;
            }
          }
        }
      }
    }
  }
  return results;
}

// 9. Unsafe casts (regex fallback)
function detectUnsafeCasts(
  lines: { num: number; text: string }[],
  filePath: string,
): Diagnostic[] {
  const results: Diagnostic[] = [];

  for (const { num, text } of lines) {
    const trimmed = text.trim();

    const doubleMatch = trimmed.match(/\bas\s+unknown\s+as\s+(\w+)/);
    if (doubleMatch) {
      const col = text.indexOf("as unknown") + 1;
      results.push(
        diag({
          filePath,
          rule: "ast-slop/double-assertion",
          severity: "warning",
          message: `Double type assertion: as unknown as ${doubleMatch[1]} — bypasses type safety`,
          help: "Use a proper type guard, type predicate, or adjust the source/target types. Double assertions defeat the purpose of TypeScript.",
          line: num,
          column: col,
          fixable: true,
          suggestion: {
            type: "refactor",
            text: `as ${doubleMatch[1]}`,
            confidence: 0.5,
            reason: "Prefer a direct cast with a type guard over bypassing the type system with double assertion.",
          },
        }),
      );
    }

    const asAnyMatch = trimmed.match(/\bas\s+any\b/);
    if (asAnyMatch && !doubleMatch) {
      const col = text.indexOf("as any") + 1;
      results.push(
        diag({
          filePath,
          rule: "ast-slop/as-any",
          severity: "warning",
          message: "Unsafe cast: as any — opts out of type checking entirely",
          help: "Replace `as any` with a more specific type, a type guard, or `as unknown as SpecificType` if truly needed (though that has its own issues).",
          line: num,
          column: col,
          fixable: true,
          suggestion: {
            type: "refactor",
            text: "/* replace with specific type */",
            confidence: 0.4,
            reason: "`as any` disables type checking. Replace with the actual expected type.",
          },
        }),
      );
    }
  }
  return results;
}

// 10. Hallucinated imports (regex fallback)
function detectHallucinatedImports(
  content: string,
  lines: { num: number; text: string }[],
  filePath: string,
  language: Language,
  knownDeps: Set<string>,
): Diagnostic[] {
  const results: Diagnostic[] = [];
  const imports = extractImports(content, language);

  for (const imp of imports) {
    if (!isBareSpecifier(imp.source)) continue;

    let pkgName: string;
    if (imp.source.startsWith("@")) {
      const scoped = scopedPackageName(imp.source);
      if (!scoped) continue;
      pkgName = scoped;
    } else {
      pkgName = imp.source.split("/")[0];
    }

    if (!knownDeps.has(pkgName)) {
      const nodeBuiltins = new Set([
        "fs", "path", "http", "https", "url", "util", "crypto", "os", "stream",
        "buffer", "events", "child_process", "cluster", "dns", "net", "tls",
        "zlib", "assert", "async_hooks", "perf_hooks",
        "worker_threads", "readline", "vm", "module", "process", "timers",
        "dgram", "fs/promises", "node:fs", "node:path", "node:http",
        "node:https", "node:url", "node:util", "node:crypto", "node:os",
        "node:stream", "node:buffer", "node:events", "node:child_process",
        "node:fs/promises", "node:perf_hooks", "node:assert",
      ]);

      const pyBuiltins = new Set([
        "os", "sys", "json", "re", "math", "datetime", "collections",
        "functools", "itertools", "logging", "pathlib", "typing",
        "dataclasses", "abc", "io", "hashlib", "copy", "enum",
        "subprocess", "argparse", "unittest", "asyncio", "threading",
        "multiprocessing", "http", "urllib", "socket", "struct",
        "csv", "sqlite3", "random", "string", "textwrap", "tempfile",
      ]);

      const builtins = language === "python" ? pyBuiltins : nodeBuiltins;
      if (builtins.has(pkgName)) continue;

      if (pkgName === "typescript" && imp.isTypeOnly) continue;

      const line = lines.find((l) => l.num === imp.line);
      const col = line ? line.text.indexOf(imp.source) + 1 : 1;

      results.push(
        diag({
          filePath,
          rule: "ast-slop/hallucinated-import",
          severity: "error",
          message: `Import "${imp.source}" not found in project dependencies`,
          help: `Package "${pkgName}" is not listed in package.json/requirements.txt. This may be a hallucinated import. Install it (npm install ${pkgName}) or remove the import if it was incorrectly generated.`,
          line: imp.line,
          column: col,
          fixable: true,
          suggestion: {
            type: "delete",
            text: "",
            range: { startLine: imp.line, startCol: 1, endLine: imp.line, endCol: (line?.text.length ?? 80) + 1 },
            confidence: 0.8,
            reason: `The imported package "${pkgName}" is not in project dependencies and may not exist.`,
          },
          detail: { importSource: imp.source, packageName: pkgName },
        }),
      );
    }
  }
  return results;
}

// ── Tree-sitter Enhanced Detectors (STUBBED — v0.3) ──
// The tree-sitter integration was partially implemented with incorrect
// API types. Removing for now; will be properly re-integrated in v0.3.
// See git history for the removed implementations of:
//   detectNarrativeCommentsTS, detectAsAnyTS,
//   detectHallucinatedImportsTS, detectSwallowedExceptionTS,
//   detectGenericNamesTS


// ── Deduplication ───────────────────────────────────────

// dedupDiagnostics removed — will be re-integrated in v0.3 with tree-sitter
// When AST-enhanced detectors return, this dedup function will be needed to
// prefer AST diagnostics over regex equivalents on the same line+rule.

// ── File Analysis Orchestrator ──────────────────────────

async function analyzeFile(
  filePath: string,
  rootDir: string,
  knownDeps: Set<string>,
): Promise<Diagnostic[]> {
  const diagnostics: Diagnostic[] = [];
  const language = languageFromPath(filePath);
  if (!language) return diagnostics;

  if (language !== "typescript" && language !== "javascript" && language !== "python") {
    return diagnostics;
  }

  let content: string;
  try {
    content = await readFileContent(filePath);
  } catch {
    return diagnostics;
  }

  const lines = toLines(content);
  const relPath = relative(rootDir, filePath);

  // ── Run regex detectors (always) ──────────────────────
  diagnostics.push(...detectNarrativeComments(lines, relPath, language));
  diagnostics.push(...detectDecorativeComments(lines, relPath));
  diagnostics.push(...detectTrivialComments(lines, relPath, language));
  diagnostics.push(...detectConsoleLeftovers(lines, relPath, language));
  diagnostics.push(...detectTodoStubs(lines, relPath, language));
  diagnostics.push(...detectGenericNames(lines, relPath, language));
  diagnostics.push(...detectDefensivePatterns(lines, relPath, language));
  diagnostics.push(...detectSwallowedExceptions(lines, relPath, language));

  if (language === "typescript") {
    diagnostics.push(...detectUnsafeCasts(lines, relPath));
  }

  diagnostics.push(...detectHallucinatedImports(content, lines, relPath, language, knownDeps));

  // Tree-sitter enhanced detectors removed — will be re-integrated in v0.3
  // Currently only regex-based detection is active.

  return diagnostics;
}

// ── Engine Definition ───────────────────────────────────

export const astSlopEngine: Engine = {
  name: "ast-slop",
  description:
    "Detects AI-authored code patterns using regex-based context analysis. Flags narrative comments, decorative blocks, trivial restating comments, debug leftovers, TODO stubs, generic variable names, defensive coding patterns, swallowed exceptions, unsafe type casts, and hallucinated imports. Tree-sitter AST enhancements planned for v0.3.",
  supportedLanguages: ["typescript", "javascript", "python"],

  async run(context: EngineContext): Promise<EngineResult> {
    const start = performance.now();

    // Tree-sitter init removed — will be re-integrated in v0.3
    // await initParser();

    // Resolve files to scan
    const files = context.files ?? [];
    if (files.length === 0) {
      return {
        engine: "ast-slop",
        diagnostics: [],
        elapsed: performance.now() - start,
        skipped: true,
        skipReason: "No files to scan (context.files is empty)",
      };
    }

    // Load known dependencies for hallucinated-import detection
    const hasJS = context.languages.includes("typescript") || context.languages.includes("javascript");
    const hasPython = context.languages.includes("python");

    let knownDeps = new Set<string>();
    if (hasJS) {
      knownDeps = await loadPackageDeps(context.rootDirectory);
    }
    if (hasPython) {
      const pyDeps = await loadPythonDeps(context.rootDirectory);
      knownDeps = new Set([...knownDeps, ...pyDeps]);
    }

    // Analyze each file
    const allDiagnostics: Diagnostic[] = [];
    const batchSize = 20;

    for (let i = 0; i < files.length; i += batchSize) {
      const batch = files.slice(i, i + batchSize);
      const results = await Promise.all(
        batch.map((filePath) => analyzeFile(filePath, context.rootDirectory, knownDeps)),
      );
      for (const diags of results) {
        allDiagnostics.push(...diags);
      }
    }

    return {
      engine: "ast-slop",
      diagnostics: allDiagnostics,
      elapsed: performance.now() - start,
      skipped: false,
    };
  },

  async fix(diagnostics: Diagnostic[], context: EngineContext): Promise<FixResult> {
    const fixableRules = new Set([
      "ast-slop/narrative-comment",
      "ast-slop/decorative-comment",
      "ast-slop/trivial-comment",
      "ast-slop/console-leftover",
    ]);

    const fixable = diagnostics.filter(
      (d) => d.fixable && fixableRules.has(d.rule) && d.suggestion?.type === "delete",
    );
    const remaining = diagnostics.filter((d) => !fixableRules.has(d.rule) || !d.fixable);

    const byFile = new Map<string, Diagnostic[]>();
    for (const d of fixable) {
      const list = byFile.get(d.filePath) ?? [];
      list.push(d);
      d.filePath && byFile.set(d.filePath, list);
    }

    const modifiedFiles: string[] = [];

    for (const [relPath, fileDiags] of byFile) {
      const absPath = join(context.rootDirectory, relPath);
      try {
        const content = await readFileContent(absPath);
        const lines = toLines(content);

        const linesToRemove = new Set(fileDiags.map((d) => d.line));

        const newLines = lines
          .filter((l) => !linesToRemove.has(l.num))
          .map((l) => l.text)
          .join("\n");

        const { writeFile } = await import("node:fs/promises");
        await writeFile(absPath, newLines, "utf-8");
        modifiedFiles.push(relPath);
      } catch {
        remaining.push(...fileDiags);
      }
    }

    return {
      fixed: fixable.length - (remaining.length - (diagnostics.length - fixable.length)),
      remaining,
      modifiedFiles,
    };
  },
};
