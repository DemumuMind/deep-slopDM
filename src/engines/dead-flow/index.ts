import { readdir, stat } from "node:fs/promises"
import { join, relative, extname } from "node:path"
import type {
  Engine,
  EngineContext,
  EngineResult,
  Diagnostic,
  Suggestion,
} from "../../types/index.js"
import { readFileContent, toLines } from "../../utils/file-utils.js"
import {
  detectAllAST,
  detectUnusedExportsASTWrapper,
  parseWithTreeSitter,
} from "./ast-detect.js"
import type { ASTNode } from "../../utils/tree-sitter.js"

// ── Helpers ──────────────────────────────────────────────

const TS_JS_EXTENSIONS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
]);

function isRelevantFile(filePath: string): boolean {
  const ext = extname(filePath);
  return TS_JS_EXTENSIONS.has(ext);
}

/** Recursively collect file paths under root, respecting exclude list */
async function collectFiles(
  root: string,
  exclude: string[],
): Promise<string[]> {
  const results: string[] = [];

  async function walk(dir: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (exclude.some((pat) => full.includes(pat))) continue;
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.isFile() && isRelevantFile(full)) {
        results.push(full);
      }
    }
  }

  await walk(root);
  return results;
}

/** Make a diagnostic with sensible defaults */
function makeDiagnostic(
  overrides: Partial<Diagnostic> & Pick<Diagnostic, "filePath" | "rule" | "message" | "line">,
): Diagnostic {
  return {
    engine: "dead-flow",
    severity: "warning",
    column: 1,
    category: "dead-code",
    fixable: true,
    help: "",
    ...overrides,
  };
}

/** Check if a trimmed line is just a closing brace (with optional trailing punctuation) */
function isClosingBraceLine(trimmed: string): boolean {
  return /^\}[;,)\s]*$/.test(trimmed);
}

// ── Pattern: Unreachable code after return/throw/break/continue ──

