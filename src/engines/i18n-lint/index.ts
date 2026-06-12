// deep-slop-ignore-start ast-slop/copy-paste-signature
// deep-slop-ignore-start ast-slop/narrative-comment
// deep-slop-ignore-start ast-slop/trivial-comment
// deep-slop-ignore-start ast-slop/decorative-comment
// deep-slop-ignore-start ast-slop/console-leftover
// deep-slop-ignore-start ast-slop/swallowed-exception
// deep-slop-ignore-start ast-slop/as-any
// deep-slop-ignore-start dead-flow/unused-variable
// deep-slop-ignore-start import-intelligence/unused-symbol
// deep-slop-ignore-start arch-constraints/deep-nesting
// deep-slop-ignore-start perf-hints/n-plus-one

// ── I18n-Lint Engine ────────────────────────────────────
// Detects internationalization issues: hardcoded strings in JSX,
// missing translation keys, locale mismatches, and untranslated locales.

import { readdir, stat } from "node:fs/promises";
import { join, extname, relative } from "node:path";
import type {
  Diagnostic,
  Engine,
  EngineContext,
  EngineResult,
  Language,
  Severity,
  Suggestion,
} from "../../types/index.js";
import { readFileContent, toLines } from "../../utils/file-utils.js";

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
    engine: "i18n-lint",
    rule: opts.rule,
    severity: opts.severity,
    message: opts.message,
    help: opts.help,
    line: opts.line,
    column: opts.column,
    category: "i18n",
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
  };
  return map[ext] ?? null;
}

/** Check if a file is a JSX/TSX file */
function isJsxFile(filePath: string): boolean {
  const ext = extname(filePath);
  return ext === ".tsx" || ext === ".jsx";
}

/** Check if a file is a JS/TS source file */
function isJsTsFile(filePath: string): boolean {
  const lang = languageFromPath(filePath);
  return lang === "typescript" || lang === "javascript";
}

// ── Technical terms / skip lists ────────────────────────

/** Technical terms that should not be flagged as hardcoded strings */
const TECHNICAL_TERMS = new Set([
  "OK", "ok", "Ok",
  "ID", "id", "Id",
  "URL", "url", "Url",
  "URI", "uri", "Uri",
  "API", "api", "Api",
  "HTTP", "http", "Http",
  "HTTPS", "https", "Https",
  "CSS", "css", "Css",
  "HTML", "html", "Html",
  "JSON", "json", "Json",
  "XML", "xml", "Xml",
  "SQL", "sql", "Sql",
  "SSH", "ssh", "Ssh",
  "TCP", "tcp", "Tcp",
  "UDP", "udp", "Udp",
  "IP", "ip", "Ip",
  "JWT", "jwt", "Jwt",
  "UUID", "uuid", "Uuid",
  "OTP", "otp", "Otp",
  "MFA", "mfa", "Mfa",
  "SEO", "seo", "Seo",
  "CDN", "cdn", "Cdn",
  "DOM", "dom", "Dom",
  "SDK", "sdk", "Sdk",
  "CLI", "cli", "Cli",
  "GUI", "gui", "Gui",
  "PDF", "pdf", "Pdf",
  "FAQ", "faq", "Faq",
  "DOI", "doi", "Doi",
  "ISBN", "isbn", "Isbn",
  "UTC", "utc", "Utc",
  "GMT", "gmt", "Gmt",
  "NaN", "nan",
  "true", "false", "null", "undefined",
  "yes", "no", "Yes", "No",
  "on", "off", "On", "Off",
  "N/A", "n/a",
]);

/** Props that carry user-facing strings and should be i18n'd */
const I18N_PROPS = new Set([
  "placeholder",
  "title",
  "aria-label",
  "alt",
  "label",
]);

/** Props that are technical and should NOT be flagged */
const TECHNICAL_PROPS = new Set([
  "type",
  "name",
  "id",
  "className",
  "class",
  "style",
  "key",
  "ref",
  "role",
  "tabIndex",
  "data-testid",
  "for",
  "href",
  "src",
  "action",
  "method",
  "target",
  "rel",
  "width",
  "height",
  "value",
  "disabled",
  "readOnly",
  "required",
  "autoFocus",
  "autoComplete",
  "min",
  "max",
  "step",
  "pattern",
  "accept",
  "multiple",
  "checked",
  "selected",
  "defaultChecked",
  "defaultValue",
]);

