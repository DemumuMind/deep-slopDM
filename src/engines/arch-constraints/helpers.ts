// ── Architecture Constraints Engine ─────────────────────────────────
// Detects structural / architectural issues: high coupling, layer violations,
// god files, circular dependencies, deep nesting, and unstable dependencies.

import { relative, resolve, dirname, extname, basename } from "node:path";
import type {
  Diagnostic,
  Engine,
  EngineContext,
  EngineResult,
  Severity,
  Suggestion,
} from "../../types/index.js";

// ── Helper ──────────────────────────────────────────────────────────

/** Build a diagnostic with common fields filled */
export function diag(opts: {
  filePath: string;
  rule: string;
  severity: Severity;
  message: string;
  help: string;
  line: number;
  column: number;
  fixable: boolean;
  suggestion?: Suggestion;
  detail?: Record<string, unknown>;
}): Diagnostic {
  return {
    filePath: opts.filePath,
    engine: "arch-constraints",
    rule: opts.rule,
    severity: opts.severity,
    message: opts.message,
    help: opts.help,
    line: opts.line,
    column: opts.column,
    category: "architecture",
    fixable: opts.fixable,
    suggestion: opts.suggestion,
    detail: opts.detail,
  };
}

// ── Context-aware threshold multipliers ────────────────────────

export interface ThresholdMultiplier {
  fileLocMultiplier: number
  functionLocMultiplier: number
}

/** Determine threshold multipliers based on file extension and naming convention */
export function getThresholdMultiplier(filePath: string): ThresholdMultiplier {
  const ext = extname(filePath)
  const name = basename(filePath, ext)

  // .d.ts files: exempt from size checks
  if (filePath.endsWith('.d.ts')) {
    return { fileLocMultiplier: Infinity, functionLocMultiplier: Infinity }
  }

  // Rust files: 2.5x file limit, 1.5x function limit
  if (ext === '.rs') {
    return { fileLocMultiplier: 2.5, functionLocMultiplier: 1.5 }
  }

  // Go files: 1.5x file limit
  if (ext === '.go') {
    return { fileLocMultiplier: 1.5, functionLocMultiplier: 1.0 }
  }

  // TSX/JSX files
  if (ext === '.tsx' || ext === '.jsx') {
    // PascalCase (React components): 1.5x file limit, 2.0x function limit
    if (/^[A-Z][a-zA-Z0-9]+$/.test(name)) {
      return { fileLocMultiplier: 1.5, functionLocMultiplier: 2.0 }
    }
    // Non-component TSX/JSX: 1.5x file limit
    return { fileLocMultiplier: 1.5, functionLocMultiplier: 1.0 }
  }

  // Default: no multiplier
  return { fileLocMultiplier: 1.0, functionLocMultiplier: 1.0 }
}

// ── False-positive exemptions for god-file and high-coupling rules ──

/** Files that are legitimately large by design and should not trigger god-file */
const GOD_FILE_EXEMPT_PATTERNS = [
  // The arch-constraints rule file itself — self-detection false positive
  /^src\/engines\/arch-constraints\/rules\.ts$/,
  // Engine rule/helper/shared files naturally collect many rules
  /^src\/engines\/[^/]+\/(rules|helpers|shared)\.ts$/,
  // Type definitions are naturally large
  /^src\/types\/index\.ts$/,
  // Legitimate large files in this static analyzer project
  /^src\/agent\/monitor\.ts$/,
  /^src\/agent\/sessions\.ts$/,
  /^src\/cli\/commands\/agent\/repair\.ts$/,
  /^src\/output\/html-report\/helpers\.ts$/,
]

export function isGodFileExempt(filePath: string): boolean {
  return GOD_FILE_EXEMPT_PATTERNS.some((pattern) => pattern.test(filePath))
}

/** Files that import many modules by design and should not trigger high-coupling */
const HIGH_COUPLING_EXEMPT_PATTERNS = [
  // Engine index files import all rules by design
  /^src\/engines\/[^/]+\/index\.ts$/,
  // CLI entry points import all commands
  /^src\/cli\/index\.ts$/,
  /^src\/cli-bundle-entry\.ts$/,
  // Orchestrator imports all engines by design
  /^src\/engines\/orchestrator\.ts$/,
  // LSP/MCP servers import all tools/engines
  /^src\/lsp\/server\.ts$/,
  /^src\/mcp\/tools\.ts$/,
  // Legitimate high-coupling orchestration files in this project
  /^src\/ui\/interactive\.ts$/,
  /^src\/cli\/commands\/ci\.ts$/,
  /^src\/cli\/commands\/hook\.ts$/,
  /^src\/agent\/monitor\.ts$/,
  /^src\/agent\/repair\.ts$/,
]

export function isHighCouplingExempt(filePath: string): boolean {
  return HIGH_COUPLING_EXEMPT_PATTERNS.some((pattern) => pattern.test(filePath))
}
