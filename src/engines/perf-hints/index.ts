import { readdir } from "node:fs/promises";
import { join, relative, extname } from "node:path";
import type {
  Engine,
  EngineContext,
  EngineResult,
  Diagnostic,
  Suggestion,
} from "../../types/index.js";
import { readFileContent, toLines } from "../../utils/file-utils.js";
import { processFiles } from "../../utils/batch-processor.js";
import type { FileData } from "../../utils/batch-processor.js";

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

/** Make a diagnostic with sensible defaults for perf-hints */
function makeDiagnostic(
  overrides: Partial<Diagnostic> & Pick<Diagnostic, "filePath" | "rule" | "message" | "line">,
): Diagnostic {
  return {
    engine: "perf-hints",
    severity: "info",
    column: 1,
    category: "performance",
    fixable: false,
    help: "",
    ...overrides,
  };
}

// ── Scope tracker: maps line ranges to brace-delimited blocks ──

interface BlockRange {
  /** 0-based line index of the opening brace line */
  startIdx: number;
  /** 0-based line index of the closing brace line */
  endIdx: number;
  /** 1-based line number of the construct header line (e.g. the `for` line) */
  headerLine: number;
  /** Kind of block */
  kind: "for" | "while" | "do" | "forEach" | "map" | "async-function" | "sync-function" | "other";
}

/**
 * Parse the file into block ranges by tracking brace depth.
 * This lets us answer "is line X inside a loop?" or "is line X inside an async function?"
 */
function parseBlocks(lines: { num: number; text: string }[]): BlockRange[] {
  const blocks: BlockRange[] = [];

  // Stack of pending block openings: each entry is the line index where '{' was found
  // plus metadata about what construct opened it.
  const stack: Array<{
    braceLineIdx: number;
    headerLine: number;
    kind: BlockRange["kind"];
  }> = [];

  for (let i = 0; i < lines.length; i++) {
    const text = lines[i].text;

    for (let col = 0; col < text.length; col++) {
      const ch = text[col];

      // Skip characters inside string literals (simplified heuristic)
      if (ch === '"' || ch === "'" || ch === "`") {
        const quote = ch;
        col++;
        while (col < text.length && text[col] !== quote) {
          if (text[col] === "\\") col++; // skip escaped char
          col++;
        }
        continue;
      }

      // Skip comments
      if (ch === "/" && col + 1 < text.length) {
        if (text[col + 1] === "/") break; // rest of line is comment
        if (text[col + 1] === "*") {
          // Skip to */
          const end = text.indexOf("*/", col + 2);
          if (end !== -1) {
            col = end + 1;
          } else {
            // Multi-line block comment: skip rest of this line
            break;
          }
          continue;
        }
      }

      if (ch === "{") {
        // Determine what construct this brace belongs to by scanning backwards
        const kind = detectConstructKind(lines, i, stack.length);
        stack.push({
          braceLineIdx: i,
          headerLine: lines[i].num,
          kind,
        });
      } else if (ch === "}") {
        if (stack.length > 0) {
          const opener = stack.pop()!;
          blocks.push({
            startIdx: opener.braceLineIdx,
            endIdx: i,
            headerLine: opener.headerLine,
            kind: opener.kind,
          });
        }
      }
    }
  }

  return blocks;
}

/**
 * Look at the text before the opening brace on lineIdx to determine what
 * construct this block belongs to.
 */