function detectUnreachableAfterTerminator(
  content: string,
  filePath: string,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const lines = toLines(content);
  const terminatorRe =
    /^\s*(return\b|throw\b|break\b|continue\b)/;

  // Pre-compute brace depth at the START of each line
  const startDepths: number[] = [];
  let depth = 0;
  for (let i = 0; i < lines.length; i++) {
    startDepths.push(depth);
    for (const ch of lines[i].text) {
      if (ch === "{") depth++;
      if (ch === "}") depth--;
    }
  }

  // Detect ALL arrow function and anonymous function expression bodies.
  // This is more general than just array method callbacks — it catches
  // server.tool(), app.get(), router.post(), etc.
  const inCallback = new Set<number>();

  // Strategy 1: Detect array method callbacks (forEach, map, filter, etc.)
  const callbackMethodRe =
    /\.(forEach|map|filter|reduce|find|findIndex|some|every|flatMap|sort)\s*\(/;
  for (let i = 0; i < lines.length; i++) {
    if (!callbackMethodRe.test(lines[i].text)) continue;
    // Find the callback body opening brace
    for (let s = i; s < Math.min(lines.length, i + 6); s++) {
      const lineText = lines[s].text;
      if (
        (lineText.includes("=>") || /function\s*\(/.test(lineText)) &&
        lineText.includes("{")
      ) {
        let depthAfterLine = startDepths[s];
        for (const ch of lineText) {
          if (ch === "{") depthAfterLine++;
          if (ch === "}") depthAfterLine--;
        }
        if (depthAfterLine > startDepths[s]) {
          for (let mark = s + 1; mark < lines.length; mark++) {
            if (startDepths[mark] <= startDepths[s]) break;
            inCallback.add(mark);
          }
        }
        break;
      }
    }
  }

  // Strategy 2: Detect ALL arrow function bodies (`=> {`)
  // Arrow functions return from their own scope, not the enclosing function.
  // Code after the arrow function's closing brace is NOT unreachable.
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].text.includes("=>")) continue;
    // Only match `=> {` (arrow functions with block bodies, not expression bodies)
    if (!/=>\s*\{/.test(lines[i].text)) continue;

    // This line opens an arrow function block body
    let depthAfterLine = startDepths[i];
    for (const ch of lines[i].text) {
      if (ch === "{") depthAfterLine++;
      if (ch === "}") depthAfterLine--;
    }
    if (depthAfterLine > startDepths[i]) {
      for (let mark = i + 1; mark < lines.length; mark++) {
        if (startDepths[mark] <= startDepths[i]) break;
        inCallback.add(mark);
      }
    }
  }

  // Detect catch/finally blocks: mark line indices inside catch/finally bodies
  // FIX: Must handle `} catch (err) {` pattern, not just `catch (err) {`
  const inCatchFinally = new Set<number>();
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].text.trim();
    // Match both `catch (...)` and `} catch (...)` and same for finally
    if (!(/(?:^|})\s*catch\b/.test(trimmed) || /(?:^|})\s*finally\b/.test(trimmed))) continue;

    // Find the opening brace on this line or the next few lines
    let braceLineIdx = -1;
    if (lines[i].text.includes("{")) {
      braceLineIdx = i;
    } else {
      for (let s = i + 1; s < Math.min(lines.length, i + 3); s++) {
        if (lines[s].text.includes("{")) {
          braceLineIdx = s;
          break;
        }
      }
    }
    if (braceLineIdx === -1) continue;

    let depthAfterLine = startDepths[braceLineIdx];
    for (const ch of lines[braceLineIdx].text) {
      if (ch === "{") depthAfterLine++;
      if (ch === "}") depthAfterLine--;
    }
    if (depthAfterLine > startDepths[braceLineIdx]) {
      for (let mark = braceLineIdx + 1; mark < lines.length; mark++) {
        if (startDepths[mark] <= startDepths[braceLineIdx]) break;
        inCatchFinally.add(mark);
      }
    }
  }

  // Detect early-return guard patterns (braced if-block containing only return/throw, no else)
  // Lines inside such an if-block are guard returns — code after the if-block is the normal path
  const guardReturnLines = new Set<number>();
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].text.trim();
    // Match `if (...)  {` — must have an opening brace on this or the next line
    if (!/^if\s*\(/.test(trimmed)) continue;

    // Find the opening brace
    let braceLineIdx = -1;
    if (lines[i].text.includes("{")) {
      braceLineIdx = i;
    } else {
      for (let s = i + 1; s < Math.min(lines.length, i + 3); s++) {
        if (lines[s].text.includes("{")) {
          braceLineIdx = s;
          break;
        }
      }
    }
    if (braceLineIdx === -1) continue;

    // Scan the if-block body: check if it contains ONLY return/throw statements
    // (plus comments/blank lines), and check that there is no else-block
    const ifBodyStart = braceLineIdx + 1;
    let ifBlockEnd = -1;
    let onlyTerminators = true;

    for (let j = ifBodyStart; j < lines.length; j++) {
      if (startDepths[j] <= startDepths[braceLineIdx]) {
        // We've exited the if block
        ifBlockEnd = j;
        break;
      }
      const bodyTrimmed = lines[j].text.trim();
      // Skip empty lines and comments
      if (
        bodyTrimmed === "" ||
        bodyTrimmed.startsWith("//") ||
        bodyTrimmed.startsWith("/*") ||
        bodyTrimmed.startsWith("*")
      ) {
        continue;
      }
      // Skip closing braces
      if (isClosingBraceLine(bodyTrimmed)) {
        continue;
      }
      // Check if it's a return/throw statement
      if (/^return\b|^throw\b/.test(bodyTrimmed)) {
        continue; // This is a terminator — still a guard candidate
      }
      // Any other statement means the if-block does more than just return/throw
      onlyTerminators = false;
    }

    if (!onlyTerminators || ifBlockEnd === -1) continue;

    // Check that there is NO else-block after the if-block
    let nextNonEmpty = ifBlockEnd;
    while (nextNonEmpty < lines.length) {
      const t = lines[nextNonEmpty].text.trim();
      if (t === "" || t.startsWith("//") || t.startsWith("/*") || t.startsWith("*")) {
        nextNonEmpty++;
        continue;
      }
      break;
    }
    if (nextNonEmpty < lines.length) {
      const nextTrimmed = lines[nextNonEmpty].text.trim();
      // If the next non-empty line is `} else` or `else`, there IS an else block
      if (/^}\s*else\b|^else\b/.test(nextTrimmed)) continue;
    }

    // This is a guard if-block: mark all lines inside the if-body as guard returns
    for (let j = ifBodyStart; j < ifBlockEnd; j++) {
      const bodyTrimmed = lines[j].text.trim();
      if (/^return\b|^throw\b/.test(bodyTrimmed)) {
        guardReturnLines.add(j);
      }
    }
  }

  // Also detect braceless guard returns: `if (cond) return;` with no else
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].text.match(terminatorRe);
    if (!match) continue;
    if (guardReturnLines.has(i)) continue; // already marked by braced guard detection

    const terminatorKind = match[1];
    if (terminatorKind !== "return" && terminatorKind !== "throw") continue;

    // Check if this is a braceless guard return
    if (isGuardReturn(lines, startDepths, i)) {
      guardReturnLines.add(i);
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].text.match(terminatorRe);
    if (!match) continue;

    const terminatorKind = match[1];
    const terminatorStartDepth = startDepths[i];

    // Skip returns inside catch/finally blocks — these are exception handlers
    if (inCatchFinally.has(i)) continue;

    // Skip returns inside callbacks (forEach, map, filter, etc.)
    if (inCallback.has(i)) continue;

    // Skip returns on the same line as a callback method call
    // (single-line callback bodies like .forEach(x => { return x; }))
    if (callbackMethodRe.test(lines[i].text)) continue;

    // Skip returns on the same line as an arrow function definition
    // (single-line arrow bodies like `async () => { return x; }`)
    if (/=>\s*\{/.test(lines[i].text)) continue;

    // Skip guard returns (both braced and braceless)
    if (guardReturnLines.has(i)) continue;

    // Check if this line ends with a semicolon or is part of a multi-line statement
    let endLine = i;
    if (
      !lines[i].text.trimEnd().endsWith(";") &&
      !lines[i].text.trimEnd().endsWith("}")
    ) {
      for (let j = i + 1; j < lines.length && j <= i + 5; j++) {
        endLine = j;
        if (
          lines[j].text.includes(";") ||
          lines[j].text.trimEnd().endsWith("}")
        )
          break;
      }
    }

    // Scan for code after the terminator that isn't just whitespace or comments
    for (let j = endLine + 1; j < lines.length; j++) {
      const text = lines[j].text.trim();

      // Stop at structural boundaries (else, catch, finally)
      if (
        text.startsWith("} catch") ||
        text.startsWith("} else") ||
        text.startsWith("} finally")
      )
        break;

      // Skip closing braces (they close blocks but are not code statements)
      // FIX: Also skip `},` `});` and other closing-brace-with-punctuation patterns
      if (isClosingBraceLine(text)) continue;

      // Skip empty lines and comments
      if (
        text === "" ||
        text.startsWith("//") ||
        text.startsWith("/*") ||
        text.startsWith("*")
      )
        continue;

      // DEPTH CHECK: Only flag unreachable if the next code line is at the
      // SAME brace depth as the terminator. If depth decreased, we've exited
      // the block containing the terminator — code is the next statement, not
      // unreachable. If depth increased, we're inside a new nested block that
      // may be independently reachable.
      if (startDepths[j] !== terminatorStartDepth) break;

      // Determine severity: downgrade return-related unreachable code to warning
      const severity: "warning" | "error" = terminatorKind === "return" ? "warning" : "error";

      diagnostics.push(
        makeDiagnostic({
          filePath,
          rule: "dead-flow/unreachable-after-terminator",
          message: `Unreachable code after ${terminatorKind} on line ${lines[i].num}`,
          line: lines[j].num,
          severity,
          help: `Remove or move the unreachable code after the ${terminatorKind} statement on line ${lines[i].num}`,
          suggestion: {
            type: "delete",
            text: "",
            confidence: 0.9,
            reason: `Code after ${terminatorKind} can never execute`,
            range: {
              startLine: lines[j].num,
              startCol: 1,
              endLine: lines[j].num,
              endCol: lines[j].text.length + 1,
            },
          },
          detail: { terminatorKind, terminatorLine: lines[i].num },
        }),
      );
      // Only flag the first unreachable line to avoid noise
      break;
    }
  }

  return diagnostics;
}

