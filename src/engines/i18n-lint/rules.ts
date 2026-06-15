// ── I18n-Lint Rules ────────────────────────────────────
// Rule implementations for the i18n-lint engine.

import { relative } from "node:path"
import type { Diagnostic } from "../../types/index.js"
import {
  diag,
  escapeRegex,
  extractTranslationKeys,
  findLineByOffset,
  I18N_PROPS,
  isSingleWord,
  isTechnicalTerm,
  LocaleData,
  makePropDiag,
  shouldSkipJsxString,
  shouldSkipPropValue,
  toKeyHint,
} from "./helpers.js"

// ── Rule 1: hardcoded-string-jsx ─────────────────────────

/**
 * Detect hardcoded string literals in JSX text content (between tags).
 * Pattern: `<div>Hello World</div>` or `<p>Submit Form</p>`
 * Skip: single words, technical terms, emoji-only, numbers, whitespace.
 */
export function detectHardcodedStringJsx(
  content: string,
  lines: { num: number; text: string }[],
  filePath: string,
): Diagnostic[] {
  const results: Diagnostic[] = []

  // Match JSX text content between opening and closing tags.
  // Pattern: >some text here< (text between > and <)
  // We need to find text that sits between > and < that is NOT
  // just whitespace, an expression {…}, or a child tag.
  const jsxTextPattern = />([^<{]+)</g

  let match: RegExpExecArray | null
  while ((match = jsxTextPattern.exec(content)) !== null) {
    const rawText = match[1]
    const fullMatch = match[0]

    // Skip if the text is only whitespace/formatting
    if (shouldSkipJsxString(rawText)) continue

    // Skip single words that aren't user-facing phrases
    if (isSingleWord(rawText.trim()) && isTechnicalTerm(rawText.trim())) continue
    if (isSingleWord(rawText.trim())) {
      // Single non-technical words like "Submit", "Cancel" are still user-facing
      // but single generic words like "ok" or technical terms should be skipped
      // We report multi-word strings and user-facing single words
      const word = rawText.trim()
      // Skip if it's clearly a code identifier (camelCase, snake_case)
      if (/^[a-z_$][a-zA-Z0-9_$]*$/.test(word)) continue
    }

    // Find the line number for this match
    const matchStart = match.index
    const lineInfo = findLineByOffset(lines, matchStart)
    if (!lineInfo) continue

    const col = lineInfo.text.indexOf(rawText.trim()) + 1 || lineInfo.col

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
    )
  }

  return results
}

// ── Rule 2: hardcoded-string-props ────────────────────────

/**
 * Detect hardcoded user-facing strings in component props:
 * placeholder=, title=, aria-label=, alt= (on images), label=
 * Skip: CSS class names, technical props (type=, name=, id=)
 */
export function detectHardcodedStringProps(
  content: string,
  lines: { num: number; text: string }[],
  filePath: string,
): Diagnostic[] {
  const results: Diagnostic[] = []

  // Match i18n-relevant props with string literal values
  // Handles: prop="value", prop='value', prop={`value`}
  for (const prop of I18N_PROPS) {
    // Double-quoted: prop="value"
    const doubleQuotedRe = new RegExp(
      `\\b${escapeRegex(prop)}\\s*=\\s*"([^"]+)"`,
      "g",
    )
    let match: RegExpExecArray | null
    while ((match = doubleQuotedRe.exec(content)) !== null) {
      const value = match[1]
      if (shouldSkipPropValue(value, prop)) continue
      const lineInfo = findLineByOffset(lines, match.index)
      if (!lineInfo) continue
      results.push(makePropDiag(filePath, prop, value, lineInfo))
    }

    // Single-quoted: prop='value'
    const singleQuotedRe = new RegExp(
      `\\b${escapeRegex(prop)}\\s*=\\s*'([^']+)'`,
      "g",
    )
    while ((match = singleQuotedRe.exec(content)) !== null) {
      const value = match[1]
      if (shouldSkipPropValue(value, prop)) continue
      const lineInfo = findLineByOffset(lines, match.index)
      if (!lineInfo) continue
      results.push(makePropDiag(filePath, prop, value, lineInfo))
    }

    // JSX expression: prop={`value`}  (template literal with just a string)
    const templateRe = new RegExp(
      `\\b${escapeRegex(prop)}\\s*=\\s*\\{\\s*\`([^\`]+)\`\\s*\\}`,
      "g",
    )
    while ((match = templateRe.exec(content)) !== null) {
      const value = match[1]
      if (shouldSkipPropValue(value, prop)) continue
      const lineInfo = findLineByOffset(lines, match.index)
      if (!lineInfo) continue
      results.push(makePropDiag(filePath, prop, value, lineInfo))
    }
  }

  return results
}

// ── Rule 3: missing-translation-key ───────────────────────

/**
 * Scan for t() or useTranslations() calls, extract keys,
 * then check if those keys exist in locale JSON files.
 * Report keys that don't exist in all locales.
 */