function detectConstructKind(
  lines: { num: number; text: string }[],
  braceLineIdx: number,
  _depth: number,
): BlockRange["kind"] {
  // Scan upward from the brace line (and on the same line before the brace)
  // to find the construct keyword.
  // We look at the text on the brace line before the '{', and possibly
  // the 1-2 lines above it.

  const chunks: string[] = [];
  // Text on the brace line, before the first '{'
  const braceLine = lines[braceLineIdx].text;
  const bracePos = braceLine.indexOf("{");
  if (bracePos > 0) {
    chunks.push(braceLine.slice(0, bracePos));
  }
  // Look at previous lines (up to 3) to find the construct keyword
  for (let i = braceLineIdx - 1; i >= Math.max(0, braceLineIdx - 3); i--) {
    chunks.unshift(lines[i].text.trim());
  }

  const header = chunks.join(" ");

  // Check for async function / async arrow
  if (/\basync\s+(?:function\b|[\w]+\s*\([^)]*\)\s*=>)/.test(header) ||
      /\basync\s+function\b/.test(header)) {
    return "async-function";
  }

  // Check for sync function
  if (/\bfunction\b/.test(header) || /=>\s*$/.test(chunks[chunks.length - 1])) {
    return "sync-function";
  }

  // Check for loops
  if (/\bfor\b/.test(header)) return "for";
  if (/\bwhile\b/.test(header)) return "while";
  if (/\bdo\b/.test(header)) return "do";

  // Check for forEach / map callbacks — heuristic: .forEach( or .map( in the header
  // and the brace belongs to the callback
  if (/\.(forEach|map|filter|reduce|flatMap|some|every)\s*\(/.test(header)) {
    if (/\.forEach\b/.test(header)) return "forEach";
    if (/\.map\b/.test(header)) return "map";
    // Treat filter/reduce/flatMap/some/every as map-like for perf purposes
    return "map";
  }

  return "other";
}

/** Check if a 0-based line index is inside a block of the given kind(s) */
function isInsideBlock(
  blocks: BlockRange[],
  lineIdx: number,
  kinds: Set<BlockRange["kind"]>,
): BlockRange | null {
  for (const block of blocks) {
    if (lineIdx >= block.startIdx && lineIdx <= block.endIdx && kinds.has(block.kind)) {
      return block;
    }
  }
  return null;
}

// ── Rule 1: N+1 query pattern ───────────────────────────

function detectNPlusOne(
  lines: { num: number; text: string }[],
  filePath: string,
  blocks: BlockRange[],
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  const loopKinds = new Set<BlockRange["kind"]>(["for", "while", "do", "forEach", "map"]);

  // N+1 only triggers when BOTH: (1) inside a for/while/do loop, AND (2) the await
  // is on a database/data-access call. forEach/map with await are NOT N+1 patterns.
  // Common false positive: await inside forEach is sequential, not N+1.
  const dbCallRe = /\.(query|execute|find|findOne|findMany|insertOne|insertMany|updateOne|updateMany|deleteOne|deleteMany|raw|run|exec)\s*\(/;
  // Only for/while/do loops are real N+1 candidates
  const strictLoopKinds = new Set<BlockRange["kind"]>(["for", "while", "do"]);

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].text.trim();

    // Only flag if it's a database call inside a strict loop
    if (dbCallRe.test(trimmed)) {
      const enclosingLoop = isInsideBlock(blocks, i, strictLoopKinds);
      if (enclosingLoop) {
        // Also check for await on the same line
        const hasAwait = /\bawait\b/.test(trimmed);
        const key = `${filePath}:${enclosingLoop.startIdx}:perf-hints/n-plus-one`;
        if (!seenKeys.has(key)) {
          seenKeys.add(key);
          diagnostics.push(
            makeDiagnostic({
              filePath,
              rule: "perf-hints/n-plus-one",
              message: `Database call inside ${describeLoopKind(enclosingLoop.kind)} — potential N+1 query pattern`,
              line: lines[i].num,
              severity: "info",
              help: "Batch database queries outside the loop or use a single query with IN clause to avoid N+1 round trips",
              fixable: false,
              suggestion: {
                type: "refactor",
                text: hasAwait
                  ? "// Collect IDs, then batch: const results = await db.query('SELECT * FROM t WHERE id IN (?)', [ids])"
                  : "// Batch the query outside the loop instead of calling per iteration",
                confidence: 0.75,
                reason: "Performing I/O on every loop iteration causes N+1 round trips; batching reduces this to 1",
              },
              detail: {
                loopKind: enclosingLoop.kind,
                loopHeaderLine: enclosingLoop.headerLine,
                hasAwait,
                isDbCall: true,
              },
            }),
          );
        }
      }
    }
  }

  return diagnostics;
}

