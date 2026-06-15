// ── Dup-Detect Engine (Calibrated) ────────────────────────
// Structural duplicate detection: identical blocks, similar blocks,
// duplicate imports across files, repeated constants, copy-paste functions.
//
// Calibration: reduced false-positive sensitivity
// - Sliding window: 10 lines min, step 5 (was 6/3)
// - Identical-block: merge overlapping windows into regions, 1 diag per pair
// - Similar-block: 90% Jaccard threshold, cross-file only (was 80%)
// - Repeated-constant: 8-char min, 3+ different files, import-path whitelist
// - Copy-paste-function: whitelist interface methods, body >5 lines required
// - Duplicate-import: 15-file threshold, 30% symbol overlap (was 10/50%)

import { extname, relative } from "node:path";
import type {
  Diagnostic,
  Engine,
  EngineContext,
  EngineResult,
  Language,
  Severity,
  Suggestion,
} from "../../types/index.js";
import { readFileContent, toLines, extractImports } from "../../utils/file-utils.js";
import { collectFiles } from "../../utils/discover.js";

// ── Constants (Calibrated) ────────────────────────────────

const IDENTICAL_BLOCK_MIN_LINES = 10;
const SIMILAR_BLOCK_MIN_LINES = 10;
const SIMILARITY_THRESHOLD = 0.9;
const DUPLICATE_IMPORT_MIN_FILES = 15;
const REPEATED_CONSTANT_MIN_CHARS = 8;
const REPEATED_CONSTANT_MIN_OCCURRENCES = 3;
const BLOCK_OVERLAP_STEP = 5; // step size for sliding window
const LARGE_FILE_LINE_LIMIT = 2000; // skip sliding window for files larger than this
const FILE_BATCH_SIZE = 50;
const COPY_PASTE_MIN_BODY_LINES = 5;

// Whitelist for copy-paste-function: interface implementation / boilerplate method names
const COPY_PASTE_NAME_WHITELIST = new Set([
  "run", "fix", "constructor", "get", "set", "init", "handle", "process",
  "execute", "dispose", "close", "open", "start", "stop", "reset", "validate",
]);

const SUPPORTED_EXTS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".py"]);

// ── Internal Types ────────────────────────────────────────

interface CodeBlock {
  filePath: string;
  startLine: number;
  endLine: number;
  normalizedText: string;
  tokenSet?: Set<string>; // only populated when similar-block is enabled
}

interface FunctionDef {
  filePath: string;
  name: string;
  startLine: number;
  endLine: number;
  bodyLineCount: number;
  bodyNormalized: string;
}

interface ImportOccurrence {
  filePath: string;
  line: number;
  source: string;
  symbols: string[];
}

interface StringOccurrence {
  filePath: string;
  line: number;
  col: number;
  value: string;
  raw: string;
  lineText: string;
}

// ── Helpers ───────────────────────────────────────────────

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
    engine: "dup-detect",
    rule: opts.rule,
    severity: opts.severity,
    message: opts.message,
    help: opts.help,
    line: opts.line,
    column: opts.column,
    category: "duplication",
    fixable: opts.fixable,
    suggestion: opts.suggestion,
    detail: opts.detail,
  };
}

/** Determine language from file extension */
const LANG_MAP: Record<string, Language> = {
  ".ts": "typescript",
  ".tsx": "typescript",
  ".js": "javascript",
  ".jsx": "javascript",
  ".mjs": "javascript",
  ".cjs": "javascript",
  ".py": "python",
};

function languageFromPath(filePath: string): Language | null {
  return LANG_MAP[extname(filePath)] ?? null;
}

/** Normalize a line: strip leading/trailing whitespace, remove comments */
function normalizeLine(line: string, lang: Language | null): string {
  let trimmed = line.trim();

  // Remove single-line comments
  if (lang === "python") {
    const hashIdx = trimmed.indexOf("#");
    if (hashIdx >= 0) {
      trimmed = trimmed.slice(0, hashIdx).trimEnd();
    }
  } else {
    const slashIdx = trimmed.indexOf("//");
    if (slashIdx >= 0) {
      trimmed = trimmed.slice(0, slashIdx).trimEnd();
    }
  }

  return trimmed;
}