/** Check if the terminator at line index `idx` is a braceless guard return
 *  (inside a braceless `if` without `else`). A guard return like
 *  `if (!x) return;` makes subsequent code the normal path, not unreachable. */
function isGuardReturn(
  lines: Array<{ num: number; text: string }>,
  startDepths: number[],
  idx: number,
): boolean {
  // Look backwards for the nearest non-empty, non-comment line
  let prevIdx = idx - 1;
  while (prevIdx >= 0) {
    const prevTrimmed = lines[prevIdx].text.trim();
    if (
      prevTrimmed === "" ||
      prevTrimmed.startsWith("//") ||
      prevTrimmed.startsWith("/*") ||
      prevTrimmed.startsWith("*")
    ) {
      prevIdx--;
      continue;
    }
    break;
  }

  if (prevIdx < 0) return false;

  const prevTrimmed = lines[prevIdx].text.trim();

  // Previous line is `if (...)` without braces — braceless guard
  if (/^if\s*\(/.test(prevTrimmed) && !prevTrimmed.includes("{")) {
    // Check if there's an else after the return
    let nextIdx = idx + 1;
    while (nextIdx < lines.length) {
      const nextTrimmed = lines[nextIdx].text.trim();
      if (
        nextTrimmed === "" ||
        nextTrimmed.startsWith("//") ||
        nextTrimmed.startsWith("/*") ||
        nextTrimmed.startsWith("*")
      ) {
        nextIdx++;
        continue;
      }
      if (nextTrimmed.startsWith("else")) return false; // has else — not a guard
      break;
    }
    return true; // Guard: if without else, no braces
  }

  return false;
}

// ── Pattern: Unreachable code after early returns in if/else ──

function detectUnreachableAfterIfElseReturn(
  content: string,
  filePath: string,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const lines = toLines(content);

  // Pre-compute brace depths
  const startDepths: number[] = [];
  let depth = 0;
  for (let i = 0; i < lines.length; i++) {
    startDepths.push(depth);
    for (const ch of lines[i].text) {
      if (ch === "{") depth++;
      if (ch === "}") depth--;
    }
  }

  // Look for pattern: if (...) { return/throw } else { return/throw } followed by code
  for (let i = 0; i < lines.length; i++) {
    const text = lines[i].text.trim();
    if (!text.startsWith("if") && !text.startsWith("} else if")) continue;

    const ifStartLine = i;

    // Find the end of the if block
    let braceDepth = 0;
    let ifBlockEnd = -1;
    let hasIfTerminator = false;
    let j = i;

    // Find opening brace of if
    while (j < lines.length && !lines[j].text.includes("{")) j++;
    if (j >= lines.length) continue;
    braceDepth = 1;
    j++;

    // Scan if block
    while (j < lines.length && braceDepth > 0) {
      const t = lines[j].text.trim();
      for (const ch of lines[j].text) {
        if (ch === "{") braceDepth++;
        if (ch === "}") braceDepth--;
      }
      if (braceDepth === 0) {
        ifBlockEnd = j;
        break;
      }
      if (/^\s*(return\b|throw\b)/.test(lines[j].text)) {
        hasIfTerminator = true;
      }
      j++;
    }

    if (!hasIfTerminator || ifBlockEnd === -1) continue;

    // Check for else block
    let elseStart = ifBlockEnd + 1;
    while (elseStart < lines.length) {
      const t = lines[elseStart].text.trim();
      if (t === "" || t.startsWith("//")) { elseStart++; continue; }
      break;
    }

    if (elseStart >= lines.length) continue;
    if (!lines[elseStart].text.trim().startsWith("else")) continue;

    // Scan else block
    braceDepth = 0;
    let elseBlockEnd = -1;
    let hasElseTerminator = false;
    let k = elseStart;

    while (k < lines.length && !lines[k].text.includes("{")) k++;
    if (k >= lines.length) continue;
    braceDepth = 1;
    k++;

    while (k < lines.length && braceDepth > 0) {
      for (const ch of lines[k].text) {
        if (ch === "{") braceDepth++;
        if (ch === "}") braceDepth--;
      }
      if (braceDepth === 0) {
        elseBlockEnd = k;
        break;
      }
      if (/^\s*(return\b|throw\b)/.test(lines[k].text)) {
        hasElseTerminator = true;
      }
      k++;
    }

    if (!hasElseTerminator || elseBlockEnd === -1) continue;

    // Both branches terminate — anything after elseBlockEnd in the same scope is unreachable
    // But use depth check: only flag if at the same depth as the if/else construct
    const constructDepth = startDepths[ifStartLine];
    for (let m = elseBlockEnd + 1; m < lines.length; m++) {
      const t = lines[m].text.trim();
      if (isClosingBraceLine(t)) break;
      if (t === "" || t.startsWith("//") || t.startsWith("/*") || t.startsWith("*")) continue;

      // Only flag if the unreachable code is at the same depth as the if/else
      if (startDepths[m] < constructDepth) break;
      if (startDepths[m] > constructDepth) continue;

      diagnostics.push(
        makeDiagnostic({
          filePath,
          rule: "dead-flow/unreachable-after-if-else-return",
          message: `Unreachable code: both if/else branches terminate (lines ${ifStartLine + 1}-${elseBlockEnd + 1})`,
          line: lines[m].num,
          severity: "warning",
          help: "Remove the unreachable code after the if/else that both return/throw",
          suggestion: {
            type: "delete",
            text: "",
            confidence: 0.85,
            reason: "Code after if/else where both branches terminate is unreachable",
            range: {
              startLine: lines[m].num,
              startCol: 1,
              endLine: lines[m].num,
              endCol: lines[m].text.length + 1,
            },
          },
        }),
      );
      break;
    }
  }

  return diagnostics;
}

// ── Pattern: Dead conditionals ───────────────────────────

function detectDeadConditionals(
  content: string,
  filePath: string,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const lines = toLines(content);

  // Patterns that are always truthy or always falsy
  const alwaysTruthy = /^(true|!false|[1-9]\d*|![0]+)$/;  // true, !false, non-zero numbers, !0
  const alwaysFalsy = /^(false|!true|0+|null|undefined|!1)$/; // false, !true, 0, null, undefined, !1

  for (const { num, text } of lines) {
    const trimmed = text.trim();

    // Match if (...) patterns
    const ifMatch = trimmed.match(/^if\s*\(\s*(.+?)\s*\)\s*\{?$/);
    if (!ifMatch) continue;

    const condition = ifMatch[1].trim();

    // Skip complex conditions (contain operators that could vary)
    if (condition.includes("&&") || condition.includes("||") || condition.includes("==") || condition.includes("!=") || condition.includes(">") || condition.includes("<")) continue;

    let deadBranch: "then" | "else" | null = null;

    if (alwaysTruthy.test(condition)) {
      deadBranch = "else";
    } else if (alwaysFalsy.test(condition)) {
      deadBranch = "then";
    }

    if (deadBranch) {
      const branchDesc = deadBranch === "then" ? "if-block" : "else-block";
      diagnostics.push(
        makeDiagnostic({
          filePath,
          rule: "dead-flow/dead-conditional",
          message: `Condition \`${condition}\` is always ${deadBranch === "then" ? "falsy" : "truthy"}, making the ${branchDesc} unreachable`,
          line: num,
          severity: "warning",
          help: `Simplify the conditional — the ${branchDesc} can never execute`,
          suggestion: {
            type: "refactor",
            text: deadBranch === "else" ? "// remove else branch, keep if-body" : "// remove if block, keep else body as direct code",
            confidence: 0.8,
            reason: `Condition is statically determined to always be ${deadBranch === "then" ? "falsy" : "truthy"}`,
          },
          detail: { condition, deadBranch },
        }),
      );
    }
  }

  return diagnostics;
}

// ── Pattern: Unused exports ──────────────────────────────

interface ExportInfo {
  name: string;
  line: number;
  isTypeExport: boolean;
  isDefault: boolean;
}

function extractExports(content: string): ExportInfo[] {
  const exports: ExportInfo[] = [];
  const lines = toLines(content);

  for (const { num, text } of lines) {
    const trimmed = text.trim();

    // export function foo / export const foo / export class Foo / export enum Foo
    const namedExport = trimmed.match(
      /^export\s+(?:default\s+)?(?:function|const|let|var|class|enum|interface|type)\s+(\w+)/,
    );
    if (namedExport) {
      exports.push({
        name: namedExport[1],
        line: num,
        isTypeExport: trimmed.includes("export type ") || trimmed.includes("export interface "),
        isDefault: trimmed.includes("export default"),
      });
      continue;
    }

    // export { foo, bar }
    const braceExport = trimmed.match(/^export\s+(?:type\s+)?\{([^}]+)\}/);
    if (braceExport) {
      const names = braceExport[1].split(",").map((s) => {
        const parts = s.trim().split(/\s+as\s+/);
        return parts[parts.length - 1].trim(); // use the alias if present
      }).filter(Boolean);
      for (const name of names) {
        exports.push({
          name,
          line: num,
          isTypeExport: trimmed.includes("export type {"),
          isDefault: false,
        });
      }
      continue;
    }

    // export default ...
    const defaultExport = trimmed.match(/^export\s+default\s+/);
    if (defaultExport) {
      // export default expression — use "default" as the name
      exports.push({
        name: "default",
        line: num,
        isTypeExport: false,
        isDefault: true,
      });
    }
  }

  return exports;
}

function detectUnusedExports(
  files: Map<string, string>,
  rootDir: string,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  // Build export map: symbol -> list of { filePath, line, isType, isDefault }
  const exportMap = new Map<
    string,
    Array<{ filePath: string; line: number; isType: boolean; isDefault: boolean }>
  >();

  // Build import set: all imported symbols across all files
  const importedSymbols = new Set<string>();

  for (const [filePath, content] of files) {
    const relPath = relative(rootDir, filePath);

    // Collect exports
    const exports = extractExports(content);
    for (const exp of exports) {
      const key = `${relPath}::${exp.name}`;
      if (!exportMap.has(key)) exportMap.set(key, []);
      exportMap.get(key)!.push({
        filePath: relPath,
        line: exp.line,
        isType: exp.isTypeExport,
        isDefault: exp.isDefault,
      });
    }

    // Collect imported names
    // Handle both single-line and multi-line import statements
    const lines = toLines(content);
    for (let li = 0; li < lines.length; li++) {
      const trimmed = lines[li].text.trim();

      // import { Foo, Bar } from '...' (single-line)
      const braceImport = trimmed.match(
        /^import\s+(?:type\s+)?\{([^}]+)\}\s+from\s+['"][^'"]+['"]/,
      );
      if (braceImport) {
        const names = braceImport[1].split(",").map((s) => {
          const parts = s.trim().split(/\s+as\s+/);
          return parts[0].trim(); // the name being imported (before 'as')
        }).filter(Boolean);
        for (const name of names) importedSymbols.add(name);
      }

      // import { (multi-line start) — collect names across lines until closing }
      const multiLineImportStart = trimmed.match(/^import\s+(?:type\s+)?\{\s*$/);
      if (multiLineImportStart) {
        // Read subsequent lines until we find the closing }
        for (let next = li + 1; next < lines.length; next++) {
          const nextTrimmed = lines[next].text.trim();
          if (nextTrimmed.startsWith("}")) break;
          // Each line in the import block is a name (possibly with `as` alias)
          const nameParts = nextTrimmed.split(",").map((s) => {
            const parts = s.trim().split(/\s+as\s+/);
            return parts[0].trim();
          }).filter(Boolean);
          for (const name of nameParts) importedSymbols.add(name);
        }
      }

      // import Foo from '...'
      const defaultImport = trimmed.match(
        /^import\s+(\w+)\s+from\s+['"][^'"]+['"]/,
      );
      if (defaultImport && !trimmed.includes("{")) {
        importedSymbols.add(defaultImport[1]);
      }

      // import * as Foo from '...'
      const nsImport = trimmed.match(/^import\s+\*\s+as\s+(\w+)\s+from/);
      if (nsImport) {
        importedSymbols.add(nsImport[1]);
      }

      // Dynamic imports: import("...").then((m) => m.xxx)
      // Also handles: import("...").then(m => m.xxx)
      const dynamicImport = trimmed.match(
        /import\s*\([^)]*\)\s*\.then\s*\(\s*(?:\((\w+)\)|(\w+))\s*=>\s*\2?\.?(\w+)/,
      );
      if (dynamicImport) {
        // The symbol name accessed from the dynamic import module
        const symbolName = dynamicImport[3];
        if (symbolName) importedSymbols.add(symbolName);
      }

      // Also catch: .then((m) => m.xxxEngine) on separate lines
      // Match lines like: "xxx": () => import("...").then((m) => m.xxxEngine),
      const dynamicThenAccess = trimmed.match(
        /\.then\s*\(\s*\((\w+)\)\s*=>\s*\1\.(\w+)/,
      );
      if (dynamicThenAccess) {
        importedSymbols.add(dynamicThenAccess[2]);
      }

      // Also catch: .then(m => m.xxxEngine) without parens around m
      const dynamicThenAccessNoParens = trimmed.match(
        /\.then\s*\(\s*(\w+)\s*=>\s*\1\.(\w+)/,
      );
      if (dynamicThenAccessNoParens) {
        importedSymbols.add(dynamicThenAccessNoParens[2]);
      }
    }
  }

  // Check each export
  for (const [key, entries] of exportMap) {
    for (const entry of entries) {
      const symbolName = key.split("::").pop()!;

      // Skip type exports — often used for public API / documentation
      if (entry.isType) continue;
      // Skip default exports — they might be used as the module itself
      if (entry.isDefault) continue;
      // Skip React component convention (PascalCase exports)
      if (/^[A-Z]/.test(symbolName)) continue;
      // Skip exports that end in "Engine" — convention for pluggable engines loaded dynamically
      if (/Engine$/.test(symbolName)) continue;

      if (!importedSymbols.has(symbolName)) {
        diagnostics.push(
          makeDiagnostic({
            filePath: entry.filePath,
            rule: "dead-flow/unused-export",
            message: `Exported \`${symbolName}\` is never imported by any other file`,
            line: entry.line,
            severity: "info",
            fixable: true,
            help: `Consider removing the unused export \`${symbolName}\` or adding it to the public API explicitly`,
            suggestion: {
              type: "delete",
              text: "",
              confidence: 0.6,
              reason: "This symbol is exported but never imported elsewhere in the project",
            },
            detail: { symbolName },
          }),
        );
      }
    }
  }

  return diagnostics;
}

// ── Pattern: Unused variables ───────────────────────────

function detectUnusedVariables(
  content: string,
  filePath: string,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const lines = toLines(content);

  // Track declarations: name -> { line, isExported, isReactComponent }
  const declarations = new Map<
    string,
    { line: number; isExported: boolean; isReactComponent: boolean; isType: boolean; isParameter: boolean }
  >();

  // Collect declarations
  for (const { num, text } of lines) {
    const trimmed = text.trim();

    // const/let/var declarations
    const varMatch = trimmed.match(
      /^(?:export\s+)?(?:const|let|var)\s+(\w+)/,
    );
    if (varMatch) {
      const name = varMatch[1];
      declarations.set(name, {
        line: num,
        isExported: trimmed.startsWith("export"),
        isReactComponent: /^[A-Z]/.test(name) && (trimmed.includes("=>") || trimmed.includes("function")),
        isType: false,
        isParameter: false,
      });
      continue;
    }

    // function declarations
    const fnMatch = trimmed.match(
      /^(?:export\s+)?(?:async\s+)?function\s+(\w+)/,
    );
    if (fnMatch) {
      const name = fnMatch[1];
      declarations.set(name, {
        line: num,
        isExported: trimmed.startsWith("export"),
        isReactComponent: /^[A-Z]/.test(name),
        isType: false,
        isParameter: false,
      });
      continue;
    }

    // type/interface declarations
    const typeMatch = trimmed.match(
      /^(?:export\s+)?(?:type|interface)\s+(\w+)/,
    );
    if (typeMatch) {
      declarations.set(typeMatch[1], {
        line: num,
        isExported: trimmed.startsWith("export"),
        isReactComponent: false,
        isType: true,
        isParameter: false,
      });
      continue;
    }

    // Function parameters (simple heuristic for arrow functions)
    const arrowParamMatch = trimmed.match(
      /^(?:export\s+)?(?:const|let)\s+\w+\s*=\s*\(\s*([^)]+)\)\s*=>/,
    );
    if (arrowParamMatch) {
      const params = arrowParamMatch[1].split(",").map((p) => {
        const parts = p.trim().split(":")[0].trim();
        return parts.replace(/^\.\.\./, "").trim();
      });
      for (const param of params) {
        if (param && /^\w+$/.test(param)) {
          declarations.set(param, {
            line: num,
            isExported: false,
            isReactComponent: false,
            isType: false,
            isParameter: true,
          });
        }
      }
    }
  }

  // Build a set of all references (identifiers used but not in declaration position)
  const allContent = content;
  for (const [name, info] of declarations) {
    // Skip underscore-prefixed (intentionally unused convention)
    // Also handles bare _ (destructured placeholder)
    if (name.startsWith('_')) continue;
    // Skip exported items (handled by unused-exports check)
    if (info.isExported) continue;
    // Skip React components (convention: PascalCase exported components)
    if (info.isReactComponent) continue;
    // Skip type/interface declarations (often used in .d.ts or for documentation)
    if (info.isType) continue;
    // Skip function parameters (hard to track accurately with regex)
    if (info.isParameter) continue;

    // Count references: the declaration itself counts as 1, so we need >1 total occurrences
    // Use word-boundary matching to avoid partial matches
    const re = new RegExp(`\\b${escapeRegExp(name)}\\b`, "g");
    const occurrences = (allContent.match(re) ?? []).length;

    if (occurrences <= 1) {
      diagnostics.push(
        makeDiagnostic({
          filePath,
          rule: "dead-flow/unused-variable",
          message: `Variable \`${name}\` is declared but never used`,
          line: info.line,
          severity: "suggestion",
          fixable: true,
          help: `Remove the unused variable \`${name}\` or prefix with _ if intentionally unused`,
          suggestion: {
            type: "delete",
            text: "",
            confidence: 0.7,
            reason: `Variable \`${name}\` is never referenced after its declaration`,
          },
          detail: { variableName: name, referenceCount: occurrences },
        }),
      );
    }
  }

  return diagnostics;
}

/** Escape string for use in RegExp */
function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ── Pattern: Empty blocks ───────────────────────────────

function detectEmptyBlocks(
  content: string,
  filePath: string,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const lines = toLines(content);

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].text.trim();

    // Match constructs that end with { } on same line or { on one line, } on next
    // Pattern 1: if/for/while/try/catch/else/finally/switch followed by { } on same line
    // FIX: Check for comments inside same-line empty blocks (e.g. `catch (e) { /* intentional */ }`)
    const sameLineEmpty = trimmed.match(
      /^(?:if|else|for|while|do|try|catch|finally|switch)\s*\([^)]*\)\s*\{(.*)\}\s*$/,
    );
    if (sameLineEmpty) {
      const innerContent = sameLineEmpty[1].trim();
      // If there's a comment inside the block, skip it for catch/finally
      const construct = trimmed.split("{")[0].trim();
      const isCatchOrFinally = /catch\b/.test(construct) || /finally\b/.test(construct);

      if (isCatchOrFinally) {
        // Report empty catch blocks as fixable (add error handling)
        const catchMatch = construct.match(/catch\s*\(\s*(\w+)\s*\)/)
        const errorVar = catchMatch ? catchMatch[1] : 'error'
        if (/catch\b/.test(construct) && innerContent === '') {
          diagnostics.push(
            makeDiagnostic({
              filePath,
              rule: "dead-flow/empty-block",
              message: `Empty catch block — error is silently swallowed`,
              line: lines[i].num,
              severity: "warning",
              fixable: true,
              help: "Empty catch blocks silently swallow errors. Add console.error() or a TODO comment to handle the error.",
              suggestion: {
                type: "replace",
                text: `${construct} { console.error(${errorVar}) }`,
                range: { startLine: lines[i].num, startCol: 1, endLine: lines[i].num, endCol: lines[i].text.length + 1 },
                confidence: 0.75,
                reason: "Empty catch blocks hide errors. Adding console.error() ensures errors are at least logged.",
              },
            }),
          )
        }
        // Skip finally blocks (common intentional pattern)
        continue
      }

      if (innerContent !== "") {
        // Has content inside — not truly empty, skip
        continue;
      }

      diagnostics.push(
        makeDiagnostic({
          filePath,
          rule: "dead-flow/empty-block",
          message: `Empty block after \`${construct}\``,
          line: lines[i].num,
          severity: "info",
          fixable: false,
          help: "Empty blocks may indicate swallowed logic or placeholder code. Add implementation or a comment explaining intent.",
          suggestion: {
            type: "refactor",
            text: "// TODO: implement",
            confidence: 0.5,
            reason: "Empty block likely indicates missing implementation",
          },
        }),
      );
      continue;
    }

    // Pattern 2: else { } on same line
    const elseEmpty = trimmed.match(/^else\s*\{(.*)\}\s*$/);
    if (elseEmpty) {
      const innerContent = elseEmpty[1].trim();
      if (innerContent === "") {
        diagnostics.push(
          makeDiagnostic({
            filePath,
            rule: "dead-flow/empty-block",
            message: "Empty else block",
            line: lines[i].num,
            severity: "info",
            fixable: false,
            help: "Empty else block may indicate swallowed logic. Add implementation or remove the else clause.",
            suggestion: {
              type: "refactor",
              text: "// TODO: implement",
              confidence: 0.5,
              reason: "Empty else block likely indicates missing implementation",
            },
          }),
        );
      }
      continue;
    }

    // Pattern 3: { on one line, only whitespace/comments, then } — multi-line empty block
    if (trimmed.endsWith("{") && !trimmed.includes("}")) {
      // Check if this is a control-flow construct
      const isControlFlow =
        /^(?:if|else|for|while|do|try|catch|finally|switch)/.test(trimmed) ||
        trimmed === "{";
      if (!isControlFlow) continue;

      let nextLine = i + 1;
      let isEmpty = true;
      let hasComment = false;
      while (nextLine < lines.length) {
        const nextTrimmed = lines[nextLine].text.trim();
        if (nextTrimmed.startsWith("}") || nextTrimmed.startsWith("});")) {
          break;
        }
        if (nextTrimmed !== "") {
          if (nextTrimmed.startsWith("//") || nextTrimmed.startsWith("/*") || nextTrimmed.startsWith("*")) {
            hasComment = true;
          } else {
            isEmpty = false;
            break;
          }
        }
        nextLine++;
      }

      if (isEmpty) {
        const construct = trimmed.split("{")[0].trim() || "block";

        // Skip empty catch/finally blocks that have an intentional comment inside
        const isCatchOrFinallyBlock =
          construct.startsWith("catch") ||
          construct.startsWith("finally") ||
          (trimmed === "{" &&
            i > 0 &&
            (/^\s*}\s*catch\b/.test(lines[i - 1].text) || /^\s*}\s*finally\b/.test(lines[i - 1].text)));
        if (isCatchOrFinallyBlock && hasComment) continue;

        // Report empty catch blocks as fixable (add error handling)
        if (isCatchOrFinallyBlock && construct.startsWith("catch") && !hasComment) {
          const catchMatch = construct.match(/catch\s*\(\s*(\w+)\s*\)/)
          const errorVar = catchMatch ? catchMatch[1] : 'error'
          diagnostics.push(
            makeDiagnostic({
              filePath,
              rule: "dead-flow/empty-block",
              message: `Empty catch block — error is silently swallowed`,
              line: lines[i].num,
              severity: "warning",
              fixable: true,
              help: "Empty catch blocks silently swallow errors. Add console.error() or a TODO comment to handle the error.",
              suggestion: {
                type: "replace",
                text: `${construct} {\n  console.error(${errorVar})\n}`,
                range: { startLine: lines[i].num, startCol: 1, endLine: nextLine + 1, endCol: 1 },
                confidence: 0.7,
                reason: "Empty catch blocks hide errors. Adding console.error() ensures errors are at least logged.",
              },
            }),
          )
          continue
        }

        // Skip empty finally blocks

        diagnostics.push(
          makeDiagnostic({
            filePath,
            rule: "dead-flow/empty-block",
            message: `Empty ${construct} block`,
            line: lines[i].num,
            severity: "info",
            fixable: false,
            help: "Empty blocks may indicate swallowed logic or placeholder code. Add implementation or a comment.",
            suggestion: {
              type: "refactor",
              text: "// TODO: implement",
              confidence: 0.5,
              reason: "Empty block likely indicates missing implementation",
            },
          }),
        );
      }
    }
  }

  return diagnostics;
}

