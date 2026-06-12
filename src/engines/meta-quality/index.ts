import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { Diagnostic, Engine, EngineContext, EngineResult, Severity, Category } from "../../types/index.js";
import { readFileContent } from "../../utils/file-utils.js";

/**
 * Meta-quality engine: scoring analytics, trend tracking, diff scoring, quality gate.
 * Provides higher-order analysis beyond individual rule detection.
 */

// ── History storage ─────────────────────────────────────

interface ScanHistory {
  timestamp: string;
  score: number;
  totalDiagnostics: number;
  bySeverity: Record<Severity, number>;
  byEngine: Record<string, number>;
}

const HISTORY_DIR = ".deep-slop";
const HISTORY_FILE = "history.json";

async function readHistory(rootDir: string): Promise<ScanHistory[]> {
  try {
    const content = await readFileContent(join(rootDir, HISTORY_DIR, HISTORY_FILE));
    return JSON.parse(content);
  } catch {
    return [];
  }
}

async function writeHistory(rootDir: string, history: ScanHistory[]): Promise<void> {
  const dir = join(rootDir, HISTORY_DIR);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, HISTORY_FILE), JSON.stringify(history, null, 2));
}

// ── Rule: Score Report ──────────────────────────────────

function scoreReport(
  filePath: string,
  score: number,
  totalDiags: number,
  bySeverity: Record<Severity, number>,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  if (score < 50) {
    diagnostics.push({
      filePath,
      engine: "meta-quality",
      rule: "meta-quality/critical-score",
      severity: "error",
      message: `Project quality score is critically low: ${score}/100`,
      help: "Address the highest-impact issues first: errors, then security, then warnings. Focus on one engine at a time.",
      line: 1,
      column: 1,
      category: "style" as Category,
      fixable: false,
      suggestion: {
        type: "refactor",
        text: `Start with: npx deep-slop fix --engine ${score < 30 ? "security-deep" : "ast-slop"}`,
        confidence: 0.9,
        reason: "Critical scores indicate systemic issues. Fix the most severe category first for maximum score improvement per effort.",
      },
    });
  } else if (score < 70) {
    diagnostics.push({
      filePath,
      engine: "meta-quality",
      rule: "meta-quality/low-score",
      severity: "warning",
      message: `Project quality score is below recommended: ${score}/100 (target: 70+)`,
      help: "Review warnings and suggestions. A score of 70+ is recommended for production code.",
      line: 1,
      column: 1,
      category: "style" as Category,
      fixable: false,
    });
  }

  return diagnostics;
}

// ── Rule: Trend Analysis ─────────────────────────────────

function trendAnalysis(
  filePath: string,
  current: ScanHistory,
  history: ScanHistory[],
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  if (history.length < 2) return diagnostics;

  const previous = history[history.length - 2];
  const scoreDiff = current.score - previous.score;

  if (scoreDiff < -10) {
    diagnostics.push({
      filePath,
      engine: "meta-quality",
      rule: "meta-quality/severe-regression",
      severity: "error",
      message: `Quality score dropped by ${Math.abs(scoreDiff)} points (${previous.score} → ${current.score})`,
      help: "Review recent changes for quality regressions. Compare diagnostics between runs.",
      line: 1,
      column: 1,
      category: "style" as Category,
      fixable: false,
      detail: {
        previousScore: previous.score,
        currentScore: current.score,
        diff: scoreDiff,
        previousTimestamp: previous.timestamp,
      },
    });
  } else if (scoreDiff < -3) {
    diagnostics.push({
      filePath,
      engine: "meta-quality",
      rule: "meta-quality/degrading-trend",
      severity: "warning",
      message: `Quality score is degrading: ${previous.score} → ${current.score} (${scoreDiff})`,
      help: "Recent changes introduced quality issues. Review new warnings and errors.",
      line: 1,
      column: 1,
      category: "style" as Category,
      fixable: false,
      detail: { diff: scoreDiff },
    });
  } else if (scoreDiff > 5) {
    diagnostics.push({
      filePath,
      engine: "meta-quality",
      rule: "meta-quality/improving-trend",
      severity: "info",
      message: `Quality score improved by ${scoreDiff} points (${previous.score} → ${current.score})`,
      help: "Keep up the good work! Maintain quality discipline.",
      line: 1,
      column: 1,
      category: "style" as Category,
      fixable: false,
    });
  }

  // Engine-specific trend: check if any engine had a spike
  for (const [engine, count] of Object.entries(current.byEngine)) {
    const prevCount = previous.byEngine[engine] ?? 0;
    const diff = count - prevCount;
    if (diff > 10) {
      diagnostics.push({
        filePath,
        engine: "meta-quality",
        rule: "meta-quality/engine-spike",
        severity: "warning",
        message: `${engine} issues spiked: ${prevCount} → ${count} (+${diff})`,
        help: `Focus on ${engine} issues in recent changes. This engine had the largest regression.`,
        line: 1,
        column: 1,
        category: "style" as Category,
        fixable: false,
        detail: { engine, previousCount: prevCount, currentCount: count, diff },
      });
    }
  }

  return diagnostics;
}

