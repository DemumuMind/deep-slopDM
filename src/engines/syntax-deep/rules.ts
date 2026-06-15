import type { Diagnostic } from "../../types/index.js";

import { detectEncodingAnomalies, toLines } from "../../utils/file-utils.js";

import { makeDiagnostic } from "./helpers.js";

// ── Constants ───────────────────────────────────────────

/** Valid JS string escape sequences (excluding octal legacy) */
const VALID_JS_ESCAPES = new Set([
  "n", "r", "t", "b", "f", "v", "0",
  "\\", "'", '"', "`",
  "x", "u", "U",  // followed by hex digits
  // Line separators
  "8", "9",  // \8 and \9 are identity escapes in sloppy mode, but flagged
]);

/** Characters that don't need escaping inside a regex character class [...] */
const UNNECESSARY_CLASS_ESCAPES = new Set([
  ".", "/", "-", " ", ":", ";", ",", "!", "#", "%", "&", "(", ")",
  "<", "=", ">", "@", "]", "^", "_", "`", "{", "}", "|", "~",
]);

/** Unicode control / invisible characters to flag as anomalies */
const UNICODE_ANOMALY_RANGES: Array<{ lo: number; hi: number; name: string }> = [
  { lo: 0x00, hi: 0x08, name: "C0 control char" },
  { lo: 0x0b, hi: 0x0c, name: "C0 control char" },
  { lo: 0x0e, hi: 0x1f, name: "C0 control char" },
  { lo: 0x7f, hi: 0x7f, name: "DEL control char" },
  { lo: 0x200b, hi: 0x200b, name: "zero-width space" },
  { lo: 0x200c, hi: 0x200d, name: "zero-width joiner/non-joiner" },
  { lo: 0x200e, hi: 0x200f, name: "RTL/LTR mark" },
  { lo: 0x202a, hi: 0x202e, name: "RTL/LTR override/embedding" },
  { lo: 0x2066, hi: 0x2069, name: "isolate/override" },
  { lo: 0xfeff, hi: 0xfeff, name: "ZWNBSP/BOM" },
  { lo: 0xfff9, hi: 0xfffb, name: "interlinear annotation" },
];

// ── Check Functions ──────────────────────────────────────

/** 1. BOM & ZWNBSP detection */
export function checkBomAndZwnbsp(
  content: string,
  filePath: string,
  rawBuf: Buffer,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const anomalies = detectEncodingAnomalies(content);

  // BOM at start of file (check raw bytes since readFileContent strips it)
  if (rawBuf.length >= 3 && rawBuf[0] === 0xef && rawBuf[1] === 0xbb && rawBuf[2] === 0xbf) {
    diagnostics.push(
      makeDiagnostic( filePath, "bom-present", "warning", "File starts with UTF-8 BOM (U+FEFF)", "BOM can cause issues with shebangs, concatenation, and some parsers. Remove it.", 1, 1, true, { type: "replace", text: content.startsWith("\uFEFF") ? content.slice(1) : content, range: { startLine: 1, startCol: 1, endLine: 1, endCol: 4 }, confidence: 1, reason: "Strip BOM to normalize file encoding", }, ),
    );
  }

  // ZWNBSP mid-file
  if (anomalies.hasZwnbsp) {
    const lines = toLines(content);
    for (const { num, text } of lines) {
      const idx = text.indexOf("\uFEFF");
      if (idx !== -1) {
        diagnostics.push(
          makeDiagnostic( filePath, "zwnbsp-mid-file", "warning", `Zero-width no-break space (U+FEFF) found at column ${idx + 1}`, "ZWNBSP mid-file is invisible and can cause subtle bugs. Remove it.", num, idx + 1, true, { type: "replace", text: text.replace(/\uFEFF/g, ""), range: { startLine: num, startCol: idx + 1, endLine: num, endCol: idx + 2 }, confidence: 1, reason: "Remove invisible ZWNBSP character", }, ),
        );
      }
    }
  }

  return diagnostics;
}

