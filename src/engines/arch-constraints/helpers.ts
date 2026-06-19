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
