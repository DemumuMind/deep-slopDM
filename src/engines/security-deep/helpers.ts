import type {
  Diagnostic,
  Severity,
  Suggestion,
} from "../../types/index.js";

// ── Helper: build a diagnostic ──────────────────────────

export function makeDiagnostic(
  filePath: string,
  rule: string,
  severity: Severity,
  message: string,
  help: string,
  line: number,
  column: number,
  opts?: {
    fixable?: boolean;
    suggestion?: Suggestion;
    detail?: Record<string, unknown>;
  }
): Diagnostic {
  return {
    filePath,
    engine: "security-deep" as const,
    rule,
    severity,
    message,
    help,
    line,
    column,
    category: "security" as const,
    fixable: opts?.fixable ?? false,
    suggestion: opts?.suggestion,
    detail: opts?.detail,
  };
}

// ── Helper: comment / block-comment state tracking ──────

/**
 * Track whether we are inside a block comment (/* ... *​/) across lines.
 * Returns { skip, inBlockComment } — if skip is true the entire line is a
 * comment and should not be scanned for security patterns.
 */
export function checkCommentState(
  text: string,
  inBlockComment: boolean
): { skip: boolean; inBlockComment: boolean } {
  const trimmed = text.trim();

  // ── Already inside a block comment ───────────────────
  if (inBlockComment) {
    const closeIdx = text.indexOf("*/");
    if (closeIdx === -1) {
      return { skip: true, inBlockComment: true };
    }
    // Block comment closes on this line — check for another opener after
    const afterClose = text.substring(closeIdx + 2);
    const reopenIdx = afterClose.indexOf("/*");
    if (reopenIdx !== -1) {
      const recloseIdx = afterClose.indexOf("*/", reopenIdx + 2);
      return { skip: true, inBlockComment: recloseIdx === -1 };
    }
    return { skip: true, inBlockComment: false };
  }

  // ── Not in a block comment — check line-level markers ─
  if (trimmed.startsWith("#")) {
    return { skip: true, inBlockComment: false };
  }
  if (trimmed.startsWith("//")) {
    return { skip: true, inBlockComment: false };
  }
  if (trimmed.startsWith("/*")) {
    const closeIdx = text.indexOf("*/", text.indexOf("/*") + 2);
    return { skip: true, inBlockComment: closeIdx === -1 };
  }
  if (trimmed.startsWith("*")) {
    const afterStar = trimmed.substring(1).trimStart();
    // Lines like `* result = foo();` are code, not comments
    if (/^[=;(]/.test(afterStar)) {
      return { skip: false, inBlockComment: false };
    }
    const closeIdx = text.indexOf("*/");
    return { skip: true, inBlockComment: closeIdx === -1 };
  }

  // ── Mid-line block comment opener ────────────────────
  const openIdx = text.indexOf("/*");
  if (openIdx !== -1) {
    const afterOpen = text.substring(openIdx + 2);
    const closeIdx = afterOpen.indexOf("*/");
    return { skip: false, inBlockComment: closeIdx === -1 };
  }

  return { skip: false, inBlockComment: false };
}

// ── Helper: detect if a position is inside a string/regex literal ──

/**
 * Returns true when `matchStart` falls inside a string literal ('…"'/`…`/″…″)
 * or a regex literal (/…/) on the given line of text.
 *
 * Heuristic:
 *  - Count unescaped single / double / backtick quotes before `matchStart`.
 *    If any count is odd the match sits inside that kind of string.
 *  - Look for regex-literal contexts (`= /`, `( /`, `, /`, `; /`, `[ /`,
 *    `return /`, etc.) and find the closing `/`.  If the match is between
 *    the opening and closing `/` of a regex, it is inside the regex.
 */
export function isInsideStringOrRegex(text: string, matchStart: number): boolean {
  // ── String-literal check ──────────────────────────────
  let sq = 0, dq = 0, bt = 0;
  for (let i = 0; i < matchStart; i++) {
    // Count consecutive backslashes before this character to detect escaping
    let bs = 0;
    for (let j = i - 1; j >= 0 && text[j] === "\\"; j--) bs++;
    const escaped = bs % 2 === 1;
    if (!escaped) {
      if (text[i] === "'") sq++;
      else if (text[i] === '"') dq++;
      else if (text[i] === "`") bt++;
    }
  }
  if ((sq % 2 === 1) || (dq % 2 === 1) || (bt % 2 === 1)) return true;

  // ── Regex-literal check ───────────────────────────────
  // Scan for `/` that starts a regex literal (preceded by a context that
  // expects an expression, not a division operator).
  const regexPrefix = /[=(:,;\[!&|?{}+\-~^%<> ]$/;
  for (let i = 0; i < matchStart; i++) {
    if (text[i] === "/" && i > 0 && regexPrefix.test(text[i - 1])) {
      // Potential regex start — find the matching closing /
      let j = i + 1;
      for (; j < text.length; j++) {
        if (text[j] === "\\") { j++; continue; } // skip escaped char
        if (text[j] === "/") break; // closing delimiter
        if (text[j] === "[") {
          // Inside character class — skip until ]
          for (j++; j < text.length && text[j] !== "]"; j++) {
            if (text[j] === "\\") j++;
          }
          continue;
        }
      }
      // j is now at the closing / or past end of line
      if (j < text.length && matchStart > i && matchStart < j) {
        return true;
      }
    }
  }

  return false;
}

// ── Helper: test-file detection ─────────────────────────

export function isTestFile(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, "/");
  if (normalized.endsWith(".test.ts") || normalized.endsWith(".spec.ts")) return true;
  if (normalized.endsWith(".test.js") || normalized.endsWith(".spec.js")) return true;
  if (/\/__tests__\//.test(normalized)) return true;
  if (/(?:^|\/)(?:test|tests)\//.test(normalized)) return true;
  return false;
}

// ── Helper: SQL keyword presence check ──────────────────

export function containsSQLKeyword(text: string): boolean {
  return /\b(?:SELECT|INSERT|UPDATE|DELETE|DROP)\b/i.test(text);
}