export function detectMissingTranslationKeys(
  content: string,
  lines: { num: number; text: string }[],
  filePath: string,
  locales: LocaleData[],
): Diagnostic[] {
  if (locales.length === 0) return []

  const results: Diagnostic[] = []
  const extractedKeys = extractTranslationKeys(content)

  for (const { key, offset } of extractedKeys) {
    // Check which locales have this key
    const missingIn: string[] = []
    for (const locale of locales) {
      if (!locale.keys.has(key)) {
        missingIn.push(locale.locale)
      }
    }

    if (missingIn.length > 0) {
      const lineInfo = findLineByOffset(lines, offset)
      if (!lineInfo) continue

      const allMissing = missingIn.length === locales.length
      const message = allMissing
        ? `Translation key "${key}" not found in any locale file`
        : `Translation key "${key}" missing in locale(s): ${missingIn.join(", ")}`

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
      )
    }
  }

  return results
}

// ── Rule 4: locale-mismatch ─────────────────────────────

/**
 * Detect components that import a specific locale string directly instead
 * of using the i18n system.
 * Pattern: importing from './ru.json' or hardcoded locale='ru'
 */
export function detectLocaleMismatch(
  content: string,
  lines: { num: number; text: string }[],
  filePath: string,
): Diagnostic[] {
  const results: Diagnostic[] = []

  // Pattern 1: Import from a specific locale JSON file
  // import x from './ru.json', import x from '../locales/de.json'
  const localeImportPattern = /import\s+[^;]*\s+from\s+['"][^'"]*\/(locales|i18n|messages)\/(en|fr|de|es|pt|it|nl|ja|ko|zh|ru|ar|hi|tr|pl|cs|sv|da|no|fi|uk|he|th|vi|id)[^/]*\.json['"]/gi
  // Also match relative paths like './ru.json', '../de.json'
  const directLocaleImportPattern = /import\s+[^;]*\s+from\s+['"]\.\.?\/[^'"]*(en|fr|de|es|pt|it|nl|ja|ko|zh|ru|ar|hi|tr|pl|cs|sv|da|no|fi|uk|he|th|vi|id)\.json['"]/gi

  for (const pattern of [localeImportPattern, directLocaleImportPattern]) {
    let match: RegExpExecArray | null
    while ((match = pattern.exec(content)) !== null) {
      const lineInfo = findLineByOffset(lines, match.index)
      if (!lineInfo) continue

      const importPath = match[0]
      // Extract the locale code from the match
      const localeMatch = importPath.match(/(en|fr|de|es|pt|it|nl|ja|ko|zh|ru|ar|hi|tr|pl|cs|sv|da|no|fi|uk|he|th|vi|id)\.json/i)
      const localeCode = localeMatch ? localeMatch[1] : "unknown"

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
      )
    }
  }

  // Pattern 2: Hardcoded locale prop — locale='ru' or locale="de"
  // But skip if it's a variable like locale={locale} or locale={i18n.language}
  const localePropPattern = /\blocale\s*=\s*['"](en|fr|de|es|pt|it|nl|ja|ko|zh|ru|ar|hi|tr|pl|cs|sv|da|no|fi|uk|he|th|vi|id)['"]/gi
  let propMatch: RegExpExecArray | null
  while ((propMatch = localePropPattern.exec(content)) !== null) {
    const lineInfo = findLineByOffset(lines, propMatch.index)
    if (!lineInfo) continue

    const localeCode = propMatch[1]

    // Skip if this appears to be in the i18n config itself
    const trimmedLine = lineInfo.text.trim()
    if (/i18n|initReactI18next|createInstance|config/.test(trimmedLine)) continue

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
    )
  }

  // Pattern 3: require() of a locale file
  const requireLocalePattern = /require\s*\(\s*['"][^'"]*(en|fr|de|es|pt|it|nl|ja|ko|zh|ru|ar|hi|tr|pl|cs|sv|da|no|fi|uk|he|th|vi|id)\.json['"]\s*\)/gi
  while ((propMatch = requireLocalePattern.exec(content)) !== null) {
    const lineInfo = findLineByOffset(lines, propMatch.index)
    if (!lineInfo) continue

    const localeCode = propMatch[1]
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
    )
  }

  return results
}

// ── Rule 5: untranslated-locale ──────────────────────────

/**
 * Compare keys across locale files, report keys present in one locale
 * but missing in another.
 */
export function detectUntranslatedLocale(
  locales: LocaleData[],
  rootDir: string,
): Diagnostic[] {
  if (locales.length < 2) return []

  const results: Diagnostic[] = []

  // Build a union of all keys across all locales
  const allKeys = new Set<string>()
  for (const locale of locales) {
    for (const key of locale.keys) {
      allKeys.add(key)
    }
  }

  // For each key, check which locales are missing it
  for (const key of allKeys) {
    const presentIn: string[] = []
    const missingIn: string[] = []

    for (const locale of locales) {
      if (locale.keys.has(key)) {
        presentIn.push(locale.locale)
      } else {
        missingIn.push(locale.locale)
      }
    }

    if (missingIn.length > 0 && presentIn.length > 0) {
      // Report per locale file where the key IS present (the source of truth)
      // Use the first locale that has the key as the "file path"
      const sourceLocale = locales.find((l) => l.keys.has(key))
      if (!sourceLocale) continue

      const relPath = relative(rootDir, sourceLocale.filePath)

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
      )
    }
  }

  return results
}