// ── Pattern: Dead code in switch ─────────────────────────

function detectDeadSwitchCases(
  content: string,
  filePath: string,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const lines = toLines(content);

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].text.trim();
    if (!trimmed.startsWith("switch")) continue;

    // Find the switch block
    let braceDepth = 0;
    let j = i;
    while (j < lines.length && !lines[j].text.includes("{")) j++;
    if (j >= lines.length) continue;
    braceDepth = 1;
    j++;

    const cases: Array<{ keyword: string; line: number }> = [];

    while (j < lines.length && braceDepth > 0) {
      const lineText = lines[j].text;
      for (const ch of lineText) {
        if (ch === "{") braceDepth++;
        if (ch === "}") braceDepth--;
      }

      const t = lineText.trim();
      if (t.startsWith("case ") || t.startsWith("default:")) {
        cases.push({
          keyword: t.startsWith("default") ? "default" : "case",
          line: lines[j].num,
        });
      }

      // Check for statements after break/return in the same case
      // Heuristic: if we see break/return and then more code before next case/default
      if (/^\s*(break;|return\b|throw\b|continue;)/.test(lineText) && braceDepth > 0) {
        // Scan ahead for code before the next case
        let nextLineIdx = j + 1;
        while (nextLineIdx < lines.length && braceDepth > 0) {
          const nextTrimmed = lines[nextLineIdx].text.trim();

          // Update brace depth
          for (const ch of lines[nextLineIdx].text) {
            if (ch === "{") braceDepth++;
            if (ch === "}") braceDepth--;
          }

          if (braceDepth <= 0) break;
          if (nextTrimmed.startsWith("case ") || nextTrimmed.startsWith("default:")) break;
          if (nextTrimmed === "" || nextTrimmed.startsWith("//") || nextTrimmed.startsWith("/*") || nextTrimmed.startsWith("*") || nextTrimmed.startsWith("break;")) {
            nextLineIdx++;
            continue;
          }

          diagnostics.push(
            makeDiagnostic({
              filePath,
              rule: "dead-flow/dead-switch-code",
              message: `Unreachable code in switch after break/return on line ${lines[j].num}`,
              line: lines[nextLineIdx].num,
              severity: "warning",
              help: "Remove the unreachable code in this switch case after the terminator statement",
              suggestion: {
                type: "delete",
                text: "",
                confidence: 0.9,
                reason: "Code after break/return/throw in a switch case is unreachable",
                range: {
                  startLine: lines[nextLineIdx].num,
                  startCol: 1,
                  endLine: lines[nextLineIdx].num,
                  endCol: lines[nextLineIdx].text.length + 1,
                },
              },
            }),
          );
          break;
        }
      }

      j++;
    }

    // Check for duplicate/default cases — if a switch has default that is always last and
    // is preceded by a case that already covers all values, that's more complex.
    // For now, just check for case after default (which is unreachable)
    const defaultIdx = cases.findIndex((c) => c.keyword === "default");
    if (defaultIdx !== -1 && defaultIdx < cases.length - 1) {
      for (let k = defaultIdx + 1; k < cases.length; k++) {
        diagnostics.push(
          makeDiagnostic({
            filePath,
            rule: "dead-flow/dead-switch-case-after-default",
            message: `Case on line ${cases[k].line} is unreachable: it appears after the default case`,
            line: cases[k].line,
            severity: "warning",
            help: "Move the default case to the end of the switch, or remove the unreachable case",
            suggestion: {
              type: "refactor",
              text: "// move default to end of switch",
              confidence: 0.85,
              reason: "Cases after default can never be reached",
            },
          }),
        );
      }
    }
  }

  return diagnostics;
}

