import type {
  Diagnostic,
  Suggestion,
} from "../../types/index.js";
import {
  makeDiagnostic,
  checkCommentState,
  isInsideStringOrRegex,
  containsSQLKeyword,
} from "./helpers.js";

// ── Rule 1: eval-usage (error) ────────────────────────

export function detectEvalUsage(
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

    // ── eval() ────────────────────────────────────
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

    // ── new Function() ───────────────────────────
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

    // ── setTimeout/setInterval with string ──────────
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

export function detectInnerHTML(
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

// ── Rule 3: sql-injection (error) ─────────────────────

export function detectSQLInjection(
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

export function detectShellInjection(
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

// ── Rule 5: prototype-pollution (warning) ─────────────

// Known deep-merge utility files; flagging them is like flagging a sort function.
const DEEP_MERGE_UTIL_PATHS = [
  "/utils/deep-merge.ts",
  "/utils/deep-merge.js",
  "\\utils\\deep-merge.ts",
  "\\utils\\deep-merge.js",
];

// Names that indicate a deep merge implementation or call.
const DEEP_MERGE_NAMES = "(?:deepMerge|deepExtend|mergeDeep|defaultsDeep)";

// Safety primitives we look for inside a custom merge body.
// Matches: Object.hasOwn, Object.hasOwnProperty, hasOwnProperty,
// Object.create(null), Object.keys (only own enumerable keys),
// and explicit __proto__ / constructor / prototype key checks.
const SAFETY_CHECK_RE = new RegExp(
  [
    String.raw`\bObject\s*\.\s*(?:hasOwnProperty|hasOwn)\s*\(`,
    String.raw`\bhasOwnProperty\s*\(`,
    String.raw`Object\s*\.\s*create\s*\(\s*null\s*\)`,
    String.raw`Object\s*\.\s*keys\s*\(`,
    String.raw`\b(?:key|prop|k|name)\s*(?:===|!==|==|!=)\s*(['"\`])(?:__proto__|constructor|prototype)\1`,
    String.raw`\.\s*(?:includes|indexOf|some)\s*\(\s*(['"\`])(?:__proto__|constructor|prototype)\2`,
    String.raw`(?:__proto__|constructor|prototype)\s*in\s+\w+`,
  ].join('|'),
  'i'
)

// Imports of the project's safe deep-merge utility.
const SAFE_DEEP_MERGE_IMPORT_RE = /\bimport\s*\{[^}]*\bdeepMerge\b[^}]*\}\s*from\s*['\"][^'\"]*deep-merge[^'\"]*['\"]/;

function isDeepMergeUtilFile(filePath: string): boolean {
  return DEEP_MERGE_UTIL_PATHS.some((suffix) => filePath.endsWith(suffix));
}

function findCustomDeepMergeBodies(content: string): { start: number; end: number }[] {
  const bodies: { start: number; end: number }[] = []
  const customImplRe = new RegExp(
    "\\b(?:function\\s+" + DEEP_MERGE_NAMES + "|(?:const|let|var)\\s+" + DEEP_MERGE_NAMES + "\\s*[:=]\\s*(?:function|\\(?))\\s*\\([^)]*\\)(?:\\s*:\\s*\\w+)?\\s*\\{",
    "g"
  );

  let match: RegExpExecArray | null
  while ((match = customImplRe.exec(content)) !== null) {
    const openBrace = content.indexOf("{", match.index);
    if (openBrace === -1) continue;

    let depth = 0;
    let closeBrace = -1;
    for (let i = openBrace; i < content.length; i++) {
      if (content[i] === "{") depth++;
      if (content[i] === "}") {
        depth--;
        if (depth === 0) {
          closeBrace = i;
          break;
        }
      }
    }
    if (closeBrace !== -1) {
      // Range spans the whole function signature through the closing brace so
      // both the declaration line and recursive calls are treated as protected.
      bodies.push({ start: match.index, end: closeBrace + 1 });
    }
  }
  return bodies;
}

function isInsideSafeMergeBody(
  position: number,
  safeBodies: { start: number; end: number }[]
): boolean {
  return safeBodies.some((body) => position >= body.start && position < body.end);
}

export function detectPrototypePollution(
  filePath: string,
  lines: { num: number; text: string }[]
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  // Skip the deep merge utility implementation itself — it's the library, not user code.
  if (isDeepMergeUtilFile(filePath)) {
    return diagnostics;
  }

  const objectAssignRe = /\bObject\s*\.\s*assign\s*\(\s*\w+\s*,\s*\w+/;
  const protoRe = /__proto__/;
  const deepMergeCallRe = new RegExp("\\b" + DEEP_MERGE_NAMES + "\\s*\\(");
  const deepMergeDefinitionRe = new RegExp(
    "\\b(?:function\\s+" + DEEP_MERGE_NAMES + "|(?:const|let|var)\\s+" + DEEP_MERGE_NAMES + "\\s*[:=]\\s*(?:function|\\(?))"
  );

  const fullContent = lines.map((l) => l.text).join("\n");
  const importsSafeDeepMerge = SAFE_DEEP_MERGE_IMPORT_RE.test(fullContent);

  // Detect custom deep merge implementations in user code and flag only the unsafe ones.
  // Also track safe bodies so recursive calls inside a protected merge are not flagged.
  const safeBodyRanges: { start: number; end: number }[] = [];
  for (const customBody of findCustomDeepMergeBodies(fullContent)) {
    const body = fullContent.slice(customBody.start, customBody.end);
    if (SAFETY_CHECK_RE.test(body)) {
      safeBodyRanges.push(customBody);
      continue;
    }

    // Locate the line that contains the start of the function definition.
    let lineIdx = 0;
    let pos = 0;
    for (const line of lines) {
      if (pos + line.text.length >= customBody.start) {
        break;
      }
      pos += line.text.length + 1;
      lineIdx++;
    }
    const line = lines[lineIdx];
    const col = line ? line.text.search(deepMergeDefinitionRe) : -1;
    if (line && col !== -1) {
      diagnostics.push(
        makeDiagnostic(filePath, "security-deep/prototype-pollution", "warning",
          "Custom deep merge implementation detected — ensure it is safe against prototype pollution",
          "Filter __proto__, constructor, and prototype keys, use Object.hasOwnProperty/Object.hasOwn checks, or use a null-prototype target.",
          line.num, col + 1,
          {
            fixable: true,
            suggestion: {
              type: "replace",
              text: "/* Add safety checks: Object.hasOwn(source, key) and Object.create(null) target */",
              range: {
                startLine: line.num,
                startCol: col + 1,
                endLine: line.num,
                endCol: line.text.length + 1,
              },
              confidence: 0.65,
              reason: "Custom deep merge implementations without Object.hasOwnProperty or null-prototype checks are a common prototype pollution vector.",
            },
          }
        )
      );
    }
  }

  let inBlockComment = false;
  let lineStartPos = 0;

  for (const { num, text } of lines) {
    const { skip, inBlockComment: newBlockState } = checkCommentState(text, inBlockComment);
    inBlockComment = newBlockState;
    if (skip) {
      lineStartPos += text.length + 1;
      continue;
    }

    const oaCol = text.search(objectAssignRe);
    if (oaCol !== -1) {
      if (isInsideStringOrRegex(text, oaCol)) {
        lineStartPos += text.length + 1;
        continue;
      }

      diagnostics.push(
        makeDiagnostic(filePath, "security-deep/prototype-pollution", "warning",
          "Object.assign() with user-controlled source may enable prototype pollution",
          "Validate or sanitize the source object before merging, or use a null-prototype target: Object.assign(Object.create(null), safeDefaults, userInput).",
          num, oaCol + 1,
          {
            fixable: true,
            suggestion: {
              type: "replace",
              text: "Object.assign(Object.create(null), safeDefaults, sanitizedInput)",
              range: {
                startLine: num,
                startCol: oaCol + 1,
                endLine: num,
                endCol: text.length + 1,
              },
              confidence: 0.75,
              reason: "Using Object.create(null) as the target prevents prototype pollution via __proto__ and constructor.",
            },
          }
        )
      );
    }

    const protoCol = text.search(protoRe);
    if (protoCol !== -1) {
      if (isInsideStringOrRegex(text, protoCol)) {
        lineStartPos += text.length + 1;
        continue;
      }

      diagnostics.push(
        makeDiagnostic(filePath, "security-deep/prototype-pollution", "warning",
          "Direct __proto__ access detected — potential prototype pollution vector",
          "Avoid __proto__ access. Use Object.getPrototypeOf() / Object.setPrototypeOf() or create a null-prototype object with Object.create(null).",
          num, protoCol + 1,
          {
            fixable: true,
            suggestion: {
              type: "replace",
              text: "Object.create(null)",
              range: {
                startLine: num,
                startCol: protoCol + 1,
                endLine: num,
                endCol: text.length + 1,
              },
              confidence: 0.7,
              reason: "__proto__ can be leveraged for prototype pollution attacks when user input reaches it. Using Object.create(null) or Object.getPrototypeOf() avoids the __proto__ accessor.",
            },
          }
        )
      );
    }

    const dmCol = text.search(deepMergeCallRe);
    if (dmCol !== -1) {
      if (!isInsideStringOrRegex(text, dmCol)) {
        // Calls to the project's safe deep-merge utility are a deliberate safe pattern.
        const isSafeCall = importsSafeDeepMerge ||
          // Recursive calls inside a custom merge that already has sanitization checks are safe.
          isInsideSafeMergeBody(lineStartPos + dmCol, safeBodyRanges);

        // The declaration line itself is already handled by the custom-impl detector above.
        const isDeclarationLine = deepMergeDefinitionRe.test(text);

        if (!isSafeCall && !isDeclarationLine) {
          diagnostics.push(
            makeDiagnostic(filePath, "security-deep/prototype-pollution", "warning",
              "Deep merge function detected — ensure inputs are sanitized against prototype pollution",
              "Use a prototype-pollution-safe merge library or explicitly filter __proto__, constructor, and prototype keys.",
              num, dmCol + 1,
              {
                fixable: true,
                suggestion: {
                  type: "replace",
                  text: "safeMerge(Object.create(null), target, source)",
                  range: {
                    startLine: num,
                    startCol: dmCol + 1,
                    endLine: num,
                    endCol: text.length + 1,
                  },
                  confidence: 0.65,
                  reason: "Deep merge utilities can propagate __proto__ properties, leading to prototype pollution. Use a safe merge with a null-prototype target and filtered keys.",
                },
              }
            )
          );
        }
      }
    }

    lineStartPos += text.length + 1;
  }

  return diagnostics;
}

// ── Rule 6: ssrf-risk (warning) ──────────────────────

export function detectSSRF(
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
