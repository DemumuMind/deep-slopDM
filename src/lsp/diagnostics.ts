import {
  DiagnosticSeverity,
  type Diagnostic as LSPDiagnostic,
  type DiagnosticRelatedInformation,
  type Location,
  type Range,
} from 'vscode-languageserver/node'
import type { Diagnostic, Suggestion } from '../types/index.js'

// ── Severity Mapping ──────────────────────────────────────

const severityMap: Record<Diagnostic['severity'], DiagnosticSeverity> = {
  error: DiagnosticSeverity.Error,
  warning: DiagnosticSeverity.Warning,
  info: DiagnosticSeverity.Information,
  suggestion: DiagnosticSeverity.Hint,
}

// ── Range Conversion ────────────────────────────────────

/** Convert a 1-based deep-slop position to a 0-based LSP range. */
export function toLspRange(
  line: number,
  column: number,
  suggestion?: Suggestion,
): Range {
  if (suggestion?.range) {
    return {
      start: {
        line: suggestion.range.startLine - 1,
        character: suggestion.range.startCol - 1,
      },
      end: {
        line: suggestion.range.endLine - 1,
        character: suggestion.range.endCol - 1,
      },
    }
  }

  const zeroLine = line - 1
  const zeroChar = column - 1
  return {
    start: { line: zeroLine, character: zeroChar },
    end: { line: zeroLine, character: zeroChar },
  }
}

// ── Diagnostic Conversion ─────────────────────────────────

/** Convert a single deep-slop diagnostic into an LSP diagnostic. */
export function toLspDiagnostic(
  diagnostic: Diagnostic,
  uri: string,
): LSPDiagnostic {
  const range = toLspRange(
    diagnostic.line,
    diagnostic.column,
    diagnostic.suggestion,
  )

  const related: DiagnosticRelatedInformation[] = []
  if (diagnostic.help) {
    const location: Location = { uri, range }
    related.push({ location, message: diagnostic.help })
  }

  return {
    range,
    severity: severityMap[diagnostic.severity],
    code: diagnostic.rule,
    source: 'deep-slop',
    message: diagnostic.message,
    relatedInformation: related,
    data: diagnostic,
  }
}