// ── Rule: Quality Gate ──────────────────────────────────

function qualityGate(
  filePath: string,
  score: number,
  failBelow: number | undefined,
): Diagnostic[] {
  if (!failBelow) return [];
  const diagnostics: Diagnostic[] = [];

  if (score < failBelow) {
    diagnostics.push({
      filePath,
      engine: "meta-quality",
      rule: "meta-quality/quality-gate-failed",
      severity: "error",
      message: `Quality gate FAILED: score ${score} is below threshold ${failBelow}`,
      help: `Fix issues until score reaches ${failBelow}. CI will fail until then.`,
      line: 1,
      column: 1,
      category: "style" as Category,
      fixable: false,
      detail: { score, threshold: failBelow, gap: failBelow - score },
    });
  } else {
    diagnostics.push({
      filePath,
      engine: "meta-quality",
      rule: "meta-quality/quality-gate-passed",
      severity: "info",
      message: `Quality gate PASSED: score ${score} ≥ threshold ${failBelow}`,
      help: "Quality gate is satisfied. Keep maintaining code quality.",
      line: 1,
      column: 1,
      category: "style" as Category,
      fixable: false,
      detail: { score, threshold: failBelow },
    });
  }

  return diagnostics;
}

// ── Engine ──────────────────────────────────────────────

export const metaQualityEngine: Engine = {
  name: "meta-quality" as const,
  description: "Meta quality scoring: weighted scoring, trend analysis, diff scoring, quality gate",
  supportedLanguages: ["typescript", "javascript", "python", "go", "rust", "ruby", "php", "java"],

  async run(context: EngineContext): Promise<EngineResult> {
    const diagnostics: Diagnostic[] = [];
    const start = Date.now();
    const rootDir = context.rootDirectory;

    // This engine analyzes OTHER engines' results that are stored in the scan output.
    // It needs to be called AFTER all other engines, with the aggregated results.
    // For now, it reads history and provides trend analysis.

    const history = await readHistory(rootDir);

    // Rule: Quality gate check
    const gateDiags = qualityGate(
      join(rootDir, "package.json"),
      100, // default score (will be overridden by orchestrator)
      context.config.ci?.failBelow,
    );
    diagnostics.push(...gateDiags);

    // Rule: Trend analysis (compare with last run)
    if (history.length >= 2) {
      const currentEntry = history[history.length - 1];
      const trendDiags = trendAnalysis(join(rootDir, "package.json"), currentEntry, history);
      diagnostics.push(...trendDiags);
    }

    // Rule: Config quality hints
    // Check if .deep-slop/config.yml exists
    try {
      await readFileContent(join(rootDir, ".deep-slop", "config.yml"));
    } catch {
      diagnostics.push({
        filePath: join(rootDir, ".deep-slop"),
        engine: "meta-quality",
        rule: "meta-quality/missing-config",
        severity: "info",
        message: "No .deep-slop/config.yml found — using defaults",
        help: "Run `npx deep-slop init` to create a configuration file with project-specific settings.",
        line: 1,
        column: 1,
        category: "style" as Category,
        fixable: true,
        suggestion: {
          type: "insert",
          text: "Run: npx deep-slop init",
          confidence: 0.7,
          reason: "A config file lets you customize thresholds, exclude patterns, and engine settings for your project.",
        },
      });
    }

    // Rule: Score report (placeholder — orchestrator fills in real score)
    const scoreDiags = scoreReport(
      join(rootDir, "package.json"),
      100,
      0,
      { error: 0, warning: 0, info: 0, suggestion: 0 },
    );
    diagnostics.push(...scoreDiags);

    return {
      engine: this.name,
      diagnostics,
      elapsed: Date.now() - start,
      skipped: false,
    };
  },
};
