// ── Format-Lint Engine ──────────────────────────────────
// Detects formatting inconsistencies: mixed indentation,
// inconsistent quote style, max line length, inconsistent
// semicolons, blank line clusters, and trailing comma issues.

import { readdir } from 'node:fs/promises'
import { join, relative, extname } from 'node:path'
import type {
  Diagnostic,
  Engine,
  EngineContext,
  EngineResult,
  Language,
} from '../../types/index.js'
import {
  buildEarlyExitResult,
  EARLY_EXIT_BATCH_SIZE,
  isEngineEarlyExitEnabled,
} from '../../config/engine-utils.js'
import { readFileContent, toLines } from '../../utils/file-utils.js'

// ── Helpers ──────────────────────────────────────────────

const ALL_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.py', '.go', '.rs', '.rb', '.php', '.java',
  '.cs', '.swift',
  '.json', '.yaml', '.yml', '.css', '.html', '.md',
])

const JS_TS_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
])

function isRelevantFile(filePath: string): boolean {
  const ext = extname(filePath)
  return ALL_EXTENSIONS.has(ext)
}

function isJsTsFile(filePath: string): boolean {
  const ext = extname(filePath)
  return JS_TS_EXTENSIONS.has(ext)
}

function languageFromExt(filePath: string): Language | null {
  const ext = extname(filePath)
  const map: Record<string, Language> = {
    '.ts': 'typescript',
    '.tsx': 'tsx',
    '.js': 'javascript',
    '.jsx': 'jsx',
    '.mjs': 'javascript',
    '.cjs': 'javascript',
    '.py': 'python',
    '.go': 'go',
    '.rs': 'rust',
    '.rb': 'ruby',
    '.php': 'php',
    '.java': 'java',
    '.cs': 'csharp',
    '.swift': 'swift',
  }
  return map[ext] ?? null
}

/** Recursively collect file paths under root, respecting exclude list */
async function collectFiles(
  root: string,
  exclude: string[],
): Promise<string[]> {
  const results: string[] = []

  async function walk(dir: string): Promise<void> {
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const full = join(dir, entry.name)
      if (exclude.some((pat) => full.includes(pat))) continue
      if (entry.isDirectory()) {
        await walk(full)
      } else if (entry.isFile() && isRelevantFile(full)) {
        results.push(full)
      }
    }
  }

  await walk(root)
  return results
}

/** Make a diagnostic with sensible defaults for format-lint */
function makeDiagnostic(
  overrides: Partial<Diagnostic> & Pick<Diagnostic, 'filePath' | 'rule' | 'message' | 'line'>,
): Diagnostic {
  return {
    engine: 'format-lint',
    severity: 'info',
    column: 1,
    category: 'style',
    fixable: false,
    help: '',
    ...overrides,
  }
}

// ── Rule 1: inconsistent-indent ────────────────────────
// Detects files that mix tabs and spaces for indentation

function detectInconsistentIndent(
  content: string,
  lines: { num: number; text: string }[],
  filePath: string,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = []
  const hasTab = /^[\t]/m.test(content)
  const hasSpace = /^ [^\s]/m.test(content) || /^ {2,}/m.test(content)

  if (!hasTab || !hasSpace) return diagnostics

  // Find lines that use the minority indent style
  let tabLines = 0
  let spaceLines = 0
  const indentLines: { num: number; text: string; usesTab: boolean }[] = []

  for (const { num, text } of lines) {
    if (text.length === 0) continue
    const leading = text.match(/^[\t ]+/)
    if (!leading) continue
    const indent = leading[0]
    const usesTab = indent.includes('\t')
    const usesSpace = indent.includes(' ')

    if (usesTab && !usesSpace) {
      tabLines++
      indentLines.push({ num, text, usesTab: true })
    } else if (usesSpace && !usesTab) {
      spaceLines++
      indentLines.push({ num, text, usesTab: false })
    }
    // Mixed on same line is handled by syntax-deep/mixed-indent-line
  }

  if (tabLines === 0 || spaceLines === 0) return diagnostics

  // Report the minority style
  const minorityIsTab = tabLines < spaceLines
  const minorityLines = indentLines.filter((l) => l.usesTab === minorityIsTab)
  const majorityLabel = minorityIsTab ? 'spaces' : 'tabs'
  const minorityLabel = minorityIsTab ? 'tabs' : 'spaces'

  // Report up to 5 minority lines to avoid flood
  const reported = minorityLines.slice(0, 5)
  for (const { num } of reported) {
    diagnostics.push(
      makeDiagnostic({
        filePath,
        rule: 'format-lint/inconsistent-indent',
        message: `Mixed indentation: file uses ${majorityLabel} primarily but ${minorityLabel} on this line`,
        line: num,
        severity: 'warning',
        help: `Standardize on one indentation style (${majorityLabel}) throughout the file`,
        fixable: true,
        suggestion: {
          type: 'replace',
          text: minorityIsTab ? '// Replace tabs with spaces' : '// Replace leading spaces with tabs',
          confidence: 0.85,
          reason: `Mixed indentation causes rendering differences across editors and breaks tooling that expects consistent indentation`,
        },
        detail: { majorityStyle: majorityLabel, minorityStyle: minorityLabel, minorityCount: minorityLines.length },
      }),
    )
  }

  return diagnostics
}

