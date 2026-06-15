// ── I18n-Lint Engine ────────────────────────────────────
// Detects internationalization issues: hardcoded strings in JSX,
// missing translation keys, locale mismatches, and untranslated locales.

import { relative } from "node:path"
import type {
  Diagnostic,
  Engine,
  EngineContext,
  EngineResult,
} from "../../types/index.js"
import { processFiles } from "../../utils/batch-processor.js"
import type { FileData } from "../../utils/batch-processor.js"
import {
  isJsTsFile,
  isJsxFile,
  languageFromPath,
  loadLocales,
  LocaleData,
} from "./helpers.js"
import {
  detectHardcodedStringJsx,
  detectHardcodedStringProps,
  detectLocaleMismatch,
  detectMissingTranslationKeys,
  detectUntranslatedLocale,
} from "./rules.js"

// ── File Analysis ────────────────────────────────────────

async function analyzeFile(
  file: FileData,
  rootDir: string,
  locales: LocaleData[],
  hardcodedStringsEnabled: boolean,
  validateKeysEnabled: boolean,
): Promise<Diagnostic[]> {
  const diagnostics: Diagnostic[] = []
  const language = languageFromPath(file.filePath)
  if (!language) return diagnostics

  // Only process JS/TS files for i18n checks
  if (language !== "typescript" && language !== "javascript") return diagnostics

  const { content, lines } = file
  const relPath = relative(rootDir, file.filePath)
  const isJsx = isJsxFile(file.filePath)

  // Rule 1: Hardcoded strings in JSX (only for .tsx/.jsx files)
  if (hardcodedStringsEnabled && isJsx) {
    diagnostics.push(...detectHardcodedStringJsx(content, lines, relPath))
  }

  // Rule 2: Hardcoded strings in props (only for .tsx/.jsx files)
  if (hardcodedStringsEnabled && isJsx) {
    diagnostics.push(...detectHardcodedStringProps(content, lines, relPath))
  }

  // Rule 3: Missing translation keys (all JS/TS files)
  if (validateKeysEnabled) {
    diagnostics.push(...detectMissingTranslationKeys(content, lines, relPath, locales))
  }

  // Rule 4: Locale mismatch (all JS/TS files)
  diagnostics.push(...detectLocaleMismatch(content, lines, relPath))

  return diagnostics
}

// ── Engine Definition ───────────────────────────────────

export const i18nLintEngine: Engine = {
  name: "i18n-lint",
  description:
    "Internationalization linting engine. Detects hardcoded strings in JSX text and props, missing translation keys, direct locale imports bypassing the i18n system, and untranslated keys across locale files.",
  supportedLanguages: ["typescript", "javascript"],

  async run(context: EngineContext): Promise<EngineResult> {
    const start = performance.now()

    const files = context.files ?? []
    if (files.length === 0) {
      return {
        engine: "i18n-lint",
        diagnostics: [],
        elapsed: performance.now() - start,
        skipped: true,
        skipReason: "No files to scan (context.files is empty)",
      }
    }

    const { hardcodedStrings, validateKeys } = context.config.i18n

    // Load locale files for key validation and untranslated checks
    const locales = await loadLocales(context.rootDirectory)

    // Early exit heuristic: if no locale files exist and no source files show
    // i18n library usage, this project is likely not internationalized.
    const hasI18nUsage = await detectI18nUsage(files)
    if (locales.length === 0 && !hasI18nUsage) {
      return {
        engine: "i18n-lint",
        diagnostics: [],
        elapsed: performance.now() - start,
        skipped: true,
        skipReason: "No i18n configuration or usage detected in project",
      }
    }

    // Analyze each file
    const allDiagnostics: Diagnostic[] = []
    const batchSize = 20

    for (let i = 0; i < files.length; i += batchSize) {
      const batch = files.slice(i, i + batchSize)
      await processFiles(batch, async (file) => {
        const diags = await analyzeFile(file, context.rootDirectory, locales, hardcodedStrings, validateKeys)
        allDiagnostics.push(...diags)
      })
    }

    // Rule 5: Untranslated locale comparison (project-level, not per-file)
    if (validateKeys && locales.length >= 2) {
      allDiagnostics.push(...detectUntranslatedLocale(locales, context.rootDirectory))
    }

    return {
      engine: "i18n-lint",
      diagnostics: allDiagnostics,
      elapsed: performance.now() - start,
      skipped: false,
    }
  },
}

// ── Early-exit heuristic ───────────────────────────────────────

/** Fast check for i18n library usage in a sample of source files */
async function detectI18nUsage(files: string[]): Promise<boolean> {
  // Only check JS/TS files
  const sample = files.filter(isJsTsFile).slice(0, 40)
  let found = false
  await processFiles(sample, async (file) => {
    if (found) return
    const text = file.content
    if (
      /useTranslation\s*\(/s.test(text) ||
      /\bt\s*\(\s*['"`]/s.test(text) ||
      /react-i18next|i18next|vue-i18n|intl|react-intl|@lingui|i18n\.t|gettext/.test(text)
    ) {
      found = true
    }
  })
  return found
}
