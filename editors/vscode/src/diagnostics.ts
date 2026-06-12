import * as vscode from 'vscode';
import { ScanResult, ScanDiagnostic } from './scanner';

const severityMap: Record<string, vscode.DiagnosticSeverity> = {
  error: vscode.DiagnosticSeverity.Error,
  warning: vscode.DiagnosticSeverity.Warning,
  info: vscode.DiagnosticSeverity.Information,
  suggestion: vscode.DiagnosticSeverity.Hint,
};

/**
 * Update the VS Code diagnostic collection with scan results.
 * Clears all previous diagnostics, then sets new ones grouped by file.
 */
export function updateDiagnostics(
  collection: vscode.DiagnosticCollection,
  result: ScanResult
): void {
  collection.clear();

  // Group diagnostics by file path
  const byFile = new Map<string, ScanDiagnostic[]>();

  for (const engine of result.engines) {
    for (const d of engine.diagnostics) {
      const list = byFile.get(d.filePath) ?? [];
      list.push(d);
      byFile.set(d.filePath, list);
    }
  }

  for (const [filePath, diagnostics] of byFile) {
    const uri = vscode.Uri.file(filePath);
    const vsDiagnostics = diagnostics.map(toVsDiagnostic);
    collection.set(uri, vsDiagnostics);
  }
}

function toVsDiagnostic(d: ScanDiagnostic): vscode.Diagnostic {
  const severity = severityMap[d.severity] ?? vscode.DiagnosticSeverity.Warning;

  // VS Code lines/columns are 0-based; deep-slop output is 1-based
  const line = Math.max(d.line - 1, 0);
  const col = Math.max(d.column - 1, 0);

  const range = new vscode.Range(
    new vscode.Position(line, col),
    new vscode.Position(line, col + 1) // minimal 1-char range
  );

  const diag = new vscode.Diagnostic(range, d.message, severity);
  diag.source = 'deep-slop';
  diag.code = d.rule;

  if (d.help) {
    diag.relatedInformation = [
      new vscode.DiagnosticRelatedInformation(
        new vscode.Location(vscode.Uri.file(d.filePath), range),
        d.help
      ),
    ];
  }

  return diag;
}