// ── Rule 2: inconsistent-quotes ─────────────────────────
// Detects files that mix single and double quotes for strings

function detectInconsistentQuotes(
  content: string,
  lines: { num: number; text: string }[],
  filePath: string,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = []

  // Only check JS/TS files
  if (!isJsTsFile(filePath)) return diagnostics

  const singleQuoteRe = /(^|[^\\])'[^']*'/g
  const doubleQuoteRe = /(^|[^\\])"[^"]*"/g

  // Skip template literal lines, import paths, and JSX string props
  const isImportLine = (text: string) => /^\s*import\s+/.test(text) || /^\s*export\s+/.test(text)
  const isJsxProp = (text: string) => /=["']/.test(text)

  let singleCount = 0
  let doubleCount = 0
  const quoteLines: { num: number; hasSingle: boolean; hasDouble: boolean }[] = []

  for (const { num, text } of lines) {
    const trimmed = text.trim()
    if (trimmed.length === 0) continue
    if (isImportLine(trimmed)) continue

    // Reset regex lastIndex
    singleQuoteRe.lastIndex = 0
    doubleQuoteRe.lastIndex = 0

    const hasSingle = singleQuoteRe.test(trimmed)
    const hasDouble = doubleQuoteRe.test(trimmed)

    if (hasSingle) singleCount++
    if (hasDouble) doubleCount++
    if (hasSingle || hasDouble) {
      quoteLines.push({ num, hasSingle, hasDouble })
    }
  }

  if (singleCount === 0 || doubleCount === 0) return diagnostics

  // Determine majority
  const majorityIsSingle = singleCount > doubleCount
  const majorityLabel = majorityIsSingle ? 'single' : 'double'
  const minorityLabel = majorityIsSingle ? 'double' : 'single'

  // Report lines using minority quote style (up to 5)
  const minorityLines = quoteLines
    .filter((l) => majorityIsSingle ? l.hasDouble : l.hasSingle)
    .slice(0, 5)

  for (const { num } of minorityLines) {
    diagnostics.push(
      makeDiagnostic({
        filePath,
        rule: 'format-lint/inconsistent-quotes',
        message: `Mixed quote styles: file primarily uses ${majorityLabel} quotes but ${minorityLabel} quotes here`,
        line: num,
        severity: 'info',
        help: `Standardize on ${majorityLabel} quotes throughout the file, or configure Prettier/ESLint to enforce a style`,
        fixable: true,
        suggestion: {
          type: 'replace',
          text: `// Use ${majorityLabel} quotes consistently`,
          confidence: 0.7,
          reason: `Mixed quote styles are inconsistent; picking one style reduces noise in diffs and reviews`,
        },
        detail: { majorityStyle: majorityLabel, minorityStyle: minorityLabel, singleCount, doubleCount },
      }),
    )
  }

  return diagnostics
}

// ── Rule 3: max-line-length ─────────────────────────────

