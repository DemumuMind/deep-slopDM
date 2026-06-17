import type {
  Engine,
  EngineContext,
  EngineResult,
  Diagnostic,
  FixResult,
} from "../../types/index.js";
import { readFileContent, toLines } from "../../utils/file-utils.js";
import { existsSync } from "node:fs";
import { npmAudit, pnpmAudit, pipAudit, goVulnCheck, cargoAudit } from "../../security/audit.js";
import { detectSecrets } from "../../security/secrets.js";
import { detectHtmlSafety } from "../../security/html-safety.js";
import { isEngineEarlyExitEnabled, buildEarlyExitResult, EARLY_EXIT_BATCH_SIZE } from '../../config/engine-utils.js'
import {
  detectEvalUsage,
  detectInnerHTML,
  detectSQLInjection,
  detectShellInjection,
  detectPrototypePollution,
  detectSSRF,
} from "./rules.js";

// ── Engine metadata ─────────────────────────────────────

const SECURITY_RULES = [
  'security-deep/eval-usage',
  'security-deep/inner-html',
  'security-deep/sql-injection',
  'security-deep/shell-injection',
  'security-deep/prototype-pollution',
  'security-deep/ssrf-risk',
  'security-deep/hardcoded-secret',
  'security-deep/unsafe-html',
  'security-deep/xss-risk',
  'security-deep/dependency-vulnerability',
]

