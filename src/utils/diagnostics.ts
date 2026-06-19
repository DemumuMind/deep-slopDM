import type { Category, Diagnostic, Severity, Suggestion } from '../types/index.js'

interface DiagnosticOpts {
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
}

/** Build a diagnostic, filling in the engine and category from the caller */
export function createDiagnostic(
  engine: string,
  category: Category,
  opts: DiagnosticOpts,
): Diagnostic {
  return {
    filePath: opts.filePath,
    engine,
    rule: opts.rule,
    severity: opts.severity,
    message: opts.message,
    help: opts.help,
    line: opts.line,
    column: opts.column,
    category,
    fixable: opts.fixable,
    suggestion: opts.suggestion,
    detail: opts.detail,
  }
}

/** Deduplicate diagnostics by file path + line + rule */
export function uniqueDiagnostics(diagnostics: Diagnostic[]): Diagnostic[] {
  const seen = new Set<string>()
  return diagnostics.filter((d) => {
    const key = `${d.filePath}:${d.line}:${d.rule}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