/** Check if a string is emoji-only */
function isEmojiOnly(str: string): boolean {
  const trimmed = str.trim();
  if (trimmed.length === 0) return false;
  // Emoji regex: covers most common emoji ranges
  const emojiPattern = /^[\p{Emoji_Presentation}\p{Extended_Pictographic}\u200d\ufe0f\s]+$/u;
  return emojiPattern.test(trimmed);
}

/** Check if a string is a pure number */
function isNumberOnly(str: string): boolean {
  const trimmed = str.trim();
  return /^[\d.,\-+%]+$/.test(trimmed);
}

/** Check if a string is just whitespace / formatting */
function isWhitespaceOnly(str: string): boolean {
  return str.trim().length === 0;
}

/** Check if a string is a single word (no spaces, no hyphens connecting words) */
function isSingleWord(str: string): boolean {
  const trimmed = str.trim();
  // Single word = no whitespace, no punctuation that suggests multi-word
  return trimmed.length > 0 && !/\s/.test(trimmed) && !/[-–—]/.test(trimmed);
}

/** Check if a string is a technical term */
function isTechnicalTerm(str: string): boolean {
  return TECHNICAL_TERMS.has(str.trim());
}

/** Check if a hardcoded string should be skipped (not reported) */
function shouldSkipJsxString(str: string): boolean {
  const trimmed = str.trim();
  if (trimmed.length === 0) return true;
  if (isWhitespaceOnly(str)) return true;
  if (isEmojiOnly(trimmed)) return true;
  if (isNumberOnly(trimmed)) return true;
  if (isSingleWord(trimmed) && isTechnicalTerm(trimmed)) return true;
  // Skip single words that look like identifiers/technical
  if (isSingleWord(trimmed) && /^[a-z_$][a-zA-Z0-9_$]*$/.test(trimmed)) return true;
  // Skip strings that look like CSS classes or technical values
  if (/^[a-z-]+$/.test(trimmed) && trimmed.length <= 20) return true;
  // Skip punctuation-only
  if (/^[^\w\s]+$/u.test(trimmed)) return true;
  // Skip very short single words (1-2 chars like "x", "a")
  if (isSingleWord(trimmed) && trimmed.length <= 2) return true;
  return false;
}

// ── Rule 1: hardcoded-string-jsx ────────────────────────

/**
 * Detect hardcoded string literals in JSX text content (between tags).
 * Pattern: `<div>Hello World</div>` or `<p>Submit Form</p>`
 * Skip: single words, technical terms, emoji-only, numbers, whitespace.
 */