/** 2 & 3. Line ending checks: CRLF and mixed */
export function checkLineEndings(
  content: string,
  filePath: string,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const anomalies = detectEncodingAnomalies(content);

  if (anomalies.lineEnding === "crlf") {
    // Find first CRLF line for position
    const lines = content.split("\n");
    let firstCrlfLine = 0;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].endsWith("\r")) {
        firstCrlfLine = i + 1;
        break;
      }
    }
    diagnostics.push(
      makeDiagnostic( filePath, "crlf-line-endings", "warning", "File uses CRLF (\\r\\n) line endings throughout", "Normalize to LF for cross-platform consistency. Git core.autocrlf can mask this.", firstCrlfLine || 1, 1, true, { type: "replace", text: content.replace(/\r\n/g, "\n"), confidence: 1, reason: "Normalize CRLF to LF", }, ),
    );
  }

  if (anomalies.lineEnding === "mixed") {
    // Count occurrences
    const crlfCount = (content.match(/\r\n/g) ?? []).length;
    const lfOnlyCount = (content.match(/(?<!\r)\n/g) ?? []).length;
    // Find first mixed instance
    const lines = content.split("\n");
    let firstMixedLine = 0;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].endsWith("\r")) {
        firstMixedLine = i + 1;
        break;
      }
    }
    diagnostics.push(
      makeDiagnostic( filePath, "mixed-line-endings", "warning", `Mixed line endings: ${crlfCount} CRLF and ${lfOnlyCount} LF`, "Mixed line endings cause noisy git diffs and can break some tools. Normalize to LF.", firstMixedLine || 1, 1, true, { type: "replace", text: content.replace(/\r\n/g, "\n"), confidence: 1, reason: "Normalize all line endings to LF", }, { crlfCount, lfOnlyCount }, ),
    );
  }

  return diagnostics;
}

/** 4. Invalid escape sequences in JS/TS string literals */
export function checkInvalidEscapes(
  content: string,
  filePath: string,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const lines = toLines(content);

  // Match string literals (single, double, template) but NOT regex literals
  // We look for backslash-escape sequences inside strings
  const stringLiteralRe = /(?<!(?:^|[^\\])\/(?:[^\\/]|\\.)*)['"`](?:[^'"`\\]|\\.)*['"`]/g;
  // Simpler approach: scan each line for string-like patterns
  const escapeInStringRe = /(["'`])(?:[^\\]|\\.)*?\1/g;

  for (const { num, text } of lines) {
    // Skip comments (rough heuristic)
    const trimmed = text.trimStart();
    if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) {
      continue;
    }

    let match: RegExpExecArray | null;
    escapeInStringRe.lastIndex = 0;
    while ((match = escapeInStringRe.exec(text)) !== null) {
      const fullMatch = match[0];
      const quote = match[1];
      const startPos = match.index;

      // Scan for escape sequences inside this string
      for (let i = 1; i < fullMatch.length - 1; i++) {
        if (fullMatch[i] === "\\") {
          const nextChar = fullMatch[i + 1];
          if (!nextChar) continue;

          // Valid single-char escapes
          if (["n", "r", "t", "b", "f", "v", "\\", "'", '"', "`", "0"].includes(nextChar)) {
            continue;
          }

          // Hex escape \xHH
          if (nextChar === "x") {
            const hexPart = fullMatch.substring(i + 2, i + 4);
            if (/^[0-9a-fA-F]{2}$/.test(hexPart)) {
              i += 3; // skip \xHH
              continue;
            }
            // Invalid \x without 2 hex digits
            diagnostics.push(
              makeDiagnostic( filePath, "invalid-escape-sequence", "warning", `Invalid escape sequence \\x without 2 hex digits`, "Use \\x followed by exactly 2 hex digits, or escape the backslash (\\\\x).", num, startPos + i + 1, true, { type: "replace", text: `\\x`, range: { startLine: num, startCol: startPos + i + 1, endLine: num, endCol: startPos + i + 3 }, confidence: 0.9, reason: "Fix invalid hex escape", }, ),
            );
            continue;
          }

          // Unicode escape \uHHHH or \u{H...}
          if (nextChar === "u") {
            const rest = fullMatch.substring(i + 2);
            if (/^\{[0-9a-fA-F]+\}/.test(rest) || /^[0-9a-fA-F]{4}/.test(rest)) {
              // Valid unicode escape, skip
              const unicodeMatch = rest.match(/^(\{[0-9a-fA-F]+\}|[0-9a-fA-F]{4})/);
              if (unicodeMatch) {
                i += 1 + unicodeMatch[0].length;
              }
              continue;
            }
            continue; // \u without valid unicode — likely a template issue, skip to avoid false positives
          }

          // Line continuation \ followed by newline (in template strings)
          if (nextChar === "\n" || nextChar === "\r") {
            continue;
          }

          // If we get here, it's an unrecognized escape like \s, \d, etc.
          // These are identity escapes in sloppy mode but flagged in strict mode
          // They likely indicate regex-as-string confusion (new RegExp('\\s') vs /\s/)
          if (/[sdwDWbBgBpP]/.test(nextChar)) {
            diagnostics.push(
              makeDiagnostic( filePath, "regex-escape-in-string", "warning", `Escape sequence \\${nextChar} is a regex token but appears in a ${quote}-quoted string`, `If this is meant as a regex pattern, use a regex literal /\\${nextChar}/ instead of a string. If the backslash is literal, escape it as \\\\${nextChar}.`, num, startPos + i + 1, true, { type: "replace", text: `\\\\${nextChar}`, range: { startLine: num, startCol: startPos + i + 1, endLine: num, endCol: startPos + i + 3 }, confidence: 0.7, reason: "Likely regex-as-string confusion; escape the backslash or use a regex literal", }, { escapeChar: nextChar, quoteType: quote }, ),
            );
          }
        }
      }
    }
  }

  return diagnostics;
}