// ── Rule 2: React component defined inside another component ──

function detectReactMissingMemo(
  lines: { num: number; text: string }[],
  filePath: string,
  blocks: BlockRange[],
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  // Only flag on .tsx/.jsx files — .ts files that happen to import React are not components
  const isReactFile = /\.(tsx|jsx)$/.test(filePath);
  if (!isReactFile) return diagnostics;

  const functionKinds = new Set<BlockRange["kind"]>(["sync-function", "async-function"]);

  // Find function/arrow declarations inside other function blocks
  // Heuristic: a line that declares a function/const with a PascalCase name and
  // contains JSX (return <...> or => <...>) inside another component function.

  // First, find lines that declare inner functions with PascalCase names
  // Pattern: const InnerComp = () => <...> or function InnerComp() { return <...> }
  const pascalFnRe = /^(?:const|let|function)\s+([A-Z][a-zA-Z0-9]*)\s*(?:=\s*(?:\([^)]*\)|[\w]*)\s*=>|[\s]*\()/;

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].text.trim().match(pascalFnRe);
    if (!match) continue;

    const componentName = match[1];

    // Check if this function is inside another function block
    const enclosingFn = isInsideBlock(blocks, i, functionKinds);
    if (!enclosingFn) continue;

    // Check if the inner function returns JSX (look ahead up to 15 lines)
    const jsxAhead = contentAroundLine(lines, i, 15);
    const hasJsxReturn = /<\s*[A-Za-z][A-Za-z0-9]*(?:\s[^>]*)?\/?>/.test(jsxAhead) ||
                         /React\.createElement/.test(jsxAhead);

    if (!hasJsxReturn) continue;

    diagnostics.push(
      makeDiagnostic({
        filePath,
        rule: "perf-hints/react-missing-memo",
        message: `Component \`${componentName}\` is defined inside another component — recreated on every render`,
        line: lines[i].num,
        severity: "info",
        help: `Move \`${componentName}\` outside the parent component or wrap with useMemo to avoid re-creation on every render`,
        fixable: false,
        suggestion: {
          type: "refactor",
          text: `// Move ${componentName} outside the parent component, or:\n// const ${componentName} = useMemo(() => (...) , [])`,
          confidence: 0.8,
          reason: "Inner component definitions create new function references on every parent render, causing unnecessary child re-renders",
        },
        detail: {
          componentName,
          parentHeaderLine: enclosingFn.headerLine,
        },
      }),
    );
  }

  return diagnostics;
}

/** Get text around a line (N lines ahead from lineIdx, inclusive) */
function contentAroundLine(
  lines: { num: number; text: string }[],
  lineIdx: number,
  ahead: number,
): string {
  const start = lineIdx;
  const end = Math.min(lines.length, lineIdx + ahead);
  const parts: string[] = [];
  for (let i = start; i < end; i++) {
    parts.push(lines[i].text);
  }
  return parts.join("\n");
}

// ── Rule 3: Synchronous file I/O inside async functions ──

function buildSyncInAsyncSuggestion(
  lineText: string,
  methodName: string,
  asyncName: string,
  lineNum: number,
): Suggestion {
  const callRe = new RegExp(
    `\\b(?:(\\w+)\\.)?${methodName}\\s*\\(`,
  );
  const match = lineText.match(callRe);
  let replacement: string;
  if (match && match[1] === "fs") {
    replacement = `await fs.promises.${asyncName}(`;
  } else {
    replacement = `await ${asyncName}(`;
  }
  const fixedLine = match
    ? lineText.replace(callRe, replacement)
    : lineText.replace(methodName, `await ${asyncName}`);
  return {
    type: "replace",
    text: fixedLine,
    range: {
      startLine: lineNum,
      startCol: 1,
      endLine: lineNum,
      endCol: lineText.length + 1,
    },
    confidence: 0.85,
    reason: `Async functions should use the async version ${asyncName} instead of the synchronous ${methodName} to prevent blocking the event loop`,
  };
}