// Fast keyword pre-filter for each detector. If a file does not contain any of
// these tokens, the expensive line-by-line detector is skipped.
const DETECTOR_KEYWORDS: Record<string, RegExp> = {
  eval: /\b(?:eval\s*\(|new\s+Function\b|setTimeout\s*\(|setInterval\s*\()/i,
  innerHTML: /\.(?:innerHTML|outerHTML)\s*=|\.write\s*\(|\.writeln\s*\(/i,
  sql: /\b(?:query|execute|raw|run|all|exec|execSql)\s*\(/i,
  shell: /\b(?:exec|execSync)\s*\(/i,
  proto: /\bObject\s*\.\s*assign\s*\(|__proto__|\b(?:deepMerge|deepExtend|mergeDeep|defaultsDeep)\s*\(/i,
  ssrf: /\b(?:fetch|axios)\s*\(|(?:http|https)\s*\.\s*request/i,
  secrets: /(?:sk-|ghp_|gho_|github_pat_|AKIA|AIza|Bearer\s+|key-|password|pwd|passwd|pass|secret|token|apikey|api_key|access_key|private_key|mongodb:|postgres:|postgresql:|mysql:|redis:|amqp:|amqps:|-----BEGIN\s+(?:RSA\s+)?PRIVATE\s+KEY-----)/i,
  htmlSafety: /\.(?:innerHTML|outerHTML)\s*=|dangerouslySetInnerHTML|v-html|insertAdjacentHTML|\.write\s*\(|\.writeln\s*\(/i,
}

// Rules produced by each detector. Used to skip detectors when their rules are
// disabled or suppressed.
const DETECTOR_RULES: Record<string, string[]> = {
  eval: ['security-deep/eval-usage'],
  innerHTML: ['security-deep/inner-html'],
  sql: ['security-deep/sql-injection'],
  shell: ['security-deep/shell-injection'],
  proto: ['security-deep/prototype-pollution'],
  ssrf: ['security-deep/ssrf-risk'],
  secrets: ['security-deep/hardcoded-secret'],
  htmlSafety: ['security-deep/unsafe-html', 'security-deep/xss-risk'],
}

const detectorFns: Record<string, (filePath: string, lines: { num: number; text: string }[]) => Diagnostic[]> = {
  eval: detectEvalUsage,
  innerHTML: detectInnerHTML,
  sql: detectSQLInjection,
  shell: detectShellInjection,
  proto: detectPrototypePollution,
  ssrf: detectSSRF,
  secrets: detectSecrets,
  htmlSafety: detectHtmlSafety,
}

// Safety guard: skip files that are likely minified/bundled.
const MAX_FILE_BYTES = 5_000_000
const MAX_LINE_LENGTH = 20_000

/**
 * Security vulnerability detection engine.
 *
 * Detects: eval usage, innerHTML/XSS, SQL injection, shell injection,
 * prototype pollution, SSRF risk, hardcoded secrets, and dependency audit.
 */
export const securityDeepEngine: Engine = {
  name: "security-deep" as const,
  description:
    "Security vulnerability detection: eval, innerHTML, SQL injection, shell injection, prototype pollution, SSRF, hardcoded secrets, XSS risk, dependency audit",
  supportedLanguages: [
    "typescript",
    "javascript",
    "python",
    "go",
    "rust",
    "ruby",
    "php",
    "java",
  ],

  async run(context: EngineContext): Promise<EngineResult> {
    const start = performance.now();
    const diagnostics: Diagnostic[] = [];
    const files = context.files ?? [];
    const rootDir = context.rootDirectory;
    const config = context.config;
    const earlyExit = isEngineEarlyExitEnabled(config.engines['security-deep'], 'security-deep')
    const disabledRules = context.disabledRules ?? new Set<string>()
    const wildcardOff: string[] = (context as any)._wildcardOff ?? []
    const rulesConfig: Record<string, string> = (context as any).rulesConfig ?? {}

    const isRuleSuppressed = (rule: string) =>
      disabledRules.has(rule) || wildcardOff.some(p => rule.startsWith(p)) || rulesConfig[rule] === 'off'

    // Check if ALL security-deep rules are suppressed in config
    const allRulesSuppressed = SECURITY_RULES.every(rule => isRuleSuppressed(rule))
    if (allRulesSuppressed) {
      return {
        engine: 'security-deep',
        diagnostics: [],
        elapsed: performance.now() - start,
        skipped: true,
        skipReason: 'All security-deep rules suppressed in config',
      }
    }

    // Only run detectors that have at least one active rule.
    const activeDetectors = Object.entries(DETECTOR_RULES)
      .filter(([, rules]) => rules.some(rule => !isRuleSuppressed(rule)))
      .map(([name]) => name)

    // Dependency audit only when explicitly enabled and the rule is not suppressed.
    const dependencyAuditEnabled =
      config.security?.audit && !isRuleSuppressed('security-deep/dependency-vulnerability')

    let activeDiagCount = 0

    for (let i = 0; i < files.length; i++) {
      const filePath = files[i]
      try {
        const content = await readFileContent(filePath);
        // Skip files that are too large or contain very long lines.
        if (content.length > MAX_FILE_BYTES) continue
        const lines = toLines(content);
        if (lines.some(line => line.text.length > MAX_LINE_LENGTH)) continue

        for (const name of activeDetectors) {
          // Cheap keyword pre-filter before running the line-by-line detector.
          if (!DETECTOR_KEYWORDS[name].test(content)) continue
          const found = detectorFns[name](filePath, lines)
          if (found.length) {
            diagnostics.push(...found)
            activeDiagCount += found.filter(d => !isRuleSuppressed(d.rule)).length
          }
        }
      } catch {
        // skip unreadable files
      }

      // Early-exit: after scanning first batch with zero non-disabled diagnostics, skip rest
      if (earlyExit && i >= EARLY_EXIT_BATCH_SIZE - 1) {
        if (activeDiagCount === 0) {
          return buildEarlyExitResult('security-deep', performance.now() - start)
        }
      }
    }

    // Dependency vulnerability audit (only if config security.audit is true)
    if (dependencyAuditEnabled) {
      const auditTimeout = config.security?.auditTimeout ?? 25000;

      // npm/pnpm audit for JS/TS projects
      if (context.languages.includes('typescript') || context.languages.includes('javascript')) {
        // Use pnpm audit when the project is managed by pnpm.
        diagnostics.push(...(
          existsSync(`${rootDir}/pnpm-lock.yaml`) ? pnpmAudit(rootDir, auditTimeout) : npmAudit(rootDir, auditTimeout)
        ));
      }

      // pip-audit for Python projects
      if (context.languages.includes('python')) {
        diagnostics.push(...pipAudit(rootDir, auditTimeout));
      }

      // govulncheck for Go projects
      if (context.languages.includes('go')) {
        diagnostics.push(...goVulnCheck(rootDir, auditTimeout));
      }

      // cargo audit for Rust projects
      if (context.languages.includes('rust')) {
        diagnostics.push(...cargoAudit(rootDir, auditTimeout));
      }
    }

    const elapsed = performance.now() - start;

    return {
      engine: 'security-deep',
      diagnostics,
      elapsed,
      skipped: false,
    };
  },

  async fix(
    diagnostics: Diagnostic[],
    _context: EngineContext
  ): Promise<FixResult> {
    // Only hardcoded-secret diagnostics are auto-fixable
    const fixable = diagnostics.filter(
      (d) => d.rule === "security-deep/hardcoded-secret" && d.fixable
    );
    const remaining = diagnostics.filter(
      (d) => d.rule !== "security-deep/hardcoded-secret" || !d.fixable
    );

    return {
      fixed: fixable.length,
      remaining,
      modifiedFiles: [...new Set(fixable.map((d) => d.filePath))],
    };
  },
};