function detectMaxLineLength(
  content: string,
  lines: { num: number; text: string }[],
  filePath: string,
  maxLength: number,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = []

  for (const { num, text } of lines) {
    // Skip lines that are just long URLs or import paths
    const trimmed = text.trim()
    if (/^\s*import\s+/.test(trimmed)) continue
    if (/^https?:\/\//.test(trimmed)) continue

    if (text.length > maxLength) {
      diagnostics.push(
        makeDiagnostic({
          filePath,
          rule: 'format-lint/max-line-length',
          message: `Line exceeds ${maxLength} characters (${text.length} chars)`,
          line: num,
          column: maxLength + 1,
          severity: 'info',
          help: 'Break long lines into multiple lines for readability, or configure Prettier printWidth',
          fixable: false,
          suggestion: {
            type: 'refactor',
            text: '// Break into multiple lines',
            confidence: 0.5,
            reason: 'Long lines require horizontal scrolling and reduce readability in code review and terminals',
          },
          detail: { lineLength: text.length, maxLength },
        }),
      )
    }
  }

  // Cap at 10 diagnostics per file to avoid flooding
  return diagnostics.slice(0, 10)
}

// ── Rule 4: inconsistent-semicolons ─────────────────────
// Detects inconsistent semicolon usage in JS/TS files

function detectInconsistentSemicolons(
  content: string,
  lines: { num: number; text: string }[],
  filePath: string,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = []

  if (!isJsTsFile(filePath)) return diagnostics

  // Track statement lines that end with or without semicolons
  const statementRe = /^(?:return|throw|const|let|var|export|import|function|class|interface|type|enum)\b/

  let withSemi = 0
  let withoutSemi = 0
  const semiLines: { num: number; hasSemi: boolean }[] = []

  for (const { num, text } of lines) {
    const trimmed = text.trim()
    if (trimmed.length === 0) continue
    if (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) continue
    if (trimmed.startsWith('import ') || trimmed.startsWith('export type')) continue

    // Check for lines that look like statements
    const isStatement = statementRe.test(trimmed) ||
      /^[a-zA-Z_$][a-zA-Z0-9_$]*\s*[=+\-*/]/.test(trimmed) ||
      /^[a-zA-Z_$][a-zA-Z0-9_$]*\s*\(/.test(trimmed) ||
      /^this\./.test(trimmed) ||
      /^\./.test(trimmed)

    if (!isStatement) continue

    const endsWithSemi = /;\s*$/.test(trimmed)
    const endsWithoutSemi = /[^;{(\[]\s*$/.test(trimmed) && !trimmed.endsWith('{') && !trimmed.endsWith('(') && !trimmed.endsWith('[') && !trimmed.endsWith(',')

    if (endsWithSemi) {
      withSemi++
      semiLines.push({ num, hasSemi: true })
    } else if (endsWithoutSemi && !trimmed.endsWith('}')) {
      withoutSemi++
      semiLines.push({ num, hasSemi: false })
    }
  }

  if (withSemi === 0 || withoutSemi === 0) return diagnostics

  const majorityHasSemi = withSemi > withoutSemi
  const minorityLabel = majorityHasSemi ? 'without semicolons' : 'with semicolons'
  const majorityLabel = majorityHasSemi ? 'with semicolons' : 'without semicolons'

  const minorityLines = semiLines
    .filter((l) => l.hasSemi !== majorityHasSemi)
    .slice(0, 5)

  for (const { num } of minorityLines) {
    diagnostics.push(
      makeDiagnostic({
        filePath,
        rule: 'format-lint/inconsistent-semicolons',
        message: `Inconsistent semicolons: file mostly uses ${majorityLabel} but this line is ${minorityLabel}`,
        line: num,
        severity: 'info',
        help: `Standardize on one semicolon style: ${majorityLabel}. Configure ESLint semi rule or Prettier semi option`,
        fixable: true,
        suggestion: {
          type: 'replace',
          text: majorityHasSemi ? '// Add semicolon' : '// Remove semicolon',
          confidence: 0.75,
          reason: 'Inconsistent semicolon usage creates noise in diffs and makes the codebase harder to read',
        },
        detail: { majorityStyle: majorityLabel, withSemi, withoutSemi },
      }),
    )
  }

  return diagnostics
}

// ── Rule 5: blank-line-cluster ──────────────────────────
// Detects 3+ consecutive blank lines

function detectBlankLineCluster(
  content: string,
  lines: { num: number; text: string }[],
  filePath: string,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = []
  let blankRun = 0
  let runStartLine = 0

  for (const { num, text } of lines) {
    if (text.trim().length === 0) {
      if (blankRun === 0) runStartLine = num
      blankRun++
    } else {
      if (blankRun >= 3) {
        diagnostics.push(
          makeDiagnostic({
            filePath,
            rule: 'format-lint/blank-line-cluster',
            message: `${blankRun} consecutive blank lines — excessive whitespace`,
            line: runStartLine,
            severity: 'suggestion',
            help: 'Reduce to 1-2 blank lines for readability. Most style guides recommend at most 2 blank lines between sections',
            fixable: true,
            suggestion: {
              type: 'delete',
              text: '',
              confidence: 0.95,
              reason: 'Excessive blank lines waste vertical space and add noise; 1-2 blank lines are sufficient for visual separation',
              range: {
                startLine: runStartLine + 1,
                startCol: 1,
                endLine: runStartLine + blankRun - 1,
                endCol: 1,
              },
            },
            detail: { blankCount: blankRun, startLine: runStartLine },
          }),
        )
      }
      blankRun = 0
    }
  }

  // Check final run
  if (blankRun >= 3) {
    diagnostics.push(
      makeDiagnostic({
        filePath,
        rule: 'format-lint/blank-line-cluster',
        message: `${blankRun} consecutive blank lines at end of file — excessive whitespace`,
        line: runStartLine,
        severity: 'suggestion',
        help: 'Reduce to 1 blank line at end of file',
        fixable: true,
        suggestion: {
          type: 'delete',
          text: '',
          confidence: 0.95,
          reason: 'Excessive trailing blank lines add noise; one blank line is sufficient before EOF',
        },
        detail: { blankCount: blankRun, startLine: runStartLine },
      }),
    )
  }

  return diagnostics
}

// ── Rule 6: trailing-comma-inconsistency ─────────────────
// Detects mixed trailing comma usage in multi-line structures

function detectTrailingCommaInconsistency(
  content: string,
  lines: { num: number; text: string }[],
  filePath: string,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = []

  if (!isJsTsFile(filePath)) return diagnostics

  // Look at lines that close multi-line arrays/objects/params
  // A trailing comma is when the last item before a closing bracket has a comma
  const closingLineRe = /^\s*[}\])]\s*[;,]?\s*$/
  const lastItemWithComma = /^\s*[^/].*,\s*$/
  const lastItemNoComma = /^\s*[^/].*[^,]\s*$/

  let trailingCount = 0
  let noTrailingCount = 0
  const commaLines: { num: number; hasTrailing: boolean }[] = []

  for (let i = 0; i < lines.length - 1; i++) {
    const current = lines[i]
    const next = lines[i + 1]
    const trimmed = current.text.trim()

    // Skip comments and empty lines
    if (trimmed.length === 0 || trimmed.startsWith('//')) continue

    // Check if next line is a closing bracket
    if (!closingLineRe.test(next.text.trim())) continue

    const hasTrailing = lastItemWithComma.test(trimmed) && !trimmed.startsWith('//')
    const noTrailing = lastItemNoComma.test(trimmed) && !trimmed.startsWith('//')

    if (hasTrailing) {
      trailingCount++
      commaLines.push({ num: current.num, hasTrailing: true })
    } else if (noTrailing) {
      noTrailingCount++
      commaLines.push({ num: current.num, hasTrailing: false })
    }
  }

  if (trailingCount === 0 || noTrailingCount === 0) return diagnostics

  const majorityTrailing = trailingCount > noTrailingCount
  const minorityLabel = majorityTrailing ? 'without trailing commas' : 'with trailing commas'
  const majorityLabel = majorityTrailing ? 'with trailing commas' : 'without trailing commas'

  const minorityLines = commaLines
    .filter((l) => l.hasTrailing !== majorityTrailing)
    .slice(0, 5)

  for (const { num } of minorityLines) {
    diagnostics.push(
      makeDiagnostic({
        filePath,
        rule: 'format-lint/trailing-comma-inconsistency',
        message: `Inconsistent trailing commas: file mostly ${majorityLabel} but this line is ${minorityLabel}`,
        line: num,
        severity: 'info',
        help: `Standardize trailing comma style. Configure ESLint comma-dangle or Prettier trailingComma`,
        fixable: true,
        suggestion: {
          type: 'replace',
          text: majorityTrailing ? '// Add trailing comma' : '// Remove trailing comma',
          confidence: 0.8,
          reason: 'Inconsistent trailing commas create diff noise and make refactoring error-prone',
        },
        detail: { majorityStyle: majorityLabel, trailingCount, noTrailingCount },
      }),
    )
  }

  return diagnostics
}

// ── Main Engine ──────────────────────────────────────────

export const formatLintEngine: Engine = {
  name: 'format-lint' as const,
  description:
    'Format linting: mixed indentation, inconsistent quotes, max line length, inconsistent semicolons, blank line clusters, trailing comma inconsistency',
  supportedLanguages: ['typescript', 'javascript', 'tsx', 'jsx', 'python', 'go', 'rust', 'ruby', 'php', 'java', 'csharp', 'swift'],

  async run(context: EngineContext): Promise<EngineResult> {
    const start = Date.now()
    const diagnostics: Diagnostic[] = []
    const { rootDirectory, config, files: specifiedFiles } = context

    // Max line length from config (quality.maxFileLoc or default 120)
    const maxLineLength = (config as Record<string, Record<string, unknown>>).format?.maxLineLength as number ?? 120

    // Collect files
    const filePaths = specifiedFiles
      ? specifiedFiles.filter(isRelevantFile)
      : await collectFiles(rootDirectory, config.exclude)

    if (filePaths.length === 0) {
      return {
        engine: this.name,
        diagnostics: [],
        elapsed: Date.now() - start,
        skipped: true,
        skipReason: 'No relevant files found to analyze',
      }
    }

    // Read and analyze each file
    const earlyExit = isEngineEarlyExitEnabled(
      context.config.engines['format-lint'],
      'format-lint',
    )

    for (let i = 0; i < filePaths.length; i++) {
      const fp = filePaths[i]
      try {
        const content = await readFileContent(fp)
        const relPath = relative(rootDirectory, fp)
        const lines = toLines(content)

        // Rule 1: Inconsistent indentation
        diagnostics.push(...detectInconsistentIndent(content, lines, relPath))

        // Rule 2: Inconsistent quotes (JS/TS only)
        diagnostics.push(...detectInconsistentQuotes(content, lines, relPath))

        // Rule 3: Max line length
        diagnostics.push(...detectMaxLineLength(content, lines, relPath, maxLineLength))

        // Rule 4: Inconsistent semicolons (JS/TS only)
        diagnostics.push(...detectInconsistentSemicolons(content, lines, relPath))

        // Rule 5: Blank line clusters
        diagnostics.push(...detectBlankLineCluster(content, lines, relPath))

        // Rule 6: Trailing comma inconsistency (JS/TS only)
        diagnostics.push(...detectTrailingCommaInconsistency(content, lines, relPath))
      } catch {
        // Skip unreadable files
      }

      if (
        earlyExit &&
        i === EARLY_EXIT_BATCH_SIZE - 1 &&
        filePaths.length > EARLY_EXIT_BATCH_SIZE &&
        diagnostics.length === 0
      ) {
        return buildEarlyExitResult('format-lint', Date.now() - start)
      }
    }

    // Deduplicate diagnostics (same file + line + rule)
    const seen = new Set<string>()
    const unique = diagnostics.filter((d) => {
      const key = `${d.filePath}:${d.line}:${d.rule}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })

    return {
      engine: this.name,
      diagnostics: unique,
      elapsed: Date.now() - start,
      skipped: false,
    }
  },
}