function detectSyncInAsync(
  lines: { num: number; text: string }[],
  filePath: string,
  blocks: BlockRange[],
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  const asyncKinds = new Set<BlockRange["kind"]>(["async-function"]);

  // CLI tools intentionally use sync APIs for simplicity — whitelist them
  const isCliFile = /(?:^|\\|\/)cli(?:\\|\/|[-_.])/i.test(filePath) || /(?:^|\\|\/)cli\./i.test(filePath);

  // Synchronous fs methods
  const syncFsRe = /\b(readFileSync|writeFileSync|appendFileSync|existsSync|mkdirSync|rmdirSync|unlinkSync|renameSync|copyFileSync|readdirSync|statSync|lstatSync|fstatSync|accessSync|readlinkSync|symlinkSync|chmodSync|chownSync|utimesSync|realpathSync|mkdtempSync|truncateSync|openSync|closeSync|readSync|writeSync|fsyncSync|watchFile|unwatchFile)\s*\(/;

  // Sync methods whitelisted for CLI tools (they intentionally use sync for simplicity)
  const cliWhitelist = new Set(["readFileSync", "writeFileSync"]);

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].text.trim();
    const match = trimmed.match(syncFsRe);
    if (!match) continue;

    const methodName = match[1];

    // Skip readFileSync/writeFileSync in CLI files
    if (isCliFile && cliWhitelist.has(methodName)) continue;

    const enclosingAsync = isInsideBlock(blocks, i, asyncKinds);
    if (!enclosingAsync) continue;

    // Derive the async version name (e.g. readFileSync -> readFile)
    const asyncName = methodName.replace(/Sync$/, "");

    diagnostics.push(
      makeDiagnostic({
        filePath,
        rule: "perf-hints/sync-in-async",
        message: `Synchronous \`${methodName}\` inside async function — blocks the event loop`,
        line: lines[i].num,
        severity: "warning",
        help: `Replace \`${methodName}\` with async \`${asyncName}\` to avoid blocking the event loop`,
        fixable: true,
        suggestion: buildSyncInAsyncSuggestion(
          lines[i].text,
          methodName,
          asyncName,
          lines[i].num,
        ),
        detail: {
          syncMethod: methodName,
          asyncMethod: asyncName,
          asyncHeaderLine: enclosingAsync.headerLine,
        },
      }),
    );
  }

  return diagnostics;
}

// ── Rule 4: Large allocation inside loops ───────────────