// ── AST/Regex dedup helper ─────────────────────────────

/** Map of regex rule names that AST rules supersede.
 *  When AST produces a result for one of these, the regex version is dropped. */
const AST_SUPERSEDES_REGEX: Record<string, string> = {
  'dead-flow/unreachable-after-terminator': 'dead-flow/unreachable-after-terminator',
  'dead-flow/dead-conditional': 'dead-flow/dead-conditional',
  'dead-flow/unused-variable': 'dead-flow/unused-variable',
  'dead-flow/unused-export': 'dead-flow/unused-export',
}

/** AST-only rules that regex never produces */
const AST_ONLY_RULES = new Set([
  'dead-flow/dead-after-throw',
  'dead-flow/dead-after-return',
  'dead-flow/dead-after-break',
])

/** Build a dedup key for a diagnostic */
function dedupKey(d: Diagnostic): string {
  return `${d.filePath}:${d.line}:${d.rule}`
}

/** Merge AST and regex diagnostics, preferring AST when both match.
 *  AST-only rules always pass through.
 *  For rules that both AST and regex can produce, AST wins on same file+line. */
function mergeASTAndRegex(
  astDiags: Diagnostic[],
  regexDiags: Diagnostic[],
  astRulesRun: Set<string>,
): Diagnostic[] {
  const result: Diagnostic[] = []
  const seen = new Set<string>()

  // 1. Add all AST diagnostics first (they take priority)
  for (const d of astDiags) {
    const key = dedupKey(d)
    if (!seen.has(key)) {
      seen.add(key)
      result.push(d)
    }
  }

  // 2. Add regex diagnostics that don't collide with AST
  //    Also skip regex rules that AST already ran (even if no AST diag at this line,
  //    the AST result is authoritative — it found nothing, so nothing is there)
  for (const d of regexDiags) {
    const key = dedupKey(d)
    if (seen.has(key)) continue

    // If AST ran this rule for this file, skip the regex version entirely
    // because AST is more accurate — a miss means no issue exists
    const ruleBase = d.rule.replace('dead-flow/', '')
    if (astRulesRun.has(ruleBase)) continue

    seen.add(key)
    result.push(d)
  }

  return result
}

