// ── I18n-Lint Helpers ───────────────────────────────────
// Shared utilities and locale loading for the i18n-lint engine.

import { readdir, stat } from "node:fs/promises"
import { join, extname } from "node:path"
import type {
  Diagnostic,
  Language,
  Severity,
  Suggestion,
} from "../../types/index.js"
import { readFileContent } from "../../utils/file-utils.js"

// ── Diagnostics ─────────────────────────────────────────

/** Build a diagnostic with common fields filled */
export function diag(opts: {
  filePath: string
  rule: string
  severity: Severity
  message: string
  help: string
  line: number
  column: number
  fixable: boolean
  suggestion?: Suggestion
  detail?: Record<string, unknown>
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
  }
}

// ── Language / file detection ───────────────────────────

/** Determine language from file extension */
export function languageFromPath(filePath: string): Language | null {
  const ext = extname(filePath)
  const map: Record<string, Language> = {
    ".ts": "typescript",
    ".tsx": "typescript",
    ".js": "javascript",
    ".jsx": "javascript",
    ".mjs": "javascript",
    ".cjs": "javascript",
  }
  return map[ext] ?? null
}

/** Check if a file is a JSX/TSX file */
export function isJsxFile(filePath: string): boolean {
  const ext = extname(filePath)
  return ext === ".tsx" || ext === ".jsx"
}

/** Check if a file is a JS/TS source file */
export function isJsTsFile(filePath: string): boolean {
  const lang = languageFromPath(filePath)
  return lang === "typescript" || lang === "javascript"
}

// ── Technical terms / skip lists ────────────────────────

/** Technical terms that should not be flagged as hardcoded strings */
export const TECHNICAL_TERMS = new Set([
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
])

/** Props that carry user-facing strings and should be i18n'd */
export const I18N_PROPS = new Set([
  "placeholder",
  "title",
  "aria-label",
  "alt",
  "label",
])

/** Props that are technical and should NOT be flagged */
export const TECHNICAL_PROPS = new Set([
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
])

// ── String classification helpers ─────────────────────────

/** Check if a string is emoji-only */
export function isEmojiOnly(str: string): boolean {
  const trimmed = str.trim()
  if (trimmed.length === 0) return false
  // Emoji regex: covers most common emoji ranges
  const emojiPattern = /^[\p{Emoji_Presentation}\p{Extended_Pictographic}\u200d\ufe0f\s]+$/u
  return emojiPattern.test(trimmed)
}

/** Check if a string is a pure number */
export function isNumberOnly(str: string): boolean {
  const trimmed = str.trim()
  return /^[\d.,\-+%]+$/.test(trimmed)
}

/** Check if a string is just whitespace / formatting */
export function isWhitespaceOnly(str: string): boolean {
  return str.trim().length === 0
}

/** Check if a string is a single word (no spaces, no hyphens connecting words) */
export function isSingleWord(str: string): boolean {
  const trimmed = str.trim()
  // Single word = no whitespace, no punctuation that suggests multi-word
  return trimmed.length > 0 && !/\s/.test(trimmed) && !/[-–—]/.test(trimmed)
}

/** Check if a string is a technical term */
export function isTechnicalTerm(str: string): boolean {
  return TECHNICAL_TERMS.has(str.trim())
}

/** Check if a hardcoded string should be skipped (not reported) */
export function shouldSkipJsxString(str: string): boolean {
  const trimmed = str.trim()
  if (trimmed.length === 0) return true
  if (isWhitespaceOnly(str)) return true
  if (isEmojiOnly(trimmed)) return true
  if (isNumberOnly(trimmed)) return true
  if (isSingleWord(trimmed) && isTechnicalTerm(trimmed)) return true
  // Skip single words that look like identifiers/technical
  if (isSingleWord(trimmed) && /^[a-z_$][a-zA-Z0-9_$]*$/.test(trimmed)) return true
  // Skip strings that look like CSS classes or technical values
  if (/^[a-z-]+$/.test(trimmed) && trimmed.length <= 20) return true
  // Skip punctuation-only
  if (/^[^\w\s]+$/u.test(trimmed)) return true
  // Skip very short single words (1-2 chars like "x", "a")
  if (isSingleWord(trimmed) && trimmed.length <= 2) return true
  return false
}

// ── Key / location helpers ────────────────────────────────

/** Convert a user-facing string to a suggested translation key */
export function toKeyHint(text: string): string {
  return text
    .replace(/[^a-zA-Z0-9\s]/g, "")
    .trim()
    .split(/\s+/)
    .map((w, i) => i === 0 ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join("")
    || "translationKey"
}

/** Find line number and column from a character offset in the content */
export function findLineByOffset(
  lines: { num: number; text: string }[],
  offset: number,
): { line: number; col: number; text: string } | null {
  let cumLen = 0
  for (const { num, text } of lines) {
    const lineLen = text.length + 1 // +1 for the \n
    if (cumLen + lineLen > offset) {
      return { line: num, col: offset - cumLen + 1, text }
    }
    cumLen += lineLen
  }
  return null
}

/** Escape a string for use in a RegExp */
export function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

// ── Prop-value helpers ──────────────────────────────────

/** Build a diagnostic for a hardcoded i18n prop value */
export function makePropDiag(
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
  })
}

