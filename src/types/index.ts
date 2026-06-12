// ── Configuration (imported from Zod schema) ───────────
import type { DeepSlopConfig } from '../config/schema.js'

// ── Core Types ──────────────────────────────────────────

/** All engine identifiers (15 built-in) */
export type EngineName =
  | "ast-slop"
  | "import-intelligence"
  | "dead-flow"
  | "type-safety"
  | "syntax-deep"
  | "security-deep"
  | "arch-constraints"
  | "dup-detect"
  | "perf-hints"
  | "i18n-lint"
  | "config-lint"
  | "meta-quality"
  | "arch-rules"
  | "lint-external"
  | "knip";

/** Diagnostic severity levels */
export type Severity = "error" | "warning" | "info" | "suggestion";

/** Language targets */
export type Language = "typescript" | "javascript" | "python" | "go" | "rust" | "ruby" | "php" | "java";

/** Framework hints detected from project */
export type Framework =
  | "react" | "next.js" | "vue" | "svelte" | "angular"
  | "express" | "fastify" | "nestjs"
  | "django" | "flask" | "fastapi"
  | "rails" | "laravel"
  | "none";

/** Category grouping for diagnostics */
export type Category =
  | "ai-slop"        // AI-authored code patterns
  | "imports"        // Import path issues & alternatives
  | "dead-code"      // Unreachable / unused code
  | "types"          // Type safety issues
  | "syntax"         // Syntax anomalies
  | "security"       // Security vulnerabilities
  | "architecture"   // Structural / coupling issues
  | "duplication"    // Duplicate code
  | "performance"    // Performance hints
  | "i18n"           // Internationalization
  | "config"         // Configuration issues
  | "style";         // Formatting / style

// ── Diagnostic ─────────────────────────────────────────

export interface Diagnostic {
  /** File path relative to root */
  filePath: string;
  /** Engine that produced this diagnostic */
  engine: EngineName;
  /** Rule identifier (e.g. "ai-slop/narrative-comment") */
  rule: string;
  /** Severity level */
  severity: Severity;
  /** Human-readable message */
  message: string;
  /** Help text / fix suggestion */
  help: string;
  /** Line number (1-based) */
  line: number;
  /** Column number (1-based) */
  column: number;
  /** Category for grouping */
  category: Category;
  /** Whether this can be auto-fixed */
  fixable: boolean;
  /** Suggested fix (code diff or replacement) */
  suggestion?: Suggestion;
  /** Additional structured detail */
  detail?: Record<string, unknown>;
}

export interface Suggestion {
  /** Type of suggestion */
  type: "replace" | "insert" | "delete" | "refactor";
  /** The replacement text (for replace/insert) */
  text: string;
  /** Range to replace */
  range?: {
    startLine: number;
    startCol: number;
    endLine: number;
    endCol: number;
  };
  /** Confidence level 0-1 */
  confidence: number;
  /** Why this suggestion is better */
  reason: string;
}

// ── Engine Interface ────────────────────────────────────

export interface EngineResult {
  /** Engine name */
  engine: EngineName;
  /** Diagnostics found */
  diagnostics: Diagnostic[];
  /** Time taken in ms */
  elapsed: number;
  /** Whether engine was skipped */
  skipped: boolean;
  /** Why it was skipped */
  skipReason?: string;
}

export interface EngineContext {
  /** Root directory of the project */
  rootDirectory: string;
  /** Detected languages */
  languages: Language[];
  /** Detected frameworks */
  frameworks: Framework[];
  /** Specific files to scan (if --include or --changes) */
  files?: string[];
  /** Which tools are installed (keyed by name) */
  installedTools: Record<string, string | boolean>;
  /** Engine configuration */
  config: DeepSlopConfig;
  /** Diff scope description, e.g. "3 changed vs origin/main" */
  diffScope?: string;
}

export interface Engine {
  /** Engine identifier */
  name: EngineName;
  /** Human-readable description */
  description: string;
  /** Languages this engine supports */
  supportedLanguages: Language[];
  /** Run the engine and produce diagnostics */
  run(context: EngineContext): Promise<EngineResult>;
  /** Auto-fix diagnostics (optional) */
  fix?(diagnostics: Diagnostic[], context: EngineContext): Promise<FixResult>;
}

export interface FixResult {
  /** Number of diagnostics fixed */
  fixed: number;
  /** Diagnostics that couldn't be fixed */
  remaining: Diagnostic[];
  /** Files that were modified */
  modifiedFiles: string[];
}

// ── Configuration ───────────────────────────────────────

// Re-export DeepSlopConfig from the Zod-validated config schema
export type { DeepSlopConfig } from '../config/schema.js'

// Re-export DEFAULT_CONFIG from config defaults
export { DEFAULT_CONFIG } from '../config/defaults.js'

// ── Scoring ─────────────────────────────────────────────

export interface ScanResult {
  /** Per-engine results */
  engines: EngineResult[];
  /** Aggregate score 0-100 */
  score: number;
  /** Per-category breakdown */
  categoryScores: Record<Category, number>;
  /** Total diagnostics */
  totalDiagnostics: number;
  /** By severity */
  bySeverity: Record<Severity, number>;
  /** By engine */
  byEngine: Record<EngineName, number>;
  /** Project metadata */
  meta: {
    rootDirectory: string;
    languages: Language[];
    frameworks: Framework[];
    filesScanned: number;
    elapsed: number;
    /** Diff scope description, e.g. "3 changed vs origin/main" */
    diffScope?: string;
  };
}