// ── Main Engine ──────────────────────────────────────────

export const deadFlowEngine: Engine = {
  name: 'dead-flow',
  description:
    'Detects dead/unreachable code using AST (tree-sitter) with regex fallback: unreachable code after terminators, dead conditionals, unused exports/variables, empty blocks, and dead switch cases',
  supportedLanguages: ['typescript', 'javascript'],

  async run(context: EngineContext): Promise<EngineResult> {
    const start = Date.now()
    const diagnostics: Diagnostic[] = []
    const { rootDirectory, config, files: specifiedFiles } = context

    // Collect files
    const filePaths = specifiedFiles
      ? specifiedFiles.filter(isRelevantFile)
      : await collectFiles(rootDirectory, config.exclude)

    if (filePaths.length === 0) {
      return {
        engine: 'dead-flow',
        diagnostics: [],
        elapsed: Date.now() - start,
        skipped: true,
        skipReason: 'No TypeScript/JavaScript files found to analyze',
      }
    }

    // Read all files
    const fileContents = new Map<string, string>()
    for (const fp of filePaths) {
      try {
        const content = await readFileContent(fp)
        fileContents.set(fp, content)
      } catch {
        // Skip unreadable files
      }
    }

    // ── Phase 1: AST detection (per-file) ────────────────
    const astDiagnostics: Diagnostic[] = []
    const astMap = new Map<string, ASTNode>()  // For cross-file AST analysis
    const perFileASTRules = new Map<string, Set<string>>()  // filePath -> rules AST ran
    let astAvailable = false

    for (const [fp, content] of fileContents) {
      const relPath = relative(rootDirectory, fp)
      try {
        const astResult = await detectAllAST(content, relPath)
        if (astResult) {
          astAvailable = true
          astDiagnostics.push(...astResult.diagnostics)
          perFileASTRules.set(relPath, astResult.astRules)

          // Also parse for cross-file analysis (unused exports)
          const ast = await parseWithTreeSitter(content, relPath)
          if (ast) astMap.set(relPath, ast)
        }
      } catch {
        // AST parsing failed — will fall back to regex
      }
    }

    // ── Phase 2: AST cross-file detection (unused exports) ──
    let astExportDiags: Diagnostic[] = []
    let astExportRulesRun = false
    if (config.deadCode.unusedExports && astMap.size > 0) {
      try {
        const exportResult = await detectUnusedExportsASTWrapper(astMap, rootDirectory)
        if (exportResult) {
          astExportDiags = exportResult
          astExportRulesRun = true
        }
      } catch {
        // AST export detection failed — will fall back to regex
      }
    }

    // ── Phase 3: Regex detection (fallback) ──────────────
    const regexDiagnostics: Diagnostic[] = []

    for (const [fp, content] of fileContents) {
      const relPath = relative(rootDirectory, fp)

      // 1. Unreachable code after return/throw/break/continue
      if (config.deadCode.unreachableBranches) {
        regexDiagnostics.push(...detectUnreachableAfterTerminator(content, relPath))
      }

      // 2. Unreachable code after early returns in if/else
      if (config.deadCode.unreachableBranches) {
        regexDiagnostics.push(...detectUnreachableAfterIfElseReturn(content, relPath))
      }

      // 3. Dead conditionals
      if (config.deadCode.unreachableBranches) {
        regexDiagnostics.push(...detectDeadConditionals(content, relPath))
      }

      // 5. Unused variables
      if (config.deadCode.unusedVariables) {
        regexDiagnostics.push(...detectUnusedVariables(content, relPath))
      }

      // 6. Empty blocks
      regexDiagnostics.push(...detectEmptyBlocks(content, relPath))

      // 7. Dead code in switch
      if (config.deadCode.unreachableBranches) {
        regexDiagnostics.push(...detectDeadSwitchCases(content, relPath))
      }
    }

    // 4. Unused exports (cross-file analysis)
    if (config.deadCode.unusedExports) {
      regexDiagnostics.push(...detectUnusedExports(fileContents, rootDirectory))
    }

    // ── Phase 4: Merge with dedup ───────────────────────
    // Build the set of AST rules that were successfully run (globally)
    const globalASTRules = new Set<string>()
    if (astAvailable) {
      globalASTRules.add('unreachable-after-terminator')
      globalASTRules.add('unused-variable')
      globalASTRules.add('dead-conditional')
      globalASTRules.add('dead-after-throw')
      globalASTRules.add('dead-after-return')
      globalASTRules.add('dead-after-break')
    }
    if (astExportRulesRun) {
      globalASTRules.add('unused-export')
    }

    // Combine AST and regex, preferring AST
    let merged = mergeASTAndRegex(
      [...astDiagnostics, ...astExportDiags],
      regexDiagnostics,
      globalASTRules,
    )

    // Final dedup (same file + line + rule)
    const seen = new Set<string>()
    const unique = merged.filter((d) => {
      const key = `${d.filePath}:${d.line}:${d.rule}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })

    return {
      engine: 'dead-flow',
      diagnostics: unique,
      elapsed: Date.now() - start,
      skipped: false,
    }
  },
}