/** 5. Unnecessary regex escapes inside character classes */
export function checkUnnecessaryRegexEscapes(
  content: string,
  filePath: string,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const lines = toLines(content);

  // Find character classes [...]
  const charClassRe = /\[(?:[^\]\\]|\\.)*\]/g;

  for (const { num, text } of lines) {
    // Only look inside regex literals or RegExp constructors
    const regexLiteralRe = /\/(?:[^\\/]|\\.)+\/[gimsuy]*/g;
    const regExpCtorRe = /new\s+RegExp\s*\(\s*(["'`])(?:[^\\]|\\.)*?\1/g;

    // Collect regex bodies
    const regexBodies: { start: number; body: string; kind: "literal" | "ctor" }[] = [];

    let rmatch: RegExpExecArray | null;
    regexLiteralRe.lastIndex = 0;
    while ((rmatch = regexLiteralRe.exec(text)) !== null) {
      regexBodies.push({ start: rmatch.index, body: rmatch[0], kind: "literal" });
    }

    regExpCtorRe.lastIndex = 0;
    while ((rmatch = regExpCtorRe.exec(text)) !== null) {
      regexBodies.push({ start: rmatch.index, body: rmatch[0], kind: "ctor" });
    }

    for (const { start, body } of regexBodies) {
      charClassRe.lastIndex = 0;
      let cmatch: RegExpExecArray | null;
      while ((cmatch = charClassRe.exec(body)) !== null) {
        const classContent = cmatch[0];
        // Scan for escaped chars inside the class
        for (let i = 1; i < classContent.length - 1; i++) {
          if (classContent[i] === "\\") {
            const nextChar = classContent[i + 1];
            if (!nextChar) continue;

            // Check if this escape is unnecessary
            if (UNNECESSARY_CLASS_ESCAPES.has(nextChar)) {
              const absCol = start + cmatch.index + i + 1;
              diagnostics.push(
                makeDiagnostic( filePath, "unnecessary-regex-class-escape", "info", `Unnecessary escape \\${nextChar} inside character class [${classContent}]`, `Inside [...], '${nextChar}' doesn't need escaping. Use ${nextChar} instead of \\${nextChar} for clarity.`, num, absCol + 1, true, { type: "replace", text: nextChar, range: { startLine: num, startCol: absCol + 1, endLine: num, endCol: absCol + 3 }, confidence: 0.95, reason: "Character doesn't need escaping inside a character class", }, { charClass: classContent, escapedChar: nextChar }, ),
              );
            }
          }
        }
      }
    }
  }

  return diagnostics;
}

/** 6. Number precision: floating point literals with >15 significant digits */
export function checkNumberPrecision(
  content: string,
  filePath: string,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const lines = toLines(content);

  // Match numeric literals (JS/TS/Python/Java/etc.)
  const numberRe = /\b(?:0[xX][0-9a-fA-F]+|0[oO][0-7]+|0[bB][01]+|(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)\b/g;

  for (const { num, text } of lines) {
    let match: RegExpExecArray | null;
    numberRe.lastIndex = 0;
    while ((match = numberRe.exec(text)) !== null) {
      const numStr = match[0];

      // Skip hex, octal, binary
      if (/^0[xXoObB]/.test(numStr)) continue;

      // Count significant digits
      const stripped = numStr.replace(/^0+/, "").replace(/[.eE].*$/, "").replace(/^0+/, "");
      const beforeDecimal = numStr.split(/[eE]/)[0];
      const significantDigits = beforeDecimal
        .replace(/^0+/, "")
        .replace(".", "")
        .replace(/^0+/, "")
        .length;

      if (significantDigits > 15) {
        // Check if the number actually loses precision
        const value = parseFloat(numStr);
        const backToString = value.toString();
        // If round-tripping changes the number, it lost precision
        if (backToString !== numStr && !backToString.startsWith(numStr)) {
          diagnostics.push(
            makeDiagnostic( filePath, "precision-loss", "warning", `Numeric literal ${numStr} has ${significantDigits} significant digits — exceeds IEEE 754 double precision (15-17 digits)`, `Runtime value becomes ${value}. Use BigInt for integers or a decimal library for precise arithmetic.`, num, match.index + 1, false, undefined, { original: numStr, runtimeValue: value, significantDigits }, ),
          );
        }
      }
    }
  }

  return diagnostics;
}

/** 7. Unicode anomalies: control chars, zero-width, RTL overrides */
export function checkUnicodeAnomalies(
  content: string,
  filePath: string,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const lines = toLines(content);

  for (const { num, text } of lines) {
    for (let col = 0; col < text.length; col++) {
      const cp = text.codePointAt(col)!;

      for (const range of UNICODE_ANOMALY_RANGES) {
        if (cp >= range.lo && cp <= range.hi) {
          // Skip tab (0x09) and newline (0x0a) — those are normal in source
          if (cp === 0x09 || cp === 0x0a || cp === 0x0d) continue;

          const hex = cp > 0xffff
            ? `U+${cp.toString(16).toUpperCase().padStart(6, "0")}`
            : `U+${cp.toString(16).toUpperCase().padStart(4, "0")}`;

          diagnostics.push(
            makeDiagnostic( filePath, "unicode-anomaly", "warning", `Invisible/control character ${hex} (${range.name}) found at column ${col + 1}`, "This character is invisible in most editors and may indicate a homoglyph attack or copy-paste artifact. Remove it.", num, col + 1, true, { type: "replace", text: "", range: { startLine: num, startCol: col + 1, endLine: num, endCol: col + 2 }, confidence: 1, reason: "Remove invisible/control character", }, { codePoint: cp, hex, anomalyType: range.name }, ),
          );
          break; // only report once per character
        }
      }

      // Skip surrogate pairs
      if (cp > 0xffff) col++;
    }
  }

  return diagnostics;
}

/** 8. Trailing whitespace */
export function checkTrailingWhitespace(
  content: string,
  filePath: string,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const lines = toLines(content);

  for (const { num, text } of lines) {
    // Check for trailing spaces/tabs (but not \r which is part of CRLF)
    const trailingMatch = text.match(/([ \t]+)$/);
    if (trailingMatch) {
      const trailingLen = trailingMatch[1].length;
      const col = text.length - trailingLen + 1;
      diagnostics.push(
        makeDiagnostic( filePath, "trailing-whitespace", "info", `Line has ${trailingLen} trailing whitespace character${trailingLen > 1 ? "s" : ""}`, "Remove trailing whitespace. It creates noisy diffs and wastes space.", num, col, true, { type: "replace", text: text.replace(/[ \t]+$/, ""), range: { startLine: num, startCol: col, endLine: num, endCol: text.length + 1 }, confidence: 1, reason: "Remove trailing whitespace", }, ),
      );
    }
  }

  return diagnostics;
}

/** 9. Missing final newline */
export function checkMissingFinalNewline(
  content: string,
  filePath: string,
): Diagnostic[] {
  if (content.length === 0) return [];

  if (!content.endsWith("\n")) {
    const lineCount = content.split("\n").length;
    return [
      makeDiagnostic( filePath, "missing-final-newline", "info", "File does not end with a newline (\\n)", "POSIX requires files to end with a newline. Some tools may misbehave without it.", lineCount, content.split("\n").pop()!.length + 1, true, { type: "insert", text: "\n", range: { startLine: lineCount, startCol: content.split("\n").pop()!.length + 1, endLine: lineCount, endCol: content.split("\n").pop()!.length + 1 }, confidence: 1, reason: "Add final newline", }, ),
    ];
  }

  return [];
}

/** 10. Inconsistent indentation (mixed tabs and spaces) */
export function checkInconsistentIndentation(
  content: string,
  filePath: string,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const lines = toLines(content);

  let tabIndented = 0;
  let spaceIndented = 0;
  const mixedLines: { num: number; indent: string }[] = [];

  for (const { num, text } of lines) {
    if (text.length === 0) continue;

    const indentMatch = text.match(/^([\t ]+)/);
    if (!indentMatch) continue;

    const indent = indentMatch[1];
    const hasTab = indent.includes("\t");
    const hasSpace = indent.includes(" ");

    if (hasTab && hasSpace) {
      // Mixed tabs AND spaces on same line — always wrong
      mixedLines.push({ num, indent });
    } else if (hasTab) {
      tabIndented++;
    } else if (hasSpace) {
      spaceIndented++;
    }
  }

  // Report individual mixed lines (tabs+spaces on same line)
  for (const { num, indent } of mixedLines) {
    diagnostics.push(
      makeDiagnostic( filePath, "mixed-indent-line", "warning", `Line mixes tabs and spaces in indentation: ${JSON.stringify(indent)}`, "Use consistent indentation (either all tabs or all spaces) within the same file.", num, 1, true, { type: "replace", text: indent.replace(/\t/g, "    "), range: { startLine: num, startCol: 1, endLine: num, endCol: indent.length + 1 }, confidence: 0.8, reason: "Normalize to consistent indentation", }, { indent }, ),
    );
  }

  // Report file-level inconsistency (some lines tab, some space)
  if (mixedLines.length === 0 && tabIndented > 0 && spaceIndented > 0) {
    const firstTabLine = lines.find((l) => l.text.match(/^\t/));
    const firstSpaceLine = lines.find((l) => l.text.match(/^ /));

    diagnostics.push(
      makeDiagnostic( filePath, "inconsistent-indent-style", "info", `File uses both tabs (${tabIndented} lines) and spaces (${spaceIndented} lines) for indentation`, "Pick one style and apply it consistently. Consider using an .editorconfig file.", firstTabLine?.num ?? firstSpaceLine?.num ?? 1, 1, true, undefined, { tabLines: tabIndented, spaceLines: spaceIndented }, ),
    );
  }

  return diagnostics;
}

