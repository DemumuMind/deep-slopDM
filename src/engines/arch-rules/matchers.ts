// ── Architecture Rules Matchers ─────────────────────────────────────
// Implements the three rule types: forbid_import, forbid_import_from_path,
// require_pattern. Extracts imports via regex for JS/TS, Python, and Go.

import { minimatch } from 'minimatch'
import type { ArchRule } from './loader.js'
import type { Diagnostic, Severity } from '../../types/index.js'

// ── Import Extraction ───────────────────────────────────────────────

interface ExtractedImport {
  /** Line number (1-based) */
  line: number
  /** Import specifier / module path */
  source: string
  /** Raw line text */
  raw: string
}

/** Extract imports from JS/TS content */
function extractJsImports(content: string): ExtractedImport[] {
  const imports: ExtractedImport[] = []
  const lines = content.split('\n')

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim()
    const lineNum = i + 1

    // import ... from '...'
    const staticMatch = trimmed.match(
      /^import\s+(?:type\s+)?(?:\{[^}]*\}|\*\s+as\s+\w+|\w+)\s+from\s+['"]([^'"]+)['"]/
    )
    if (staticMatch) {
      imports.push({ line: lineNum, source: staticMatch[1], raw: trimmed })
      continue
    }

    // import '...' (side-effect)
    const sideEffectMatch = trimmed.match(/^import\s+['"]([^'"]+)['"]/)
    if (sideEffectMatch) {
      imports.push({ line: lineNum, source: sideEffectMatch[1], raw: trimmed })
      continue
    }

    // dynamic import('...')
    const dynMatch = trimmed.match(/import\s*\(\s*['"]([^'"]+)['"]\s*\)/)
    if (dynMatch) {
      imports.push({ line: lineNum, source: dynMatch[1], raw: trimmed })
      continue
    }

    // require('...')
    const reqMatch = trimmed.match(/(?:const|let|var)\s+[^=]*=\s*require\s*\(\s*['"]([^'"]+)['"]\s*\)/)
    if (reqMatch) {
      imports.push({ line: lineNum, source: reqMatch[1], raw: trimmed })
    }
  }

  return imports
}

/** Extract imports from Python content */
function extractPythonImports(content: string): ExtractedImport[] {
  const imports: ExtractedImport[] = []
  const lines = content.split('\n')

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim()
    const lineNum = i + 1

    // from X import ...
    const fromMatch = trimmed.match(/^from\s+([^\s]+)\s+import/)
    if (fromMatch) {
      imports.push({ line: lineNum, source: fromMatch[1], raw: trimmed })
      continue
    }

    // import X
    const importMatch = trimmed.match(/^import\s+([^\s,]+)/)
    if (importMatch) {
      imports.push({ line: lineNum, source: importMatch[1], raw: trimmed })
    }
  }

  return imports
}

/** Extract imports from Go content */
function extractGoImports(content: string): ExtractedImport[] {
  const imports: ExtractedImport[] = []
  const lines = content.split('\n')

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim()
    const lineNum = i + 1

    // import "pkg" (single)
    const singleMatch = trimmed.match(/^import\s+"([^"]+)"/)
    if (singleMatch) {
      imports.push({ line: lineNum, source: singleMatch[1], raw: trimmed })
      continue
    }

    // "pkg" inside import block (multi-line)
    const multiMatch = trimmed.match(/^"([^"]+)"$/)
    if (multiMatch) {
      // Only count if we're inside an import block (heuristic: previous or nearby lines contain "import")
      const nearby = content.substring(Math.max(0, content.indexOf(lines[i]) - 200), content.indexOf(lines[i]) + lines[i].length)
      if (nearby.includes('import') && nearby.includes('(')) {
        imports.push({ line: lineNum, source: multiMatch[1], raw: trimmed })
      }
    }
  }

  return imports
}

/** Detect language from file extension and extract imports */
export function extractImportsFromContent(content: string, filePath: string): ExtractedImport[] {
  const ext = filePath.split('.').pop() ?? ''

  if (['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs'].includes(ext)) {
    return extractJsImports(content)
  }
  if (['py', 'pyw'].includes(ext)) {
    return extractPythonImports(content)
  }
  if (ext === 'go') {
    return extractGoImports(content)
  }

  // Fallback: try JS-style extraction
  return extractJsImports(content)
}

// ── Glob Matching ───────────────────────────────────────────────────

/** Check if a path matches a glob pattern */
function globMatch(pattern: string, path: string): boolean {
  return minimatch(path, pattern, { dot: true })
}

// ── Rule Matchers ───────────────────────────────────────────────────

