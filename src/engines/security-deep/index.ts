// deep-slop-ignore-start ast-slop/copy-paste-signature
// deep-slop-ignore-start ast-slop/narrative-comment
// deep-slop-ignore-start ast-slop/trivial-comment
// deep-slop-ignore-start ast-slop/decorative-comment
// deep-slop-ignore-start ast-slop/as-any
import type {
  Engine,
  EngineContext,
  EngineResult,
  Diagnostic,
  Severity,
  Suggestion,
  FixResult,
} from "../../types/index.js";
import { readFileContent, toLines } from "../../utils/file-utils.js";
import { npmAudit, pnpmAudit, pipAudit, goVulnCheck, cargoAudit } from "../../security/audit.js";
import { detectSecrets } from "../../security/secrets.js";
import { detectHtmlSafety } from "../../security/html-safety.js";

// ── Helper: build a diagnostic ──────────────────────────

function makeDiagnostic(
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
function checkCommentState(
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
function isInsideStringOrRegex(text: string, matchStart: number): boolean {
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

function isTestFile(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, "/");
  if (normalized.endsWith(".test.ts") || normalized.endsWith(".spec.ts")) return true;
  if (normalized.endsWith(".test.js") || normalized.endsWith(".spec.js")) return true;
  if (/\/__tests__\//.test(normalized)) return true;
  if (/(?:^|\/)(?:test|tests)\//.test(normalized)) return true;
  return false;
}

// ── Helper: SQL keyword presence check ──────────────────

function containsSQLKeyword(text: string): boolean {
  return /\b(?:SELECT|INSERT|UPDATE|DELETE|DROP)\b/i.test(text);
}

// ── Rule 1: eval-usage (error) ──────────────────────────

function detectEvalUsage(
  filePath: string,
  lines: { num: number; text: string }[]
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  const evalRe = /\beval\s*\(/;
  const newFunctionRe = /\bnew\s+Function\s*\(/;
  const timerStringRe = /\b(setTimeout|setInterval)\s*\(\s*['"`]/;

  let inBlockComment = false;

  for (const { num, text } of lines) {
    const { skip, inBlockComment: newBlockState } = checkCommentState(text, inBlockComment);
    inBlockComment = newBlockState;
    if (skip) continue;

    // ── eval() ────────────────────────────────────────
    const col = text.search(evalRe);
    if (col !== -1) {
      // Skip if inside a string or regex literal (e.g. diagnostic message text or regex pattern)
      if (isInsideStringOrRegex(text, col)) continue;

      diagnostics.push(
        makeDiagnostic(filePath, "security-deep/eval-usage", "error",
          "Use of eval() allows arbitrary code execution",
          "Replace eval() with a safer alternative such as JSON.parse() for data, or refactor to avoid dynamic code execution.",
          num, col + 1,
          {
            fixable: false,
            suggestion: {
              type: "refactor",
              text: "/* Replace eval() with a safe alternative */",
              confidence: 0.7,
              reason: "eval() enables code injection attacks; use JSON.parse() for data or explicit logic for control flow.",
            },
          }
        )
      );
    }

    // ── new Function() ────────────────────────────────
    const nfCol = text.search(newFunctionRe);
    if (nfCol !== -1) {
      if (isInsideStringOrRegex(text, nfCol)) continue;

      diagnostics.push(
        makeDiagnostic(filePath, "security-deep/eval-usage", "error",
          "new Function() is equivalent to eval() and allows arbitrary code execution",
          "Avoid new Function(). Use closures, callbacks, or pre-defined functions instead.",
          num, nfCol + 1,
          {
            fixable: false,
            suggestion: {
              type: "refactor",
              text: "/* Replace new Function() with a pre-defined function */",
              confidence: 0.7,
              reason: "new Function() creates functions from strings at runtime, enabling injection attacks.",
            },
          }
        )
      );
    }

    // ── setTimeout/setInterval with string ─────────────
    const timerMatch = text.match(timerStringRe);
    if (timerMatch) {
      const timerCol = text.indexOf(timerMatch[1]);
      if (isInsideStringOrRegex(text, timerCol)) continue;

      diagnostics.push(
        makeDiagnostic(filePath, "security-deep/eval-usage", "error",
          `${timerMatch[1]}() called with a string argument acts as eval()`,
          `Pass a function reference instead of a string to ${timerMatch[1]}().`,
          num, timerCol + 1,
          {
            fixable: false,
            suggestion: {
              type: "replace",
              text: `${timerMatch[1]}(() => { /* safe callback */ })`,
              confidence: 0.8,
              reason: "Passing a string to setTimeout/setInterval uses eval-like evaluation; use a function reference.",
            },
          }
        )
      );
    }
  }

  return diagnostics;
}

// ── Rule 2: inner-html (error) ──────────────────────────

function detectInnerHTML(
  filePath: string,
  lines: { num: number; text: string }[]
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  const innerHtmlRe = /\.innerHTML\s*=/;
  const docWriteRe = /\bdocument\s*\.\s*write\s*\(/;

  let inBlockComment = false;

  for (const { num, text } of lines) {
    const { skip, inBlockComment: newBlockState } = checkCommentState(text, inBlockComment);
    inBlockComment = newBlockState;
    if (skip) continue;

    const ihCol = text.search(innerHtmlRe);
    if (ihCol !== -1) {
      if (isInsideStringOrRegex(text, ihCol)) continue;

      diagnostics.push(
        makeDiagnostic(filePath, "security-deep/inner-html", "error",
          "Assignment to .innerHTML can lead to XSS if the value contains user input",
          "Use textContent, innerText, or a sanitization library (e.g., DOMPurify) instead of innerHTML.",
          num, ihCol + 1,
          {
            fixable: false,
            suggestion: {
              type: "replace",
              text: ".textContent = ",
              confidence: 0.6,
              reason: "textContent safely sets text without interpreting HTML, preventing XSS.",
            },
          }
        )
      );
    }

    const dwCol = text.search(docWriteRe);
    if (dwCol !== -1) {
      if (isInsideStringOrRegex(text, dwCol)) continue;

      diagnostics.push(
        makeDiagnostic(filePath, "security-deep/inner-html", "error",
          "document.write() can lead to XSS and breaks incremental rendering",
          "Use DOM manipulation methods (createElement, appendChild) or framework rendering instead of document.write().",
          num, dwCol + 1,
          {
            fixable: false,
            suggestion: {
              type: "refactor",
              text: "/* Replace document.write() with safe DOM manipulation */",
              confidence: 0.7,
              reason: "document.write() can inject arbitrary HTML and overwrites the document if called after parse.",
            },
          }
        )
      );
    }
  }

  return diagnostics;
}

// ── Rule 3: sql-injection (error) ───────────────────────

function detectSQLInjection(
  filePath: string,
  lines: { num: number; text: string }[]
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  const sqlConcatRe = /\b(?:query|execute|raw|run|all|exec|execSql)\s*\(\s*['"`][^'"`]*['"`]\s*\+/;
  const sqlTemplateRe = /\b(?:query|execute|raw|run|all|exec|execSql)\s*\(\s*`[^`]*\$\{/;

  let inBlockComment = false;

  for (const { num, text } of lines) {
    const { skip, inBlockComment: newBlockState } = checkCommentState(text, inBlockComment);
    inBlockComment = newBlockState;
    if (skip) continue;

    const concatCol = text.search(sqlConcatRe);
    if (concatCol !== -1) {
      if (isInsideStringOrRegex(text, concatCol)) continue;
      // Only flag if SQL keywords are present in the concatenation
      if (!containsSQLKeyword(text)) continue;

      diagnostics.push(
        makeDiagnostic(filePath, "security-deep/sql-injection", "error",
          "String concatenation in SQL query detected — potential SQL injection",
          "Use parameterized queries or prepared statements instead of concatenating user input into SQL strings.",
          num, concatCol + 1,
          {
            fixable: false,
            suggestion: {
              type: "refactor",
              text: "/* Use parameterized query: query('SELECT * FROM users WHERE id = ?', [userId]) */",
              confidence: 0.85,
              reason: "Parameterized queries separate SQL logic from data, preventing injection.",
            },
          }
        )
      );
    }

    const tmplCol = text.search(sqlTemplateRe);
    if (tmplCol !== -1) {
      if (isInsideStringOrRegex(text, tmplCol)) continue;
      if (!containsSQLKeyword(text)) continue;

      diagnostics.push(
        makeDiagnostic(filePath, "security-deep/sql-injection", "error",
          "Template literal interpolation in SQL query detected — potential SQL injection",
          "Use parameterized queries or prepared statements instead of interpolating values into SQL strings.",
          num, tmplCol + 1,
          {
            fixable: false,
            suggestion: {
              type: "refactor",
              text: "/* Use parameterized query: query('SELECT * FROM users WHERE id = ?', [userId]) */",
              confidence: 0.85,
              reason: "Template literals embed values directly into SQL; parameterized queries prevent injection.",
            },
          }
        )
      );
    }
  }

  return diagnostics;
}

// ── Rule 4: shell-injection (error) ─────────────────────

function detectShellInjection(
  filePath: string,
  lines: { num: number; text: string }[]
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  const execConcatRe = /\b(?:exec|execSync)\s*\(\s*['"`][^'"`]*['"`]\s*\+/;
  const execTemplateRe = /\b(?:exec|execSync)\s*\(\s*`[^`]*\$\{/;

  let inBlockComment = false;

  for (const { num, text } of lines) {
    const { skip, inBlockComment: newBlockState } = checkCommentState(text, inBlockComment);
    inBlockComment = newBlockState;
    if (skip) continue;

    const concatCol = text.search(execConcatRe);
    if (concatCol !== -1) {
      if (isInsideStringOrRegex(text, concatCol)) continue;

      diagnostics.push(
        makeDiagnostic(filePath, "security-deep/shell-injection", "error",
          "String concatenation in exec/execSync detected — potential shell injection",
          "Use execFile/spawn with an array of arguments instead of exec with string concatenation.",
          num, concatCol + 1,
          {
            fixable: false,
            suggestion: {
              type: "refactor",
              text: "/* Use execFile or spawn with argument array: spawn('cmd', ['arg1', arg2]) */",
              confidence: 0.85,
              reason: "exec() passes strings to a shell; spawn/execFile avoid shell interpretation.",
            },
          }
        )
      );
    }

    const tmplCol = text.search(execTemplateRe);
    if (tmplCol !== -1) {
      if (isInsideStringOrRegex(text, tmplCol)) continue;

      diagnostics.push(
        makeDiagnostic(filePath, "security-deep/shell-injection", "error",
          "Template literal in exec/execSync detected — potential shell injection",
          "Use execFile/spawn with an array of arguments instead of exec with template literals.",
          num, tmplCol + 1,
          {
            fixable: false,
            suggestion: {
              type: "refactor",
              text: "/* Use execFile or spawn with argument array: spawn('cmd', ['arg1', arg2]) */",
              confidence: 0.85,
              reason: "exec() passes strings to a shell; spawn/execFile avoid shell interpretation.",
            },
          }
        )
      );
    }
  }

  return diagnostics;
}

// ── Rule 5: prototype-pollution (warning) ────────────────

function detectPrototypePollution(
  filePath: string,
  lines: { num: number; text: string }[]
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  const objectAssignRe = /\bObject\s*\.\s*assign\s*\(\s*\w+\s*,\s*\w+/;
  const protoRe = /__proto__/;
  const deepMergeRe = /\b(?:deepMerge|deepExtend|mergeDeep|defaultsDeep)\s*\(/;

  let inBlockComment = false;

  for (const { num, text } of lines) {
    const { skip, inBlockComment: newBlockState } = checkCommentState(text, inBlockComment);
    inBlockComment = newBlockState;
    if (skip) continue;

    const oaCol = text.search(objectAssignRe);
    if (oaCol !== -1) {
      if (isInsideStringOrRegex(text, oaCol)) continue;

      diagnostics.push(
        makeDiagnostic(filePath, "security-deep/prototype-pollution", "warning",
          "Object.assign() with user-controlled source may enable prototype pollution",
          "Validate or sanitize the source object before merging, or use Object.assign with a fresh target: Object.assign({}, safeDefaults, userInput).",
          num, oaCol + 1,
          {
            fixable: false,
            suggestion: {
              type: "refactor",
              text: "Object.assign({}, safeDefaults, sanitizedInput)",
              confidence: 0.6,
              reason: "Using a fresh {} target and sanitizing input prevents prototype pollution via __proto__.",
            },
          }
        )
      );
    }

    const protoCol = text.search(protoRe);
    if (protoCol !== -1) {
      if (isInsideStringOrRegex(text, protoCol)) continue;

      diagnostics.push(
        makeDiagnostic(filePath, "security-deep/prototype-pollution", "warning",
          "Direct __proto__ access detected — potential prototype pollution vector",
          "Avoid __proto__ access. Use Object.getPrototypeOf() / Object.setPrototypeOf() or Map instead.",
          num, protoCol + 1,
          {
            fixable: false,
            suggestion: {
              type: "replace",
              text: "/* Use Object.getPrototypeOf() or Map instead of __proto__ */",
              confidence: 0.7,
              reason: "__proto__ can be leveraged for prototype pollution attacks when user input reaches it.",
            },
          }
        )
      );
    }

    const dmCol = text.search(deepMergeRe);
    if (dmCol !== -1) {
      if (isInsideStringOrRegex(text, dmCol)) continue;

      diagnostics.push(
        makeDiagnostic(filePath, "security-deep/prototype-pollution", "warning",
          "Deep merge function detected — ensure inputs are sanitized against prototype pollution",
          "Use a prototype-pollution-safe merge library or explicitly filter __proto__, constructor, and prototype keys.",
          num, dmCol + 1,
          {
            fixable: false,
            suggestion: {
              type: "refactor",
              text: "/* Use a safe merge that ignores __proto__, constructor, and prototype keys */",
              confidence: 0.6,
              reason: "Deep merge utilities can propagate __proto__ properties, leading to prototype pollution.",
            },
          }
        )
      );
    }
  }

  return diagnostics;
}

// ── Rule 6: ssrf-risk (warning) ─────────────────────────

function detectSSRF(
  filePath: string,
  lines: { num: number; text: string }[]
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  const fetchVarRe = /\b(?:fetch|axios\s*\.\s*(?:get|post|put|delete|patch|request)|http\s*\.\s*request|https\s*\.\s*request|axios)\s*\(\s*(\w+)\s*[,)]/;
  const fetchTemplateRe = /\b(?:fetch|axios\s*\.\s*(?:get|post|put|delete|patch|request)|http\s*\.\s*request|https\s*\.\s*request)\s*\(\s*`[^`]*\$\{/;

  const userInputHints = /^(url|uri|href|link|redirect|callback|next|dest|target|returnTo|path|endpoint|address|domain|host|site|page|ref|referer|location|goto)$/i;

  let inBlockComment = false;

  for (const { num, text } of lines) {
    const { skip, inBlockComment: newBlockState } = checkCommentState(text, inBlockComment);
    inBlockComment = newBlockState;
    if (skip) continue;

    const fetchMatch = text.match(fetchVarRe);
    if (fetchMatch) {
      const varName = fetchMatch[1];
      const col = text.indexOf(varName);
      const isUserInputHint = userInputHints.test(varName);

      diagnostics.push(
        makeDiagnostic(filePath, "security-deep/ssrf-risk", "warning",
          isUserInputHint
            ? `Potential SSRF: ${varName} appears to be user-controlled and is passed directly to a network request`
            : `Network request uses variable '${varName}' — verify it is not user-controlled to prevent SSRF`,
          "Validate and whitelist allowed URLs/domains before making the request. Use an allow-list rather than a deny-list.",
          num, col + 1,
          {
            fixable: false,
            suggestion: {
              type: "refactor",
              text: "/* Validate URL against an allow-list before making the request */",
              confidence: 0.5,
              reason: "User-controlled URLs can point to internal services (SSRF); allow-list validation prevents this.",
            },
          }
        )
      );
    }

    const tmplCol = text.search(fetchTemplateRe);
    if (tmplCol !== -1) {
      diagnostics.push(
        makeDiagnostic(filePath, "security-deep/ssrf-risk", "warning",
          "Network request with interpolated URL detected — potential SSRF if input is user-controlled",
          "Validate and whitelist allowed URLs/domains before making the request. Avoid interpolating user input into URLs.",
          num, tmplCol + 1,
          {
            fixable: false,
            suggestion: {
              type: "refactor",
              text: "/* Build URL safely and validate against allow-list before request */",
              confidence: 0.55,
              reason: "Interpolated URLs may contain user input pointing to internal services (SSRF).",
            },
          }
        )
      );
    }
  }

  return diagnostics;
}

// ── Rule 7: hardcoded-secret (error) ────────────────────

function redactSecret(secret: string): string {
  if (secret.length <= 4) return "****";
  return secret.slice(0, 4) + "***";
}

function detectHardcodedSecret(
  filePath: string,
  lines: { num: number; text: string }[]
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  // Skip test files entirely
  if (isTestFile(filePath)) return diagnostics;

  // Secret patterns
  const apiKeyRe = /['"`](sk-[A-Za-z0-9_-]{10,}|key-[A-Za-z0-9_-]{10,}|AIza[A-Za-z0-9_-]{20,})['"`]/g;
  const passwordRe = /(?:password|pwd|passwd|pass)\s*(?:=|:)\s*['"`]([^'"`]{4,})['"`]/gi;
  const tokenRe = /['"`](Bearer\s+[A-Za-z0-9_.-]{10,}|ghpt_[A-Za-z0-9_-]{10,})['"`]/g;
  const awsKeyRe = /['"`](AKIA[A-Z0-9]{12,})['"`]/g;

  let inBlockComment = false;

  for (const { num, text } of lines) {
    const { skip, inBlockComment: newBlockState } = checkCommentState(text, inBlockComment);
    inBlockComment = newBlockState;
    if (skip) continue;

    let match: RegExpExecArray | null;
    apiKeyRe.lastIndex = 0;
    while ((match = apiKeyRe.exec(text)) !== null) {
      const secret = match[1];
      const col = match.index + 1;
      diagnostics.push(
        makeDiagnostic(filePath, "security-deep/hardcoded-secret", "error",
          `Hardcoded API key detected: ${redactSecret(secret)}`,
          "Move secrets to environment variables or a secrets manager. Never commit secrets to source control.",
          num, col,
          {
            fixable: true,
            suggestion: {
              type: "replace",
              text: `process.env.SECRET_KEY`,
              confidence: 0.9,
              reason: "Hardcoded secrets in source code are exposed in version control; use environment variables.",
            },
            detail: { secretPrefix: secret.slice(0, 4), secretType: "api-key" },
          }
        )
      );
    }

    passwordRe.lastIndex = 0;
    while ((match = passwordRe.exec(text)) !== null) {
      const secret = match[1];
      const col = match.index + 1;
      diagnostics.push(
        makeDiagnostic(filePath, "security-deep/hardcoded-secret", "error",
          `Hardcoded password detected: ${redactSecret(secret)}`,
          "Move passwords to environment variables or a secrets manager. Never commit credentials to source control.",
          num, col,
          {
            fixable: true,
            suggestion: {
              type: "replace",
              text: `process.env.PASSWORD`,
              confidence: 0.9,
              reason: "Hardcoded passwords in source code are exposed in version control; use environment variables.",
            },
            detail: { secretPrefix: secret.slice(0, 4), secretType: "password" },
          }
        )
      );
    }

    tokenRe.lastIndex = 0;
    while ((match = tokenRe.exec(text)) !== null) {
      const secret = match[1];
      const col = match.index + 1;
      diagnostics.push(
        makeDiagnostic(filePath, "security-deep/hardcoded-secret", "error",
          `Hardcoded token detected: ${redactSecret(secret)}`,
          "Move tokens to environment variables or a secrets manager. Never commit tokens to source control.",
          num, col,
          {
            fixable: true,
            suggestion: {
              type: "replace",
              text: `process.env.AUTH_TOKEN`,
              confidence: 0.9,
              reason: "Hardcoded tokens in source code are exposed in version control; use environment variables.",
            },
            detail: { secretPrefix: secret.slice(0, 4), secretType: "token" },
          }
        )
      );
    }

    awsKeyRe.lastIndex = 0;
    while ((match = awsKeyRe.exec(text)) !== null) {
      const secret = match[1];
      const col = match.index + 1;
      diagnostics.push(
        makeDiagnostic(filePath, "security-deep/hardcoded-secret", "error",
          `Hardcoded AWS access key detected: ${redactSecret(secret)}`,
          "Move AWS credentials to environment variables, ~/.aws/credentials, or a secrets manager.",
          num, col,
          {
            fixable: true,
            suggestion: {
              type: "replace",
              text: `process.env.AWS_ACCESS_KEY_ID`,
              confidence: 0.95,
              reason: "AWS keys in source code are a critical leak risk; use IAM roles or env vars.",
            },
            detail: { secretPrefix: secret.slice(0, 4), secretType: "aws-key" },
          }
        )
      );
    }
  }

  return diagnostics;
}

// ── Engine ───────────────────────────────────────────────

/**
 * Security vulnerability detection engine.
 *
 * Detects: eval usage, innerHTML/XSS, SQL injection, shell injection,
 * prototype pollution, SSRF risk, and hardcoded secrets.
 */
export const securityDeepEngine: Engine = {
  name: "security-deep" as const,
  description:
    "Security vulnerability detection: eval, innerHTML, SQL injection, shell injection, prototype pollution, SSRF, hardcoded secrets, XSS risk, dependency audit",
  supportedLanguages: [
    "typescript",
    "javascript",
    "python",
    "go",
    "rust",
    "ruby",
    "php",
    "java",
  ],

  async run(context: EngineContext): Promise<EngineResult> {
    const start = performance.now();
    const diagnostics: Diagnostic[] = [];
    const files = context.files ?? [];
    const rootDir = context.rootDirectory;
    const config = context.config;

    for (const filePath of files) {
      try {
        const content = await readFileContent(filePath);
        const lines = toLines(content);

        // Rule 1: eval / new Function / timer-with-string
        diagnostics.push(...detectEvalUsage(filePath, lines));

        // Rule 2: innerHTML / document.write (legacy inline rule)
        diagnostics.push(...detectInnerHTML(filePath, lines));

        // Rule 3: SQL injection via concatenation
        diagnostics.push(...detectSQLInjection(filePath, lines));

        // Rule 4: Shell injection via exec with concatenation
        diagnostics.push(...detectShellInjection(filePath, lines));

        // Rule 5: Prototype pollution
        diagnostics.push(...detectPrototypePollution(filePath, lines));

        // Rule 6: SSRF risk
        diagnostics.push(...detectSSRF(filePath, lines));

        // Rule 7: Hardcoded secrets (extended via secrets module)
        diagnostics.push(...detectHardcodedSecret(filePath, lines));

        // New: Extended hardcoded secret detection (from secrets.ts)
        diagnostics.push(...detectSecrets(filePath, lines));

        // New: XSS / HTML injection detection (from html-safety.ts)
        diagnostics.push(...detectHtmlSafety(filePath, lines));
      } catch {
        // skip unreadable files
      }
    }

    // New: Dependency vulnerability audit (only if config security.audit is true)
    if (config.security?.audit) {
      const auditTimeout = config.security?.auditTimeout ?? 25000;

      // npm/pnpm audit for JS/TS projects
      if (context.languages.includes('typescript') || context.languages.includes('javascript')) {
        diagnostics.push(...npmAudit(rootDir, auditTimeout));
      }

      // pip-audit for Python projects
      if (context.languages.includes('python')) {
        diagnostics.push(...pipAudit(rootDir, auditTimeout));
      }

      // govulncheck for Go projects
      if (context.languages.includes('go')) {
        diagnostics.push(...goVulnCheck(rootDir, auditTimeout));
      }

      // cargo audit for Rust projects
      if (context.languages.includes('rust')) {
        diagnostics.push(...cargoAudit(rootDir, auditTimeout));
      }
    }

    const elapsed = performance.now() - start;

    return {
      engine: this.name,
      diagnostics,
      elapsed,
      skipped: false,
    };
  },

  async fix(
    diagnostics: Diagnostic[],
    _context: EngineContext
  ): Promise<FixResult> {
    // Only hardcoded-secret diagnostics are auto-fixable
    const fixable = diagnostics.filter(
      (d) => d.rule === "security-deep/hardcoded-secret" && d.fixable
    );
    const remaining = diagnostics.filter(
      (d) => d.rule !== "security-deep/hardcoded-secret" || !d.fixable
    );

    return {
      fixed: fixable.length,
      remaining,
      modifiedFiles: [...new Set(fixable.map((d) => d.filePath))],
    };
  },
};
// deep-slop-ignore-end ast-slop/as-any
// deep-slop-ignore-end ast-slop/decorative-comment
// deep-slop-ignore-end ast-slop/trivial-comment
// deep-slop-ignore-end ast-slop/narrative-comment
// deep-slop-ignore-end ast-slop/copy-paste-signature