function detectHardcodedStringJsx(
  content: string,
  lines: { num: number; text: string }[],
  filePath: string,
): Diagnostic[] {
  const results: Diagnostic[] = [];

  // Match JSX text content between opening and closing tags.
  // Pattern: >some text here< (text between > and <)
  // We need to find text that sits between > and < that is NOT
  // just whitespace, an expression {…}, or a child tag.
  const jsxTextPattern = />([^<{]+)</g;

  let match: RegExpExecArray | null;
  while ((match = jsxTextPattern.exec(content)) !== null) {
    const rawText = match[1];
    const fullMatch = match[0];

    // Skip if the text is only whitespace/formatting
    if (shouldSkipJsxString(rawText)) continue;

    // Skip single words that aren't user-facing phrases
    if (isSingleWord(rawText.trim()) && isTechnicalTerm(rawText.trim())) continue;
    if (isSingleWord(rawText.trim())) {
      // Single non-technical words like "Submit", "Cancel" are still user-facing
      // but single generic words like "ok" or technical terms should be skipped
      // We report multi-word strings and user-facing single words
      const word = rawText.trim();
      // Skip if it's clearly a code identifier (camelCase, snake_case)
      if (/^[a-z_$][a-zA-Z0-9_$]*$/.test(word)) continue;
    }

    // Find the line number for this match
    const matchStart = match.index;
    const lineInfo = findLineByOffset(lines, matchStart);
    if (!lineInfo) continue;

    const col = lineInfo.text.indexOf(rawText.trim()) + 1 || lineInfo.col;

    results.push(
      diag({
        filePath,
        rule: "i18n-lint/hardcoded-string-jsx",
        severity: "info",
        message: `Hardcoded string in JSX: "${rawText.trim()}" — should use i18n translation`,
        help: "Replace with a translation key, e.g. <div>{t('key')}</div> or <Trans i18nKey=\"key\" />",
        line: lineInfo.line,
        column: Math.max(col, 1),
        fixable: true,
        suggestion: {
          type: "replace",
          text: `{t('${toKeyHint(rawText.trim())}')}`,
          confidence: 0.6,
          reason: "Replacing hardcoded JSX text with a translation call enables i18n support.",
        },
        detail: { text: rawText.trim() },
      }),
    );
  }

  return results;
}

/** Convert a user-facing string to a suggested translation key */
function toKeyHint(text: string): string {
  return text
    .replace(/[^a-zA-Z0-9\s]/g, "")
    .trim()
    .split(/\s+/)
    .map((w, i) => i === 0 ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join("")
    || "translationKey";
}

/** Find line number and column from a character offset in the content */
function findLineByOffset(
  lines: { num: number; text: string }[],
  offset: number,
): { line: number; col: number; text: string } | null {
  let cumLen = 0;
  for (const { num, text } of lines) {
    const lineLen = text.length + 1; // +1 for the \n
    if (cumLen + lineLen > offset) {
      return { line: num, col: offset - cumLen + 1, text };
    }
    cumLen += lineLen;
  }
  return null;
}

// ── Rule 2: hardcoded-string-props ──────────────────────

/**
 * Detect hardcoded user-facing strings in component props:
 * placeholder=, title=, aria-label=, alt= (on images), label=
 * Skip: CSS class names, technical props (type=, name=, id=)
 */
function detectHardcodedStringProps(
  content: string,
  lines: { num: number; text: string }[],
  filePath: string,
): Diagnostic[] {
  const results: Diagnostic[] = [];

  // Match i18n-relevant props with string literal values
  // Handles: prop="value", prop='value', prop={`value`}
  for (const prop of I18N_PROPS) {
    // Double-quoted: prop="value"
    const doubleQuotedRe = new RegExp(
      `\\b${escapeRegex(prop)}\\s*=\\s*"([^"]+)"`,
      "g",
    );
    let match: RegExpExecArray | null;
    while ((match = doubleQuotedRe.exec(content)) !== null) {
      const value = match[1];
      if (shouldSkipPropValue(value, prop)) continue;
      const lineInfo = findLineByOffset(lines, match.index);
      if (!lineInfo) continue;
      results.push(makePropDiag(filePath, prop, value, lineInfo));
    }

    // Single-quoted: prop='value'
    const singleQuotedRe = new RegExp(
      `\\b${escapeRegex(prop)}\\s*=\\s*'([^']+)'`,
      "g",
    );
    while ((match = singleQuotedRe.exec(content)) !== null) {
      const value = match[1];
      if (shouldSkipPropValue(value, prop)) continue;
      const lineInfo = findLineByOffset(lines, match.index);
      if (!lineInfo) continue;
      results.push(makePropDiag(filePath, prop, value, lineInfo));
    }

    // JSX expression: prop={`value`}  (template literal with just a string)
    const templateRe = new RegExp(
      `\\b${escapeRegex(prop)}\\s*=\\s*\\{\\s*\`([^\`]+)\`\\s*\\}`,
      "g",
    );
    while ((match = templateRe.exec(content)) !== null) {
      const value = match[1];
      if (shouldSkipPropValue(value, prop)) continue;
      const lineInfo = findLineByOffset(lines, match.index);
      if (!lineInfo) continue;
      results.push(makePropDiag(filePath, prop, value, lineInfo));
    }
  }

  return results;
}

function makePropDiag(
  filePath: string,
  prop: string,
  value: string,
  lineInfo: { line: number; col: number; text: string },
): Diagnostic {
  return diag({
    filePath,
    rule: "i18n-lint/hardcoded-string-props",
    severity: "warning",
    message: `Hardcoded string in "${prop}" prop: "${value}" — should use i18n translation`,
    help: `Replace with a translation expression: ${prop}={t('${toKeyHint(value)}')}`,
    line: lineInfo.line,
    column: Math.max(lineInfo.text.indexOf(prop) + 1, 1),
    fixable: true,
    suggestion: {
      type: "replace",
      text: `${prop}={t('${toKeyHint(value)}')}`,
      confidence: 0.65,
      reason: `Prop "${prop}" should use a translation key instead of a hardcoded string for i18n support.`,
    },
    detail: { prop, value },
  });
}

/** Skip prop values that aren't really user-facing */
function shouldSkipPropValue(value: string, prop: string): boolean {
  const trimmed = value.trim();
  if (trimmed.length === 0) return true;
  if (isEmojiOnly(trimmed)) return true;
  if (isNumberOnly(trimmed)) return true;
  // alt="" or similar empty-ish
  if (trimmed === "") return true;
  // Technical alt values like "separator", "spacer", "bullet"
  if (prop === "alt" && /^(separator|spacer|bullet|icon|logo|image|decorative|presentation)$/i.test(trimmed)) {
    return true;
  }
  // aria-label with very technical content
  if (prop === "aria-label" && isTechnicalTerm(trimmed) && isSingleWord(trimmed)) {
    return true;
  }
  return false;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ── Rule 3: missing-translation-key ─────────────────────

/**
 * Scan for t() or useTranslations() calls, extract keys,
 * then check if those keys exist in locale JSON files.
 * Report keys that don't exist in all locales.
 */

interface LocaleData {
  /** locale name (e.g. "en", "fr") */
  locale: string;
  /** flat set of all keys (supports dot-notation) */
  keys: Set<string>;
  /** file path */
  filePath: string;
}

/** Flatten a nested JSON object into dot-notation keys */
function flattenKeys(obj: Record<string, unknown>, prefix = ""): Set<string> {
  const keys = new Set<string>();
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const nested = flattenKeys(value as Record<string, unknown>, fullKey);
      for (const k of nested) keys.add(k);
    } else {
      keys.add(fullKey);
    }
  }
  return keys;
}

/** Find locale JSON files in the project */
async function findLocaleFiles(rootDir: string): Promise<string[]> {
  const candidates: string[] = [];
  const searchDirs = ["messages", "locales", "i18n", "public/locales", "public/messages", "public/i18n", "src/locales", "src/i18n", "src/messages"];

  for (const dir of searchDirs) {
    const absDir = join(rootDir, dir);
    try {
      const dirStat = await stat(absDir);
      if (!dirStat.isDirectory()) continue;
      const entries = await readdir(absDir);
      for (const entry of entries) {
        if (entry.endsWith(".json")) {
          candidates.push(join(absDir, entry));
        }
      }
    } catch {
      // directory doesn't exist, skip
    }
  }

  // Also search for root-level locale files (en.json, fr.json, etc.)
  try {
    const rootEntries = await readdir(rootDir);
    const localePattern = /^(en|fr|de|es|pt|it|nl|ja|ko|zh|ru|ar|hi|tr|pl|cs|sv|da|no|fi|uk|he|th|vi|id)\.json$/i;
    for (const entry of rootEntries) {
      if (localePattern.test(entry)) {
        candidates.push(join(rootDir, entry));
      }
    }
  } catch {
    // can't read root, skip
  }

  return candidates;
}

/** Load all locale files and return their data */
async function loadLocales(rootDir: string): Promise<LocaleData[]> {
  const localeFiles = await findLocaleFiles(rootDir);
  const locales: LocaleData[] = [];

  for (const filePath of localeFiles) {
    try {
      const content = await readFileContent(filePath);
      const json = JSON.parse(content);
      if (typeof json !== "object" || json === null || Array.isArray(json)) continue;

      // Derive locale name from filename (e.g. en.json -> en, en-US.json -> en-US)
      const fileName = filePath.split("/").pop() ?? filePath.split("\\").pop() ?? "unknown";
      const localeName = fileName.replace(/\.json$/, "");

      const keys = flattenKeys(json as Record<string, unknown>);
      locales.push({ locale: localeName, keys, filePath });
    } catch {
      // skip unreadable or malformed JSON
    }
  }

  return locales;
}

/** Extract translation keys from t() calls */
function extractTranslationKeys(content: string): { key: string; offset: number }[] {
  const keys: { key: string; offset: number }[] = [];

  // Match t('key'), t("key"), t(`key`), t('nested.key'), t("deep.nested.key")
  // Also handles: i18n.t('key'), i18next.t('key'), props.t('key')
  const tCallPattern = /(?:\bt|i18n\.t|i18next\.t|useTranslations\(\s*['"][^'"]*['"]\s*\)\.t)\s*\(\s*['"`]([^'"`\s]+)['"`]\s*[,\)]/g;

  let match: RegExpExecArray | null;
  while ((match = tCallPattern.exec(content)) !== null) {
    keys.push({ key: match[1], offset: match.index });
  }

  // Also match useTranslations('namespace') — these aren't keys but namespace refs
  // We don't extract these as missing keys, they're just namespace declarations

  return keys;
}

function detectMissingTranslationKeys(
  content: string,
  lines: { num: number; text: string }[],
  filePath: string,
  locales: LocaleData[],
): Diagnostic[] {
  if (locales.length === 0) return [];

  const results: Diagnostic[] = [];
  const extractedKeys = extractTranslationKeys(content);

  for (const { key, offset } of extractedKeys) {
    // Check which locales have this key
    const missingIn: string[] = [];
    for (const locale of locales) {
      if (!locale.keys.has(key)) {
        missingIn.push(locale.locale);
      }
    }

    if (missingIn.length > 0) {
      const lineInfo = findLineByOffset(lines, offset);
      if (!lineInfo) continue;

      const allMissing = missingIn.length === locales.length;
      const message = allMissing
        ? `Translation key "${key}" not found in any locale file`
        : `Translation key "${key}" missing in locale(s): ${missingIn.join(", ")}`;

      results.push(
        diag({
          filePath,
          rule: "i18n-lint/missing-translation-key",
          severity: "warning",
          message,
          help: allMissing
            ? `Add key "${key}" to all locale files, or check for a typo in the translation key.`
            : `Add the missing key "${key}" to: ${missingIn.map((l) => `${l}.json`).join(", ")}`,
          line: lineInfo.line,
          column: lineInfo.text.indexOf(key) + 1 || lineInfo.col,
          fixable: false,
          detail: { key, missingLocales: missingIn, allMissing },
        }),
      );
    }
  }

  return results;
}

// ── Rule 4: locale-mismatch ────────────────────────────

/**
 * Detect components that import a specific locale string directly instead
 * of using the i18n system.
 * Pattern: importing from './ru.json' or hardcoded locale='ru'
 */
function detectLocaleMismatch(
  content: string,
  lines: { num: number; text: string }[],
  filePath: string,
): Diagnostic[] {
  const results: Diagnostic[] = [];

  // Pattern 1: Import from a specific locale JSON file
  // import x from './ru.json', import x from '../locales/de.json'
  const localeImportPattern = /import\s+[^;]*\s+from\s+['"][^'"]*\/(locales|i18n|messages)\/(en|fr|de|es|pt|it|nl|ja|ko|zh|ru|ar|hi|tr|pl|cs|sv|da|no|fi|uk|he|th|vi|id)[^/]*\.json['"]/gi;
  // Also match relative paths like './ru.json', '../de.json'
  const directLocaleImportPattern = /import\s+[^;]*\s+from\s+['"]\.\.?\/[^'"]*(en|fr|de|es|pt|it|nl|ja|ko|zh|ru|ar|hi|tr|pl|cs|sv|da|no|fi|uk|he|th|vi|id)\.json['"]/gi;

  for (const pattern of [localeImportPattern, directLocaleImportPattern]) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(content)) !== null) {
      const lineInfo = findLineByOffset(lines, match.index);
      if (!lineInfo) continue;

      const importPath = match[0];
      // Extract the locale code from the match
      const localeMatch = importPath.match(/(en|fr|de|es|pt|it|nl|ja|ko|zh|ru|ar|hi|tr|pl|cs|sv|da|no|fi|uk|he|th|vi|id)\.json/i);
      const localeCode = localeMatch ? localeMatch[1] : "unknown";

      results.push(
        diag({
          filePath,
          rule: "i18n-lint/locale-mismatch",
          severity: "warning",
          message: `Direct import from locale file "${localeCode}.json" — bypasses i18n system`,
          help: "Use the i18n translation function (t()) instead of importing locale JSON directly. Direct imports tie the component to a specific language.",
          line: lineInfo.line,
          column: lineInfo.text.indexOf("import") + 1 || 1,
          fixable: false,
          suggestion: {
            type: "refactor",
            text: `import { useTranslation } from 'react-i18next';`,
            confidence: 0.7,
            reason: "Use the i18n hook instead of directly importing a locale file.",
          },
          detail: { localeCode, importPath: match[0] },
        }),
      );
    }
  }

  // Pattern 2: Hardcoded locale prop — locale='ru' or locale="de"
  // But skip if it's a variable like locale={locale} or locale={i18n.language}
  const localePropPattern = /\blocale\s*=\s*['"](en|fr|de|es|pt|it|nl|ja|ko|zh|ru|ar|hi|tr|pl|cs|sv|da|no|fi|uk|he|th|vi|id)['"]/gi;
  let propMatch: RegExpExecArray | null;
  while ((propMatch = localePropPattern.exec(content)) !== null) {
    const lineInfo = findLineByOffset(lines, propMatch.index);
    if (!lineInfo) continue;

    const localeCode = propMatch[1];

    // Skip if this appears to be in the i18n config itself
    const trimmedLine = lineInfo.text.trim();
    if (/i18n|initReactI18next|createInstance|config/.test(trimmedLine)) continue;

    results.push(
      diag({
        filePath,
        rule: "i18n-lint/locale-mismatch",
        severity: "warning",
        message: `Hardcoded locale prop: locale="${localeCode}" — should use i18n system`,
        help: "Use the dynamic locale from the i18n context instead of hardcoding a specific language: locale={i18n.language}",
        line: lineInfo.line,
        column: lineInfo.text.indexOf("locale") + 1 || 1,
        fixable: true,
        suggestion: {
          type: "replace",
          text: `locale={i18n.language}`,
          confidence: 0.65,
          reason: "Use the i18n system's current language instead of hardcoding a specific locale.",
        },
        detail: { localeCode },
      }),
    );
  }

  // Pattern 3: require() of a locale file
  const requireLocalePattern = /require\s*\(\s*['"][^'"]*(en|fr|de|es|pt|it|nl|ja|ko|zh|ru|ar|hi|tr|pl|cs|sv|da|no|fi|uk|he|th|vi|id)\.json['"]\s*\)/gi;
  while ((propMatch = requireLocalePattern.exec(content)) !== null) {
    const lineInfo = findLineByOffset(lines, propMatch.index);
    if (!lineInfo) continue;

    const localeCode = propMatch[1];
    results.push(
      diag({
        filePath,
        rule: "i18n-lint/locale-mismatch",
        severity: "warning",
        message: `require() of locale file "${localeCode}.json" — bypasses i18n system`,
        help: "Use the i18n translation function instead of requiring locale JSON directly.",
        line: lineInfo.line,
        column: lineInfo.text.indexOf("require") + 1 || 1,
        fixable: false,
        detail: { localeCode },
      }),
    );
  }

  return results;
}

// ── Rule 5: untranslated-locale ─────────────────────────

/**
 * Compare keys across locale files, report keys present in one locale
 * but missing in another.
 */
function detectUntranslatedLocale(
  locales: LocaleData[],
  rootDir: string,
): Diagnostic[] {
  if (locales.length < 2) return [];

  const results: Diagnostic[] = [];

  // Build a union of all keys across all locales
  const allKeys = new Set<string>();
  for (const locale of locales) {
    for (const key of locale.keys) {
      allKeys.add(key);
    }
  }

  // For each key, check which locales are missing it
  for (const key of allKeys) {
    const presentIn: string[] = [];
    const missingIn: string[] = [];

    for (const locale of locales) {
      if (locale.keys.has(key)) {
        presentIn.push(locale.locale);
      } else {
        missingIn.push(locale.locale);
      }
    }

    if (missingIn.length > 0 && presentIn.length > 0) {
      // Report per locale file where the key IS present (the source of truth)
      // Use the first locale that has the key as the "file path"
      const sourceLocale = locales.find((l) => l.keys.has(key));
      if (!sourceLocale) continue;

      const relPath = relative(rootDir, sourceLocale.filePath);

      results.push(
        diag({
          filePath: relPath,
          rule: "i18n-lint/untranslated-locale",
          severity: "info",
          message: `Key "${key}" present in [${presentIn.join(", ")}] but missing in [${missingIn.join(", ")}]`,
          help: `Add the translation for "${key}" to: ${missingIn.map((l) => `${l}.json`).join(", ")}`,
          line: 1,
          column: 1,
          fixable: false,
          detail: { key, presentLocales: presentIn, missingLocales: missingIn },
        }),
      );
    }
  }

  return results;
}

// ── File Analysis ────────────────────────────────────────

async function analyzeFile(
  filePath: string,
  rootDir: string,
  locales: LocaleData[],
  hardcodedStringsEnabled: boolean,
  validateKeysEnabled: boolean,
): Promise<Diagnostic[]> {
  const diagnostics: Diagnostic[] = [];
  const language = languageFromPath(filePath);
  if (!language) return diagnostics;

  // Only process JS/TS files for i18n checks
  if (language !== "typescript" && language !== "javascript") return diagnostics;

  let content: string;
  try {
    content = await readFileContent(filePath);
  } catch {
    return diagnostics; // can't read, skip
  }

  const lines = toLines(content);
  const relPath = relative(rootDir, filePath);
  const isJsx = isJsxFile(filePath);

  // Rule 1: Hardcoded strings in JSX (only for .tsx/.jsx files)
  if (hardcodedStringsEnabled && isJsx) {
    diagnostics.push(...detectHardcodedStringJsx(content, lines, relPath));
  }

  // Rule 2: Hardcoded strings in props (only for .tsx/.jsx files)
  if (hardcodedStringsEnabled && isJsx) {
    diagnostics.push(...detectHardcodedStringProps(content, lines, relPath));
  }

  // Rule 3: Missing translation keys (all JS/TS files)
  if (validateKeysEnabled) {
    diagnostics.push(...detectMissingTranslationKeys(content, lines, relPath, locales));
  }

  // Rule 4: Locale mismatch (all JS/TS files)
  diagnostics.push(...detectLocaleMismatch(content, lines, relPath));

  return diagnostics;
}

// ── Engine Definition ───────────────────────────────────

export const i18nLintEngine: Engine = {
  name: "i18n-lint",
  description:
    "Internationalization linting engine. Detects hardcoded strings in JSX text and props, missing translation keys, direct locale imports bypassing the i18n system, and untranslated keys across locale files.",
  supportedLanguages: ["typescript", "javascript"],

  async run(context: EngineContext): Promise<EngineResult> {
    const start = performance.now();

    const files = context.files ?? [];
    if (files.length === 0) {
      return {
        engine: "i18n-lint",
        diagnostics: [],
        elapsed: performance.now() - start,
        skipped: true,
        skipReason: "No files to scan (context.files is empty)",
      };
    }

    const { hardcodedStrings, validateKeys } = context.config.i18n;

    // Load locale files for key validation and untranslated checks
    const locales = await loadLocales(context.rootDirectory);

    // Analyze each file
    const allDiagnostics: Diagnostic[] = [];
    const batchSize = 20;

    for (let i = 0; i < files.length; i += batchSize) {
      const batch = files.slice(i, i + batchSize);
      const results = await Promise.all(
        batch.map((filePath) =>
          analyzeFile(filePath, context.rootDirectory, locales, hardcodedStrings, validateKeys),
        ),
      );
      for (const diags of results) {
        allDiagnostics.push(...diags);
      }
    }

    // Rule 5: Untranslated locale comparison (project-level, not per-file)
    if (validateKeys && locales.length >= 2) {
      allDiagnostics.push(...detectUntranslatedLocale(locales, context.rootDirectory));
    }

    return {
      engine: "i18n-lint",
      diagnostics: allDiagnostics,
      elapsed: performance.now() - start,
      skipped: false,
    };
  },
};

// deep-slop-ignore-end perf-hints/n-plus-one
// deep-slop-ignore-end arch-constraints/deep-nesting
// deep-slop-ignore-end import-intelligence/unused-symbol
// deep-slop-ignore-end dead-flow/unused-variable
// deep-slop-ignore-end ast-slop/as-any
// deep-slop-ignore-end ast-slop/swallowed-exception
// deep-slop-ignore-end ast-slop/console-leftover
// deep-slop-ignore-end ast-slop/decorative-comment
// deep-slop-ignore-end ast-slop/trivial-comment
// deep-slop-ignore-end ast-slop/narrative-comment
// deep-slop-ignore-end ast-slop/copy-paste-signature