/** Skip prop values that aren't really user-facing */
export function shouldSkipPropValue(value: string, _prop: string): boolean {
  const trimmed = value.trim()
  if (trimmed.length === 0) return true
  if (isEmojiOnly(trimmed)) return true
  if (isNumberOnly(trimmed)) return true
  // alt="" or similar empty-ish
  if (trimmed === "") return true
  // Technical alt values like "separator", "spacer", "bullet"
  if (_prop === "alt" && /^(separator|spacer|bullet|icon|logo|image|decorative|presentation)$/i.test(trimmed)) {
    return true
  }
  // aria-label with very technical content
  if (_prop === "aria-label" && isTechnicalTerm(trimmed) && isSingleWord(trimmed)) {
    return true
  }
  return false
}

// ── Locale loading ──────────────────────────────────────

export interface LocaleData {
  /** locale name (e.g. "en", "fr") */
  locale: string
  /** flat set of all keys (supports dot-notation) */
  keys: Set<string>
  /** file path */
  filePath: string
}

/** Flatten a nested JSON object into dot-notation keys */
export function flattenKeys(obj: Record<string, unknown>, prefix = ""): Set<string> {
  const keys = new Set<string>()
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const nested = flattenKeys(value as Record<string, unknown>, fullKey)
      for (const k of nested) keys.add(k)
    } else {
      keys.add(fullKey)
    }
  }
  return keys
}

/** Find locale JSON files in the project */
export async function findLocaleFiles(rootDir: string): Promise<string[]> {
  const candidates: string[] = []
  const searchDirs = ["messages", "locales", "i18n", "public/locales", "public/messages", "public/i18n", "src/locales", "src/i18n", "src/messages"]

  for (const dir of searchDirs) {
    const absDir = join(rootDir, dir)
    try {
      const dirStat = await stat(absDir)
      if (!dirStat.isDirectory()) continue
      const entries = await readdir(absDir)
      for (const entry of entries) {
        if (entry.endsWith(".json")) {
          candidates.push(join(absDir, entry))
        }
      }
    } catch {
      // directory doesn't exist, skip
    }
  }

  // Also search for root-level locale files (en.json, fr.json, etc.)
  try {
    const rootEntries = await readdir(rootDir)
    const localePattern = /^(en|fr|de|es|pt|it|nl|ja|ko|zh|ru|ar|hi|tr|pl|cs|sv|da|no|fi|uk|he|th|vi|id)\.json$/i
    for (const entry of rootEntries) {
      if (localePattern.test(entry)) {
        candidates.push(join(rootDir, entry))
      }
    }
  } catch {
    // can't read root, skip
  }

  return candidates
}

/** Load all locale files and return their data */
export async function loadLocales(rootDir: string): Promise<LocaleData[]> {
  const localeFiles = await findLocaleFiles(rootDir)
  const locales: LocaleData[] = []

  for (const filePath of localeFiles) {
    try {
      const content = await readFileContent(filePath)
      const json = JSON.parse(content)
      if (typeof json !== "object" || json === null || Array.isArray(json)) continue

      // Derive locale name from filename (e.g. en.json -> en, en-US.json -> en-US)
      const fileName = filePath.split("/").pop() ?? filePath.split("\\").pop() ?? "unknown"
      const localeName = fileName.replace(/\.json$/, "")

      const keys = flattenKeys(json as Record<string, unknown>)
      locales.push({ locale: localeName, keys, filePath })
    } catch {
      // skip unreadable or malformed JSON
    }
  }

  return locales
}

/** Extract translation keys from t() calls */
export function extractTranslationKeys(content: string): { key: string; offset: number }[] {
  const keys: { key: string; offset: number }[] = []

  // Match t('key'), t("key"), t(`key`), t('nested.key'), t("deep.nested.key")
  // Also handles: i18n.t('key'), i18next.t('key'), props.t('key')
  const tCallPattern = /(?:\bt|i18n\.t|i18next\.t|useTranslations\(\s*['"][^'"]*['"]\s*\)\.t)\s*\(\s*['"`]([^'"`\s]+)['"`]\s*[,\)]/g

  let match: RegExpExecArray | null
  while ((match = tCallPattern.exec(content)) !== null) {
    keys.push({ key: match[1], offset: match.index })
  }

  // Also match useTranslations('namespace') — these aren't keys but namespace refs
  // We don't extract these as missing keys, they're just namespace declarations

  return keys
}
