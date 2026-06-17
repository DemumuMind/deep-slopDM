import type {
  Engine,
  EngineContext,
  EngineResult,
  Diagnostic,
  FixResult,
} from "../../types/index.js";
import { readFileContent, toLines } from "../../utils/file-utils.js";
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
  detectHardcodedSecret,
} from "./rules.js";

// ── Engine ───────────────────────────────────────────────

/**
 * Security vulnerability detection engine.
 *
 * Detects: eval usage, innerHTML/XSS, SQL injection, shell injection,
 * prototype pollution, SSRF risk, and hardcoded secrets.
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
      disabledRules.has(rule) || wildcardOff.some(p => rule.startsWith(p))

    // Check if ALL security-deep rules are suppressed in config
    const engineRules = [
      'security-deep/eval-usage', 'security-deep/inner-html',
      'security-deep/sql-injection', 'security-deep/shell-injection',
      'security-deep/prototype-pollution', 'security-deep/ssrf-risk',
      'security-deep/hardcoded-secret',
    ]
    const allRulesSuppressed = engineRules.every(rule =>
      isRuleSuppressed(rule) || rulesConfig[rule] === 'off'
    )
    if (allRulesSuppressed) {
      return {
        engine: 'security-deep',
        diagnostics: [],
        elapsed: performance.now() - start,
        skipped: true,
        skipReason: 'All security-deep rules suppressed in config',
      }
    }

    for (let i = 0; i < files.length; i++) {
      const filePath = files[i]
      try {
        const content = await readFileContent(filePath);
        const lines = toLines(content);

        // Rule 1: eval / new Function / timer-with-string
        diagnostics.push(...detectEvalUsage(filePath, lines));

        // Rule 2: innerHTML / document.write (legacy inline rule)
        diagnostics.push(...detectInnerHTML(filePath, lines));

        // Rule 3: SQL injection via concatenation
        diagnostics.push(...detectSQLInjection(filePath, lines));

        // Rule 4: Shell injection via exec with concatenation
        diagnostics.push(...detectShellInjection(filePath, lines));

        // Rule 5: Prototype pollution
        diagnostics.push(...detectPrototypePollution(filePath, lines));

        // Rule 6: SSRF risk
        diagnostics.push(...detectSSRF(filePath, lines));

        // Rule 7: Hardcoded secrets (extended via secrets module)
        diagnostics.push(...detectHardcodedSecret(filePath, lines));

        // New: Extended hardcoded secret detection (from secrets.ts)
        diagnostics.push(...detectSecrets(filePath, lines));

        // New: XSS / HTML injection detection (from html-safety.ts)
        diagnostics.push(...detectHtmlSafety(filePath, lines));
      } catch {
        // skip unreadable files
      }

      // Early-exit: after scanning first batch with zero non-disabled diagnostics, skip rest
      if (earlyExit && i >= EARLY_EXIT_BATCH_SIZE - 1) {
        const activeDiags = diagnostics.filter(d => !isRuleSuppressed(d.rule)).length
        if (activeDiags === 0) {
          return buildEarlyExitResult('security-deep', performance.now() - start)
        }
      }
    }

    // New: Dependency vulnerability audit (only if config security.audit is true)
    if (config.security?.audit) {
      const auditTimeout = config.security?.auditTimeout ?? 25000;

      // npm/pnpm audit for JS/TS projects
      if (context.languages.includes('typescript') || context.languages.includes('javascript')) {
        diagnostics.push(...npmAudit(rootDir, auditTimeout));
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
      engine: this.name,
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