function detectLargeLoopAllocation(
  lines: { num: number; text: string }[],
  filePath: string,
  blocks: BlockRange[],
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  const loopKinds = new Set<BlockRange["kind"]>(["for", "while", "do", "forEach", "map"]);

  // Typed array constructors — these can be large allocations
  const typedArrayTypes = new Set([
    "Float32Array", "Float64Array", "Int8Array", "Int16Array", "Int32Array",
    "Uint8Array", "Uint16Array", "Uint32Array", "Uint8ClampedArray",
    "BigInt64Array", "BigUint64Array",
  ]);

  // Types that are common accumulation patterns inside loops — skip these
  const skipTypes = new Set(["Map", "Set", "WeakMap", "WeakSet"]);

  // Patterns for allocation — only Array and typed arrays are flagged
  const allocRe = /\bnew\s+(Array|Map|Set|WeakMap|WeakSet|Float32Array|Float64Array|Int8Array|Int16Array|Int32Array|Uint8Array|Uint16Array|Uint32Array|Uint8ClampedArray|BigInt64Array|BigUint64Array)\s*\(/;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].text.trim();

    const arrayMatch = trimmed.match(allocRe);
    if (!arrayMatch) continue;

    const allocType = arrayMatch[1];

    const enclosingLoop = isInsideBlock(blocks, i, loopKinds);
    if (!enclosingLoop) continue;

    // Skip new Map(), new Set(), new WeakMap(), new WeakSet() — common patterns for
    // accumulating results per iteration, not genuine performance problems
    if (skipTypes.has(allocType)) continue;

    const loopDesc = describeLoopKind(enclosingLoop.kind);

    if (allocType === "Array") {
      // Only flag new Array(n) where n > 100 — small arrays in loops are fine
      const sizeMatch = trimmed.match(/\bnew\s+Array\s*\(\s*(\d+)\s*\)/);
      if (!sizeMatch) continue; // new Array() without a numeric size arg — skip
      const size = parseInt(sizeMatch[1], 10);
      if (size <= 100) continue; // small array — not a perf concern

      diagnostics.push(
        makeDiagnostic({
          filePath,
          rule: "perf-hints/large-loop-allocation",
          message: `\`new Array(${size})\` allocation inside ${loopDesc} — consider pre-allocating outside the loop`,
          line: lines[i].num,
          severity: "suggestion",
          help: "Move the array allocation outside the loop and re-use it, or use .push() on a pre-allocated array",
          fixable: false,
          suggestion: {
            type: "refactor",
            text: `// const arr = new Array(${size}); // outside loop\n// arr.fill(0); // reuse per iteration`,
            confidence: 0.5,
            reason: "Repeated large array allocations inside loops create GC pressure; pre-allocating outside the loop is more efficient",
          },
          detail: {
            allocType,
            loopKind: enclosingLoop.kind,
            loopHeaderLine: enclosingLoop.headerLine,
            hasSizeArg: true,
            arraySize: size,
          },
        }),
      );
    } else if (typedArrayTypes.has(allocType)) {
      // Flag new TypedArray inside hot loops — these are typically large buffers
      diagnostics.push(
        makeDiagnostic({
          filePath,
          rule: "perf-hints/large-loop-allocation",
          message: `\`new ${allocType}()\` allocation inside ${loopDesc} — consider pre-allocating outside the loop`,
          line: lines[i].num,
          severity: "suggestion",
          help: `Move the ${allocType} allocation outside the loop to reduce GC pressure`,
          fixable: false,
          suggestion: {
            type: "refactor",
            text: `// const buf = new ${allocType}(...); // allocate once outside the loop`,
            confidence: 0.5,
            reason: "Repeated typed array allocations inside loops create GC pressure; pre-allocating outside the loop is more efficient",
          },
          detail: {
            allocType,
            loopKind: enclosingLoop.kind,
            loopHeaderLine: enclosingLoop.headerLine,
            hasSizeArg: false,
          },
        }),
      );
    }
  }

  return diagnostics;
}

// ── Rule 5: Unnecessary await on non-Promise values ──────

function detectUnnecessaryAwait(
  _content: string,
  _filePath: string,
): Diagnostic[] {
  // DISABLED: This rule flags `await` on non-Promise values, but in TypeScript many
  // values that look like primitives could be Promises (e.g., await fetchResult where
  // fetchResult: Promise<Response>). Since we can't do type inference with regex, this
  // rule is impossible to implement correctly without a type checker. Return empty.
  return [];
}

