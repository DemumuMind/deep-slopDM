import type { ScanResult, Severity, EngineName, Category } from "../types/index.js";

/** Format scan result for terminal output */
export function formatOutput(result: ScanResult): string {
  const lines: string[] = [];

  // Header
  lines.push("");
  lines.push("  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  lines.push(`  deep-slop scan results`);
  lines.push("  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  lines.push("");

  // Score
  const scoreColor = result.score >= 90 ? "🟢" : result.score >= 70 ? "🟡" : "🔴";
  lines.push(`  ${scoreColor} Score: ${result.score}/100`);
  lines.push(`  📁 Files: ${result.meta.filesScanned} | ⏱️ ${Math.round(result.meta.elapsed)}ms`);
  lines.push(`  🔤 Languages: ${result.meta.languages.join(", ")}`);
  lines.push(`  🏗️  Frameworks: ${result.meta.frameworks.join(", ")}`);
  lines.push("");

  // By severity
  lines.push("  Issues by severity:");
  lines.push(`    🔴 Errors:      ${result.bySeverity.error}`);
  lines.push(`    🟡 Warnings:    ${result.bySeverity.warning}`);
  lines.push(`    🔵 Info:         ${result.bySeverity.info}`);
  lines.push(`    💡 Suggestions:  ${result.bySeverity.suggestion}`);
  lines.push("");

  // By engine
  if (Object.keys(result.byEngine).length > 0) {
    lines.push("  Issues by engine:");
    for (const [engine, count] of Object.entries(result.byEngine)) {
      if (count > 0) {
        lines.push(`    ${engine.padEnd(22)} ${count}`);
      }
    }
    lines.push("");
  }

  // Diagnostics
  const allDiags = result.engines.flatMap((e) => e.diagnostics);
  const sorted = allDiags.sort((a, b) => {
    const sevOrder: Record<Severity, number> = { error: 0, warning: 1, info: 2, suggestion: 3 };
    return sevOrder[a.severity] - sevOrder[b.severity] || a.line - b.line;
  });

  // Show top 50 diagnostics
  const shown = sorted.slice(0, 50);
  if (shown.length > 0) {
    lines.push("  Top issues:");
    lines.push("");
    for (const d of shown) {
      const icon: Record<Severity, string> = { error: "🔴", warning: "🟡", info: "🔵", suggestion: "💡" };
      const loc = `${d.filePath}:${d.line}:${d.column}`;
      lines.push(`  ${icon[d.severity]} ${d.engine}/${d.rule}`);
      lines.push(`     ${d.message}`);
      lines.push(`     ${loc}`);
      if (d.suggestion) {
        lines.push(`     💡 ${d.suggestion.reason}`);
        lines.push(`     → ${d.suggestion.text.slice(0, 80)}${d.suggestion.text.length > 80 ? "..." : ""}`);
      }
      lines.push("");
    }

    if (sorted.length > 50) {
      lines.push(`  ... and ${sorted.length - 50} more issues`);
      lines.push("");
    }
  } else {
    lines.push("  ✨ No issues found! Code looks clean.");
    lines.push("");
  }

  // Skipped engines
  const skipped = result.engines.filter((e) => e.skipped);
  if (skipped.length > 0) {
    lines.push("  Skipped engines:");
    for (const e of skipped) {
      lines.push(`    ⏭️ ${e.engine}: ${e.skipReason}`);
    }
    lines.push("");
  }

  lines.push("  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  lines.push("");

  return lines.join("\n");
}