/** Normalize a block of lines into a single string */
function normalizeBlock(lines: string[], lang: Language | null): string {
  return lines
    .map((l) => normalizeLine(l, lang))
    .filter((l) => l.length > 0)
    .join("\n");
}

/** Tokenize a line into meaningful tokens (identifiers, operators, literals) */
function tokenizeLine(line: string): string[] {
  return line
    .split(/[\s{}()\[\];,.<>:=+\-*/&|!~^%]+/)
    .filter((t) => t.length > 0);
}

/** Compute Jaccard similarity between two sets */
function jaccardSimilarity<T>(a: Set<T>, b: Set<T>): number {
  if (a.size === 0 && b.size === 0) return 1;
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const item of a) {
    if (b.has(item)) intersection++;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/** Extract all code blocks of a given size from lines using a sliding window */
function extractBlocks(
  lines: { num: number; text: string }[],
  blockSize: number,
  step: number,
  filePath: string,
  lang: Language | null,
  includeTokenSets: boolean,
): CodeBlock[] {
  const blocks: CodeBlock[] = [];
  for (let i = 0; i <= lines.length - blockSize; i += step) {
    const slice = lines.slice(i, i + blockSize);
    const rawLines = slice.map((l) => l.text);
    const normalizedText = normalizeBlock(rawLines, lang);
    if (normalizedText.length < 10) continue;

    let tokenSet: Set<string> | undefined;
    if (includeTokenSets) {
      tokenSet = new Set<string>();
      for (const line of rawLines) {
        const normalized = normalizeLine(line, lang);
        if (normalized.length > 0) {
          for (const tok of tokenizeLine(normalized)) {
            tokenSet.add(tok);
          }
        }
      }
    }

    blocks.push({
      filePath,
      startLine: slice[0].num,
      endLine: slice[slice.length - 1].num,
      normalizedText,
      tokenSet,
    });
  }
  return blocks;
}

/** Extract function definitions using regex (JS/TS/Python) */
function extractFunctions(
  content: string,
  filePath: string,
  lang: Language | null,
): FunctionDef[] {
  const lines = toLines(content);
  const functions: FunctionDef[] = [];

  if (lang === "typescript" || lang === "javascript") {
    const funcStartRe = /^\s*(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(/;
    const arrowFuncRe = /^\s*(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?(?:\([^)]*\)|[a-zA-Z_]\w*)\s*=>/;
    const methodRe = /^\s*(?:(?:public|private|protected|static|async|abstract)\s+)*(\w+)\s*\([^)]*\)\s*(?::\s*[^{]+)?\{/;

    for (let i = 0; i < lines.length; i++) {
      const { num, text } = lines[i];
      const trimmed = text.trim();

      let funcName: string | null = null;
      const funcMatch = trimmed.match(funcStartRe);
      const arrowMatch = trimmed.match(arrowFuncRe);
      const methodMatch = trimmed.match(methodRe);

      if (funcMatch) {
        funcName = funcMatch[1];
      } else if (arrowMatch) {
        funcName = arrowMatch[1];
      } else if (methodMatch && !trimmed.startsWith("if") && !trimmed.startsWith("for") && !trimmed.startsWith("while") && !trimmed.startsWith("switch") && !trimmed.startsWith("catch") && !trimmed.startsWith("class") && !trimmed.startsWith("constructor")) {
        funcName = methodMatch[1];
      }

      if (funcName) {
        const { endLine, bodyLines } = extractBraceBody(lines, i);
        const bodyLineCount = bodyLines.filter((l) => l.trim().length > 0).length;
        const bodyNormalized = bodyLines
          .map((l) => normalizeLine(l, lang))
          .filter((l) => l.length > 0)
          .join("\n");

        if (bodyNormalized.length > 20) {
          functions.push({
            filePath,
            name: funcName,
            startLine: num,
            endLine,
            bodyLineCount,
            bodyNormalized,
          });
        }
      }
    }
  }

  if (lang === "python") {
    const defRe = /^\s*def\s+(\w+)\s*\(/;
    for (let i = 0; i < lines.length; i++) {
      const { num, text } = lines[i];
      const match = text.match(defRe);
      if (match) {
        const funcName = match[1];
        const { endLine, bodyLines } = extractPythonBody(lines, i);
        const bodyLineCount = bodyLines.filter((l) => l.trim().length > 0).length;
        const bodyNormalized = bodyLines
          .map((l) => normalizeLine(l, lang))
          .filter((l) => l.length > 0)
          .join("\n");

        if (bodyNormalized.length > 20) {
          functions.push({
            filePath,
            name: funcName,
            startLine: num,
            endLine,
            bodyLineCount,
            bodyNormalized,
          });
        }
      }
    }
  }

  return functions;
}

/** Extract brace-delimited body from JS/TS starting at given line index */
function extractBraceBody(
  lines: { num: number; text: string }[],
  startIdx: number,
): { endLine: number; bodyLines: string[] } {
  let depth = 0;
  let started = false;
  const bodyLines: string[] = [];
  let endLine = lines[startIdx].num;

  for (let i = startIdx; i < lines.length; i++) {
    const text = lines[i].text;
    for (const ch of text) {
      if (ch === "{") {
        depth++;
        started = true;
      } else if (ch === "}") {
        depth--;
        if (started && depth === 0) {
          endLine = lines[i].num;
          return { endLine, bodyLines };
        }
      }
    }
    if (started && i > startIdx) {
      bodyLines.push(text);
    }
    endLine = lines[i].num;
  }

  return { endLine, bodyLines };
}

/** Extract indented body from Python starting at given line index */
function extractPythonBody(
  lines: { num: number; text: string }[],
  startIdx: number,
): { endLine: number; bodyLines: string[] } {
  const defLine = lines[startIdx].text;
  const defIndent = defLine.length - defLine.trimStart().length;
  const bodyLines: string[] = [];
  let endLine = lines[startIdx].num;

  for (let i = startIdx + 1; i < lines.length; i++) {
    const text = lines[i].text;
    const trimmed = text.trim();
    if (trimmed.length === 0) {
      bodyLines.push(text);
      continue;
    }
    const currentIndent = text.length - text.trimStart().length;
    if (currentIndent <= defIndent && trimmed.length > 0) {
      break;
    }
    bodyLines.push(text);
    endLine = lines[i].num;
  }

  return { endLine, bodyLines };
}

/** Extract named import symbols from raw import text */
function extractNamedSymbols(raw: string, lang: Language | null): string[] {
  if (lang === "typescript" || lang === "javascript") {
    const namedMatch = raw.match(/\{([^}]+)\}/);
    if (namedMatch) {
      return namedMatch[1]
        .split(",")
        .map((s) => s.trim().split(/\s+as\s+/)[0].trim())
        .filter((s) => s.length > 0);
    }
    const defaultMatch = raw.match(/^import\s+(?:type\s+)?(\w+)\s+from/);
    if (defaultMatch) {
      return [defaultMatch[1]];
    }
    const nsMatch = raw.match(/^import\s+\*\s+as\s+(\w+)\s+from/);
    if (nsMatch) {
      return [nsMatch[1]];
    }
  }

  if (lang === "python") {
    const fromMatch = raw.match(/^from\s+[^\s]+\s+import\s+(.+)/);
    if (fromMatch) {
      return fromMatch[1]
        .split(",")
        .map((s) => s.trim().split(/\s+as\s+/)[0].trim())
        .filter((s) => s.length > 0);
    }
    const importMatch = raw.match(/^import\s+(.+)/);
    if (importMatch) {
      return importMatch[1]
        .split(",")
        .map((s) => s.trim().split(/\s+as\s+/)[0].trim())
        .filter((s) => s.length > 0);
    }
  }

  return [];
}

/** Extract string literals from a line */
function extractStringLiterals(line: string, lang: Language | null): { value: string; col: number; raw: string }[] {
  const results: { value: string; col: number; raw: string }[] = [];

  if (lang === "python") {
    const stringRe = /(?<!\\)(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)')/g;
    let m: RegExpExecArray | null;
    while ((m = stringRe.exec(line)) !== null) {
      const value = m[1] ?? m[2] ?? "";
      const col = m.index + 1;
      if (value.length >= REPEATED_CONSTANT_MIN_CHARS) {
        results.push({ value, col, raw: m[0] });
      }
    }
  } else {
    const stringRe = /(?<!\\)(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)')/g;
    let m: RegExpExecArray | null;
    while ((m = stringRe.exec(line)) !== null) {
      const value = m[1] ?? m[2] ?? "";
      const col = m.index + 1;
      if (value.length >= REPEATED_CONSTANT_MIN_CHARS) {
        results.push({ value, col, raw: m[0] });
      }
    }
    const templateRe = /`((?:[^`\\]|\\.)*)`/g;
    while ((m = templateRe.exec(line)) !== null) {
      const value = m[1] ?? "";
      const col = m.index + 1;
      if (value.length >= REPEATED_CONSTANT_MIN_CHARS && !value.includes("${")) {
        results.push({ value, col, raw: m[0] });
      }
    }
  }

  return results;
}

/** Check if a string looks like a meaningful constant (not a URL, path, import, etc.) */
function isConstantCandidate(value: string): boolean {
  // Skip URLs
  if (/^https?:\/\//.test(value)) return false;
  // Skip file paths
  if (/^\/|^\.\.?\//.test(value)) return false;
  // Skip numeric-only strings
  if (/^\d+$/.test(value)) return false;
  // Skip CSS selectors or HTML fragments
  if (/^[.\[]/.test(value)) return false;
  // Skip import paths and module references
  if (/^node_modules/.test(value)) return false;
  // Skip anything that looks like an import source / package name
  // e.g., 'lodash', 'react', './utils', '@org/pkg', 'path', 'fs', etc.
  if (/^[@a-z0-9][-a-z0-9.]*\/[-a-z0-9.@/]*$/i.test(value)) return false;
  // Skip common package names (single word, all lowercase, short)
  if (/^[a-z][-a-z0-9]{1,20}$/.test(value) && value.length <= 20) return false;
  // Skip strings that appear in import/from statements context
  if (/\bimport\b|\bfrom\b|\brequire\b/.test(value)) return false;
  // Skip file extensions and mime types
  if (/^\.[a-z]{1,4}$/.test(value)) return false;
  return true;
}

// ── Rule 1: Identical Block Detection (O(n) hash-based, merged regions) ──

function detectIdenticalBlocks(
  allBlocks: CodeBlock[],
  rootDir: string,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  // Group blocks by normalized text
  const groups = new Map<string, CodeBlock[]>();
  for (const block of allBlocks) {
    let group = groups.get(block.normalizedText);
    if (!group) {
      group = [];
      groups.set(block.normalizedText, group);
    }
    group.push(block);
  }

  // Report groups with 2+ occurrences across different files
  for (const [, group] of groups) {
    const uniqueFiles = new Set(group.map((b) => b.filePath));
    if (group.length < 2 || uniqueFiles.size < 2) continue;

    // Merge overlapping windows within each file into single regions
    const merged = mergeOverlappingBlocks(group);
    if (merged.length < 2) continue;

    // Only report ONE diagnostic per unique pair of regions across files
    const reportedPairs = new Set<string>();
    for (let i = 0; i < merged.length; i++) {
      for (let j = i + 1; j < merged.length; j++) {
        const a = merged[i];
        const b = merged[j];

        // Only report across different files
        if (a.filePath === b.filePath) continue;

        // Create a canonical pair key to avoid duplicate reports
        const pairKey = a.filePath < b.filePath
          ? `${a.filePath}:${a.startLine}-${a.endLine}|${b.filePath}:${b.startLine}-${b.endLine}`
          : `${b.filePath}:${b.startLine}-${b.endLine}|${a.filePath}:${a.startLine}-${a.endLine}`;
        if (reportedPairs.has(pairKey)) continue;
        reportedPairs.add(pairKey);

        const relA = relative(rootDir, a.filePath);
        const relB = relative(rootDir, b.filePath);

        diagnostics.push(
          diag({
            filePath: relA,
            rule: "dup-detect/identical-block",
            severity: "warning",
            message: `Identical code block (${a.endLine - a.startLine + 1} lines) duplicated in ${relB}:${b.startLine}`,
            help: "Extract the duplicated block into a shared utility function or module to reduce maintenance burden.",
            line: a.startLine,
            column: 1,
            fixable: false,
            suggestion: {
              type: "refactor",
              text: `Extract shared logic from ${relA}:${a.startLine}-${a.endLine} and ${relB}:${b.startLine}-${b.endLine} into a common utility.`,
              confidence: 0.85,
              reason: "Identical code blocks across files indicate copy-paste duplication that should be consolidated.",
            },
            detail: {
              duplicateLocations: [
                { file: relA, startLine: a.startLine, endLine: a.endLine },
                { file: relB, startLine: b.startLine, endLine: b.endLine },
              ],
              lineCount: a.endLine - a.startLine + 1,
            },
          }),
        );
      }
    }
  }

  return diagnostics;
}

/** Merge overlapping blocks within each file into single regions.
 *  Two blocks overlap if they share >50% of their lines. */
function mergeOverlappingBlocks(blocks: CodeBlock[]): CodeBlock[] {
  const byFile = new Map<string, CodeBlock[]>();
  for (const b of blocks) {
    let arr = byFile.get(b.filePath);
    if (!arr) {
      arr = [];
      byFile.set(b.filePath, arr);
    }
    arr.push(b);
  }

  const result: CodeBlock[] = [];
  for (const [, fileBlocks] of byFile) {
    if (fileBlocks.length === 0) continue;

    // Sort by start line
    fileBlocks.sort((a, b) => a.startLine - b.startLine);

    // Merge overlapping blocks iteratively
    const merged: CodeBlock[] = [{ ...fileBlocks[0] }];

    for (let i = 1; i < fileBlocks.length; i++) {
      const block = fileBlocks[i];
      const last = merged[merged.length - 1];

      // Calculate overlap: how many lines do they share?
      const overlapStart = Math.max(block.startLine, last.startLine);
      const overlapEnd = Math.min(block.endLine, last.endLine);
      const overlapLines = Math.max(0, overlapEnd - overlapStart + 1);

      const blockLines = block.endLine - block.startLine + 1;
      const lastLines = last.endLine - last.startLine + 1;

      // Share >50% of lines with either block?
      const sharesMajority = overlapLines > blockLines * 0.5 || overlapLines > lastLines * 0.5;

      if (sharesMajority) {
        // Merge: extend the region
        last.endLine = Math.max(last.endLine, block.endLine);
      } else {
        // No significant overlap — start a new merged region
        merged.push({ ...block });
      }
    }

    result.push(...merged);
  }

  return result;
}

// ── Rule 2: Similar Block Detection (cross-file only, 90% Jaccard) ──

function detectSimilarBlocks(
  allBlocks: CodeBlock[],
  rootDir: string,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const reported = new Set<string>();

  // Only process blocks that have tokenSets populated
  const blocksWithTokens = allBlocks.filter((b) => b.tokenSet);
  if (blocksWithTokens.length === 0) return diagnostics;

  // Group by file — only compare ACROSS different files
  const byFile = new Map<string, CodeBlock[]>();
  for (const block of blocksWithTokens) {
    let arr = byFile.get(block.filePath);
    if (!arr) {
      arr = [];
      byFile.set(block.filePath, arr);
    }
    arr.push(block);
  }

  const files = [...byFile.keys()];

  // Pre-compute normalized text keys for identical-block skip
  const normalizedKeys = new Map<CodeBlock, string>();
  for (const block of blocksWithTokens) {
    normalizedKeys.set(block, block.normalizedText);
  }

  // Only compare blocks across DIFFERENT files
  for (let fi = 0; fi < files.length; fi++) {
    for (let fj = fi + 1; fj < files.length; fj++) {
      const blocksA = byFile.get(files[fi])!;
      const blocksB = byFile.get(files[fj])!;

      for (const a of blocksA) {
        for (const b of blocksB) {
          // Skip if identical (already reported by Rule 1)
          if (normalizedKeys.get(a) === normalizedKeys.get(b)) continue;

          const similarity = jaccardSimilarity(a.tokenSet!, b.tokenSet!);
          if (similarity >= SIMILARITY_THRESHOLD) {
            const key = [a.filePath, a.startLine, b.filePath, b.startLine].sort().join(":");
            if (reported.has(key)) continue;
            reported.add(key);

            const relA = relative(rootDir, a.filePath);
            const relB = relative(rootDir, b.filePath);
            const pct = Math.round(similarity * 100);

            diagnostics.push(
              diag({
                filePath: relA,
                rule: "dup-detect/similar-block",
                severity: "info",
                message: `Similar code block (${pct}% token overlap) found in ${relB}:${b.startLine}`,
                help: "Consider extracting shared logic into a common utility. Similar blocks often diverge over time, creating maintenance issues.",
                line: a.startLine,
                column: 1,
                fixable: false,
                suggestion: {
                  type: "refactor",
                  text: `Extract shared logic from ${relA}:${a.startLine}-${a.endLine} and ${relB}:${b.startLine}-${b.endLine} into a parameterized utility.`,
                  confidence: 0.6,
                  reason: `Jaccard similarity of ${pct}% suggests substantial code overlap that could be consolidated.`,
                },
                detail: {
                  similarity: pct,
                  duplicateLocations: [
                    { file: relA, startLine: a.startLine, endLine: a.endLine },
                    { file: relB, startLine: b.startLine, endLine: b.endLine },
                  ],
                },
              }),
            );
          }
        }
      }
    }
  }

  return diagnostics;
}

// ── Rule 3: Duplicate Import Across Files ─────────────────

function detectDuplicateImports(
  allImports: ImportOccurrence[],
  rootDir: string,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  // Group by module source
  const byModule = new Map<string, ImportOccurrence[]>();
  for (const imp of allImports) {
    let arr = byModule.get(imp.source);
    if (!arr) {
      arr = [];
      byModule.set(imp.source, arr);
    }
    arr.push(imp);
  }

  for (const [source, occurrences] of byModule) {
    const uniqueFiles = new Set(occurrences.map((o) => o.filePath));
    // Calibrated: require 15 files (was 10)
    if (uniqueFiles.size < DUPLICATE_IMPORT_MIN_FILES) continue;

    // Build symbol frequency map in a single pass
    const symbolCounts = new Map<string, number>();
    for (const occ of occurrences) {
      for (const sym of occ.symbols) {
        symbolCounts.set(sym, (symbolCounts.get(sym) ?? 0) + 1);
      }
    }

    // Calibrated: find symbols that appear in at least 30% of the importing files (was 50%)
    const threshold = uniqueFiles.size * 0.3;
    const commonSymbols: string[] = [];
    for (const [sym, count] of symbolCounts) {
      if (count >= threshold) {
        commonSymbols.push(sym);
      }
    }
    commonSymbols.sort();

    if (commonSymbols.length === 0) continue;

    const representative = occurrences[0];
    const relPath = relative(rootDir, representative.filePath);

    diagnostics.push(
      diag({
        filePath: relPath,
        rule: "dup-detect/duplicate-import-across-files",
        severity: "info",
        message: `Module "${source}" imported in ${uniqueFiles.size} files with common symbols: ${commonSymbols.join(", ")}`,
        help: `Create a shared re-export (barrel) file for "${source}" that re-exports the common symbols, then import from the barrel in each consumer.`,
        line: representative.line,
        column: 1,
        fixable: false,
        suggestion: {
          type: "refactor",
          text: `Create a barrel file (e.g., shared/${source.replace(/[/@]/g, "_")}.ts) with:\nexport { ${commonSymbols.join(", ")} } from "${source}";`,
          confidence: 0.7,
          reason: `${uniqueFiles.size} files import the same common symbols from "${source}". A barrel file reduces duplication and simplifies future refactoring.`,
        },
        detail: {
          module: source,
          fileCount: uniqueFiles.size,
          commonSymbols,
          files: [...uniqueFiles].map((f) => relative(rootDir, f)),
        },
      }),
    );
  }

  return diagnostics;
}

// ── Rule 4: Repeated Constant (3+ different files, import-path whitelist) ──

function detectRepeatedConstants(
  allStrings: StringOccurrence[],
  rootDir: string,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  // Single-pass frequency map
  const byValue = new Map<string, StringOccurrence[]>();
  for (const occ of allStrings) {
    if (!isConstantCandidate(occ.value)) continue;
    let arr = byValue.get(occ.value);
    if (!arr) {
      arr = [];
      byValue.set(occ.value, arr);
    }
    arr.push(occ);
  }

  for (const [value, occurrences] of byValue) {
    if (occurrences.length < REPEATED_CONSTANT_MIN_OCCURRENCES) continue;

    const uniqueFiles = new Set(occurrences.map((o) => o.filePath));
    // Calibrated: must appear in 3+ DIFFERENT files (was 2)
    if (uniqueFiles.size < REPEATED_CONSTANT_MIN_OCCURRENCES) continue;

    const first = occurrences[0];
    const relPath = relative(rootDir, first.filePath);
    const locations = occurrences.slice(0, 10).map((o) => ({
      file: relative(rootDir, o.filePath),
      line: o.line,
      column: o.col,
    }));

    const suggestedName = toConstantName(value);

    const escapedValue = value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    const fixedLine = first.lineText.replace(first.raw, suggestedName);
    const replacementText = `const ${suggestedName} = "${escapedValue}";\n${fixedLine}`;

    diagnostics.push(
      diag({
        filePath: relPath,
        rule: "dup-detect/repeated-constant",
        severity: "warning",
        message: `String "${value.length > 40 ? value.slice(0, 40) + "..." : value}" repeated ${occurrences.length} times across ${uniqueFiles.size} files`,
        help: `Extract this string to a shared constant (e.g., ${suggestedName}) to avoid duplication and ensure consistency.`,
        line: first.line,
        column: first.col,
        fixable: true,
        suggestion: {
          type: "replace",
          text: replacementText,
          range: {
            startLine: first.line,
            startCol: 1,
            endLine: first.line,
            endCol: first.lineText.length + 1,
          },
          confidence: 0.75,
          reason: `The same string literal appears ${occurrences.length} times. Extracting it to a named constant improves maintainability and prevents typos.`,
        },
        detail: {
          value,
          count: occurrences.length,
          fileCount: uniqueFiles.size,
          locations,
        },
      }),
    );
  }

  return diagnostics;
}

/** Convert a string value to a SCREAMING_SNAKE_CASE constant name */
function toConstantName(value: string): string {
  const words = value
    .replace(/[^a-zA-Z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 0 && !/^\d+$/.test(w))
    .slice(0, 4);

  if (words.length === 0) return "SHARED_CONSTANT";

  return words.map((w) => w.toUpperCase()).join("_");
}

// ── Rule 5: Copy-Paste Function (whitelist + body >5 lines) ──

function detectCopyPasteFunctions(
  allFunctions: FunctionDef[],
  rootDir: string,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  // Pre-filter: skip whitelisted names and functions with body <= 5 lines
  const filtered = allFunctions.filter(
    (fn) => !COPY_PASTE_NAME_WHITELIST.has(fn.name) && fn.bodyLineCount > COPY_PASTE_MIN_BODY_LINES,
  );

  // Group functions by normalized body — O(n)
  const bodyGroups = new Map<string, FunctionDef[]>();
  for (const fn of filtered) {
    let arr = bodyGroups.get(fn.bodyNormalized);
    if (!arr) {
      arr = [];
      bodyGroups.set(fn.bodyNormalized, arr);
    }
    arr.push(fn);
  }

  for (const [, group] of bodyGroups) {
    const uniqueNames = new Set(group.map((f) => f.name));
    if (group.length < 2 || uniqueNames.size < 2) continue;

    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const a = group[i];
        const b = group[j];

        if (a.name === b.name) continue;

        const relA = relative(rootDir, a.filePath);
        const relB = relative(rootDir, b.filePath);

        diagnostics.push(
          diag({
            filePath: relA,
            rule: "dup-detect/copy-paste-function",
            severity: "warning",
            message: `Function "${a.name}" (${relA}:${a.startLine}) has identical body to "${b.name}" (${relB}:${b.startLine})`,
            help: "Extract the shared logic into a single utility function and call it from both locations, parameterizing any differences.",
            line: a.startLine,
            column: 1,
            fixable: false,
            suggestion: {
              type: "refactor",
              text: `Extract shared logic from "${a.name}" and "${b.name}" into a single utility function, parameterizing any behavioral differences.`,
              confidence: 0.9,
              reason: "Functions with identical bodies but different names are classic copy-paste duplication. This creates maintenance risk — fixes must be applied in multiple places.",
            },
            detail: {
              duplicateLocations: [
                { file: relA, name: a.name, startLine: a.startLine, endLine: a.endLine },
                { file: relB, name: b.name, startLine: b.startLine, endLine: b.endLine },
              ],
            },
          }),
        );
      }
    }
  }

  return diagnostics;
}

// ── Main Engine ───────────────────────────────────────────

export const dupDetectEngine: Engine = {
  name: "dup-detect" as const,
  description:
    "Structural duplicate detection: identical blocks, similar blocks, duplicate imports, repeated constants, copy-paste functions",
  supportedLanguages: ["typescript", "javascript", "python"],

  async run(context: EngineContext): Promise<EngineResult> {
    const start = performance.now();
    const diagnostics: Diagnostic[] = [];

    // Check if any supported language is present
    const hasSupported = context.languages.some((l) =>
      this.supportedLanguages.includes(l),
    );
    if (!hasSupported) {
      return {
        engine: this.name,
        diagnostics: [],
        elapsed: performance.now() - start,
        skipped: true,
        skipReason: "No supported languages detected (need typescript, javascript, or python)",
      };
    }

    // Similar-block is opt-in (O(n^2) Jaccard) via env var
    const enableSimilarBlocks = process.env.DEEPSLOP_SIMILAR_BLOCKS === "1";

    // Collect files to scan
    const files = await collectFiles(
      context.rootDirectory,
      context.languages,
      context.config.exclude,
      context.files,
    );

    // Filter to supported extensions only
    const targetFiles = files.filter((f) => SUPPORTED_EXTS.has(extname(f)));

    if (targetFiles.length === 0) {
      return {
        engine: this.name,
        diagnostics: [],
        elapsed: performance.now() - start,
        skipped: true,
        skipReason: "No supported files found to scan",
      };
    }

    // ── Phase 1+2: Read and extract in batches ────────────
    const allBlocks: CodeBlock[] = [];
    const allImports: ImportOccurrence[] = [];
    const allStrings: StringOccurrence[] = [];
    const allFunctions: FunctionDef[] = [];

    for (let batchStart = 0; batchStart < targetFiles.length; batchStart += FILE_BATCH_SIZE) {
      const batch = targetFiles.slice(batchStart, batchStart + FILE_BATCH_SIZE);

      for (const filePath of batch) {
        let content: string;
        try {
          content = await readFileContent(filePath);
        } catch {
          continue;
        }

        const lines = toLines(content);
        const lang = languageFromPath(filePath);

        const isLargeFile = lines.length > LARGE_FILE_LINE_LIMIT;

        if (!isLargeFile) {
          const blocks = extractBlocks(
            lines,
            IDENTICAL_BLOCK_MIN_LINES,
            BLOCK_OVERLAP_STEP,
            filePath,
            lang,
            enableSimilarBlocks,
          );
          allBlocks.push(...blocks);
        }

        // Extract imports (always)
        const imports = extractImports(content, lang ?? "typescript");
        for (const imp of imports) {
          const symbols = extractNamedSymbols(imp.raw, lang);
          allImports.push({
            filePath,
            line: imp.line,
            source: imp.source,
            symbols,
          });
        }

        // Extract string literals (always)
        for (const line of lines) {
          const literals = extractStringLiterals(line.text, lang);
          for (const lit of literals) {
            allStrings.push({
              filePath,
              line: line.num,
              col: lit.col,
              value: lit.value,
              raw: lit.raw,
              lineText: line.text,
            });
          }
        }

        // Extract function definitions (always)
        const functions = extractFunctions(content, filePath, lang);
        allFunctions.push(...functions);

        content = "";
      }
    }

    // ── Phase 3: Run detection rules ────────────────────

    // Rule 1: Identical blocks
    const identicalDiags = detectIdenticalBlocks(allBlocks, context.rootDirectory);
    diagnostics.push(...identicalDiags);

    // Rule 2: Similar blocks (opt-in only — O(n^2) Jaccard)
    if (enableSimilarBlocks) {
      const filesWithBlocks = new Set(allBlocks.map((b) => b.filePath));
      if (filesWithBlocks.size >= 2) {
        const similarDiags = detectSimilarBlocks(allBlocks, context.rootDirectory);
        diagnostics.push(...similarDiags);
      }
    }

    // Rule 3: Duplicate imports across files
    const importDiags = detectDuplicateImports(allImports, context.rootDirectory);
    diagnostics.push(...importDiags);

    // Rule 4: Repeated constants
    const constantDiags = detectRepeatedConstants(allStrings, context.rootDirectory);
    diagnostics.push(...constantDiags);

    // Rule 5: Copy-paste functions
    const funcDiags = detectCopyPasteFunctions(allFunctions, context.rootDirectory);
    diagnostics.push(...funcDiags);

    return {
      engine: this.name,
      diagnostics,
      elapsed: performance.now() - start,
      skipped: false,
    };
  },
};