/** Build a diagnostic for an arch-rules violation */
function buildDiag(opts: {
  filePath: string
  rule: ArchRule
  line: number
  column: number
  message: string
  help: string
}): Diagnostic {
  return {
    filePath: opts.filePath,
    engine: 'arch-rules',
    rule: `arch-rules/${opts.rule.name}`,
    severity: opts.rule.severity as Severity,
    message: opts.message,
    help: opts.help,
    line: opts.line,
    column: opts.column,
    category: 'architecture',
    fixable: false,
    detail: {
      ruleName: opts.rule.name,
      ruleType: opts.rule.type,
    },
  }
}

/**
 * forbid_import: Checks if a file contains a forbidden import.
 * The `forbid` field is a glob that matches against import sources.
 * The `match` field is a glob that selects which files to check.
 */
export function applyForbidImport(
  rule: ArchRule,
  content: string,
  filePath: string,
): Diagnostic[] {
  if (!rule.forbid) return []

  // Check if file matches the rule's file glob
  if (!globMatch(rule.match, filePath)) return []

  // Check optional `where` condition
  if (rule.where && !globMatch(rule.where, filePath)) return []

  const imports = extractImportsFromContent(content, filePath)
  const results: Diagnostic[] = []

  for (const imp of imports) {
    if (globMatch(rule.forbid, imp.source)) {
      const col = imp.raw.indexOf(imp.source) + 1
      results.push(buildDiag({
        filePath,
        rule,
        line: imp.line,
        column: Math.max(col, 1),
        message: `Forbidden import '${imp.source}' found (rule: ${rule.name})`,
        help: `The rule "${rule.name}" forbids importing modules matching "${rule.forbid}". Remove this import or update the rule.`,
      }))
    }
  }

  return results
}

/**
 * forbid_import_from_path: Checks cross-layer imports.
 * Files matching `match` must not import from paths matching `from`.
 * The `forbid` field specifies what is being imported (glob on import source).
 * The `from` field specifies the source path pattern that triggers the violation.
 */
export function applyForbidImportFromPath(
  rule: ArchRule,
  content: string,
  filePath: string,
): Diagnostic[] {
  if (!rule.forbid || !rule.from) return []

  // Check if file matches the rule's file glob
  if (!globMatch(rule.match, filePath)) return []

  // Check optional `where` condition
  if (rule.where && !globMatch(rule.where, filePath)) return []

  const imports = extractImportsFromContent(content, filePath)
  const results: Diagnostic[] = []

  for (const imp of imports) {
    // The import source must match the `forbid` glob
    if (!globMatch(rule.forbid, imp.source)) continue

    // The import source must also match the `from` path pattern
    if (!globMatch(rule.from, imp.source)) continue

    const col = imp.raw.indexOf(imp.source) + 1
    results.push(buildDiag({
      filePath,
      rule,
      line: imp.line,
      column: Math.max(col, 1),
      message: `Cross-layer import: '${imp.source}' is forbidden from '${filePath}' (rule: ${rule.name})`,
      help: `The rule "${rule.name}" forbids importing "${rule.forbid}" from "${rule.from}" in files matching "${rule.match}". Refactor to use a service layer or adapter instead.`,
    }))
  }

  return results
}

/**
 * require_pattern: Checks that a required regex pattern exists in the file.
 * The `match` field is a glob that selects which files to check.
 * The `pattern` field is a regex that must be present in the file content.
 */
export function applyRequirePattern(
  rule: ArchRule,
  content: string,
  filePath: string,
): Diagnostic[] {
  if (!rule.pattern) return []

  // Check if file matches the rule's file glob
  if (!globMatch(rule.match, filePath)) return []

  // Check optional `where` condition
  if (rule.where && !globMatch(rule.where, filePath)) return []

  const results: Diagnostic[] = []

  try {
    const regex = new RegExp(rule.pattern, 'm')
    if (!regex.test(content)) {
      results.push(buildDiag({
        filePath,
        rule,
        line: 1,
        column: 1,
        message: `Required pattern /${rule.pattern}/ not found (rule: ${rule.name})`,
        help: `The rule "${rule.name}" requires files matching "${rule.match}" to contain the pattern /${rule.pattern}/. Add the required pattern to this file.`,
      }))
    }
  } catch (err) {
    // Invalid regex in rule — report as info
    results.push(buildDiag({
      filePath,
      rule,
      line: 1,
      column: 1,
      message: `Rule "${rule.name}" has invalid regex pattern: ${rule.pattern}`,
      help: `Fix the regex pattern in .deep-slop/rules.yml for rule "${rule.name}".`,
    }))
  }

  return results
}

/**
 * Apply a single rule to a file, dispatching to the correct matcher.
 */
export function applyRule(
  rule: ArchRule,
  content: string,
  filePath: string,
): Diagnostic[] {
  switch (rule.type) {
    case 'forbid_import':
      return applyForbidImport(rule, content, filePath)
    case 'forbid_import_from_path':
      return applyForbidImportFromPath(rule, content, filePath)
    case 'require_pattern':
      return applyRequirePattern(rule, content, filePath)
    default:
      return []
  }
}