/** Describe what kind of literal a value is */
function describeLiteral(value: string): string {
  const v = value.replace(/^\(/, "").replace(/\)$/, "").trim();
  if (/^\d+$/.test(v)) return "number";
  if (/^['"`]/.test(v)) return "string";
  if (v === "true" || v === "false") return "boolean";
  if (v === "null") return "null";
  if (v === "undefined") return "undefined";
  return "value";
}

// ── Rule 6: String concatenation in loops ────────────────

function detectStringConcatInLoop(
  lines: { num: number; text: string }[],
  filePath: string,
  blocks: BlockRange[],
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  const loopKinds = new Set<BlockRange["kind"]>(["for", "while", "do", "forEach", "map"]);

  // Only flag when the concatenation involves a template literal OR there are 3+
  // concatenations on the same variable within the same loop. Simple `str += 'x'`
  // patterns are not O(n^2) problems.

  // Pattern: variable += <template literal>
  const templateConcatRe = /\b(\w+)\s*\+=\s*`/;
  // Pattern: variable += any string (used for counting)
  const anyConcatRe = /\b(\w+)\s*\+=\s*["'`]/;

  // First pass: count concatenations per variable per loop block
  const concatCounts = new Map<string, number>(); // key = "varName:blockStartIdx"
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].text.trim();
    const match = trimmed.match(anyConcatRe);
    if (!match) continue;
    const varName = match[1];
    const enclosingLoop = isInsideBlock(blocks, i, loopKinds);
    if (!enclosingLoop) continue;
    const key = `${varName}:${enclosingLoop.startIdx}`;
    concatCounts.set(key, (concatCounts.get(key) ?? 0) + 1);
  }

  // Second pass: only flag template literal concatenations or variables with 3+ concat lines
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].text.trim();
    const enclosingLoop = isInsideBlock(blocks, i, loopKinds);
    if (!enclosingLoop) continue;

    // Check for template literal concatenation
    const templateMatch = trimmed.match(templateConcatRe);
    if (templateMatch) {
      const varName = templateMatch[1];
      const loopDesc = describeLoopKind(enclosingLoop.kind);
      const lineText = lines[i].text;
      const indent = lineText.match(/^(\s*)/)?.[1] ?? "";
      const rhs = trimmed.replace(new RegExp(`^${varName}\\s*\\+=\\s*`), "");
      const replacement = `${indent}${varName} = [${varName}, ${rhs}].join('')`;
      diagnostics.push(
        makeDiagnostic({
          filePath,
          rule: "perf-hints/string-concat-in-loop",
          message: `String concatenation (\`${varName} +=\` with template literal) inside ${loopDesc} — consider using array.join() pattern`,
          line: lines[i].num,
          severity: "warning",
          help: `Use an array to collect strings and join once after the loop, which is O(n) instead of O(n²) for repeated concatenation`,
          fixable: true,
          suggestion: {
            type: "replace",
            text: replacement,
            range: {
              startLine: lines[i].num,
              startCol: 1,
              endLine: lines[i].num,
              endCol: lineText.length + 1,
            },
            confidence: 0.75,
            reason: "Repeated string concatenation with += and template literals inside a loop is O(n²); using array.join() avoids repeated string reallocations.",
          },
          detail: {
            variableName: varName,
            loopKind: enclosingLoop.kind,
            loopHeaderLine: enclosingLoop.headerLine,
          },
        }),
      );
      continue;
    }

    // Check for 3+ concatenations on the same variable in the same loop
    const anyMatch = trimmed.match(anyConcatRe);
    if (anyMatch) {
      const varName = anyMatch[1];
      const key = `${varName}:${enclosingLoop.startIdx}`;
      const count = concatCounts.get(key) ?? 0;
      if (count >= 3) {
        const loopDesc = describeLoopKind(enclosingLoop.kind);
        const lineText = lines[i].text;
        const indent = lineText.match(/^(\s*)/)?.[1] ?? "";
        const rhs = trimmed.replace(new RegExp(`^${varName}\\s*\\+=\\s*`), "");
        const replacement = `${indent}${varName} = [${varName}, ${rhs}].join('')`;
        diagnostics.push(
          makeDiagnostic({
            filePath,
            rule: "perf-hints/string-concat-in-loop",
            message: `String concatenation (\`${varName} +=\`) inside ${loopDesc} — ${count} concatenations found, consider using array.join() pattern`,
            line: lines[i].num,
            severity: "warning",
            help: `Use an array to collect strings and join once after the loop, which is O(n) instead of O(n²) for repeated concatenation`,
            fixable: true,
            suggestion: {
              type: "replace",
              text: replacement,
              range: {
                startLine: lines[i].num,
                startCol: 1,
                endLine: lines[i].num,
                endCol: lineText.length + 1,
              },
              confidence: 0.7,
              reason: `${count} repeated string concatenations with += inside a loop is O(n²); using array.join() avoids repeated string reallocations.`,
            },
            detail: {
              variableName: varName,
              loopKind: enclosingLoop.kind,
              loopHeaderLine: enclosingLoop.headerLine,
              concatCount: count,
            },
          }),
        );
      }
    }
  }

  return diagnostics;
}

// ── Utility ──────────────────────────────────────────────

/** Human-readable loop kind description */
function describeLoopKind(kind: BlockRange["kind"]): string {
  switch (kind) {
    case "for": return "for loop";
    case "while": return "while loop";
    case "do": return "do-while loop";
    case "forEach": return ".forEach() callback";
    case "map": return ".map() callback";
    default: return "loop";
  }
}

/** Global seen-keys set per run to avoid duplicates across rules */
const seenKeys = new Set<string>();

// ── Main Engine ──────────────────────────────────────────

export const perfHintsEngine: Engine = {
  name: "perf-hints" as const,
  description:
    "Performance hints: N+1 query patterns, missing React memoization, sync I/O in async, loop allocations, unnecessary awaits, string concatenation in loops",
  supportedLanguages: ["typescript", "javascript"],

  async run(context: EngineContext): Promise<EngineResult> {
    const start = Date.now();
    const diagnostics: Diagnostic[] = [];
    const { rootDirectory, config, files: specifiedFiles } = context;

    // Reset seen keys for this run
    seenKeys.clear();

    // Collect files
    const filePaths = specifiedFiles
      ? specifiedFiles.filter(isRelevantFile)
      : await collectFiles(rootDirectory, config.exclude);

    if (filePaths.length === 0) {
      return {
        engine: this.name,
        diagnostics: [],
        elapsed: Date.now() - start,
        skipped: true,
        skipReason: "No TypeScript/JavaScript files found to analyze",
      };
    }

    // Read and analyze each file using the shared batch processor
    await processFiles(filePaths, async (file) => {
      const relPath = relative(rootDirectory, file.filePath);

      // Parse block structure for scope-aware detection
      const blocks = parseBlocks(file.lines);

      // Rule 1: N+1 query pattern
      diagnostics.push(...detectNPlusOne(file.lines, relPath, blocks));

      // Rule 2: React component defined inside another component
      diagnostics.push(...detectReactMissingMemo(file.lines, relPath, blocks));

      // Rule 3: Synchronous file I/O inside async functions
      diagnostics.push(...detectSyncInAsync(file.lines, relPath, blocks));

      // Rule 4: Large allocation inside loops
      diagnostics.push(...detectLargeLoopAllocation(file.lines, relPath, blocks));

      // Rule 5: Unnecessary await on non-Promise values
      diagnostics.push(...detectUnnecessaryAwait(file.content, relPath));

      // Rule 6: String concatenation in loops
      diagnostics.push(...detectStringConcatInLoop(file.lines, relPath, blocks));
    });

    // Deduplicate diagnostics (same file + line + rule)
    const seen = new Set<string>();
    const unique = diagnostics.filter((d) => {
      const key = `${d.filePath}:${d.line}:${d.rule}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    return {
      engine: this.name,
      diagnostics: unique,
      elapsed: Date.now() - start,
      skipped: false,
    };
  },
};
