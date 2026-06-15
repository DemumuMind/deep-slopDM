import { writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
  buildEarlyExitResult,
  EARLY_EXIT_BATCH_SIZE,
  isEngineEarlyExitEnabled,
} from "../../config/engine-utils.js";

import type {
  Engine,
  EngineContext,
  EngineResult,
  Diagnostic,
  FixResult,
} from "../../types/index.js";

import { readFileContent } from "../../utils/file-utils.js";

import { collectFiles, readRawBytes } from "./helpers.js";

import {
  checkBomAndZwnbsp,
  checkLineEndings,
  checkInvalidEscapes,
  checkUnnecessaryRegexEscapes,
  checkNumberPrecision,
  checkUnicodeAnomalies,
  checkTrailingWhitespace,
  checkMissingFinalNewline,
  checkInconsistentIndentation,
} from "./rules.js";

// ── Engine Implementation ────────────────────────────────

export const syntaxDeepEngine: Engine = {
  name: "syntax-deep",
  description:
    "Detects syntax-level anomalies that cause subtle bugs: BOM, mixed line endings, invalid escapes, precision loss, unicode anomalies, and formatting inconsistencies.",
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

    const files = await collectFiles(context);
    const earlyExit = isEngineEarlyExitEnabled(
      context.config.engines["syntax-deep"],
      "syntax-deep",
    );
    // Use orchestrator-provided disabled rules for early-exit accuracy
    const disabledRules = context.disabledRules ?? new Set<string>()
    const wildcardOff: string[] = (context as any)._wildcardOff ?? []
    const isRuleDisabled = (rule: string) =>
      disabledRules.has(rule) || wildcardOff.some(p => rule.startsWith(p))

    for (let i = 0; i < files.length; i++) {
      const relPath = files[i];
      const absPath = join(context.rootDirectory, relPath);

      let content: string;
      let rawBuf: Buffer;
      try {
        rawBuf = await readRawBytes(absPath);
        content = rawBuf.toString("utf-8");
      } catch {
        // Skip unreadable files
        continue;
      }

      // Run all checks
      diagnostics.push(...checkBomAndZwnbsp(content, relPath, rawBuf));
      diagnostics.push(...checkLineEndings(content, relPath));
      diagnostics.push(...checkInvalidEscapes(content, relPath));
      diagnostics.push(...checkUnnecessaryRegexEscapes(content, relPath));
      diagnostics.push(...checkNumberPrecision(content, relPath));
      diagnostics.push(...checkUnicodeAnomalies(content, relPath));
      diagnostics.push(...checkTrailingWhitespace(content, relPath));
      diagnostics.push(...checkMissingFinalNewline(content, relPath));
      diagnostics.push(...checkInconsistentIndentation(content, relPath));

      if (
        earlyExit &&
        i >= EARLY_EXIT_BATCH_SIZE - 1 &&
        diagnostics.filter(d => !isRuleDisabled(d.rule)).length === 0
      ) {
        return buildEarlyExitResult("syntax-deep", performance.now() - start);
      }
    }

    return {
      engine: "syntax-deep",
      diagnostics,
      elapsed: performance.now() - start,
      skipped: false,
    };
  },

  async fix(diagnostics: Diagnostic[], context: EngineContext): Promise<FixResult> {
    const fixed: Diagnostic[] = [];
    const remaining: Diagnostic[] = [];

    // Group diagnostics by file
    const byFile = new Map<string, Diagnostic[]>();
    for (const d of diagnostics) {
      if (!byFile.has(d.filePath)) byFile.set(d.filePath, []);
      byFile.get(d.filePath)!.push(d);
    }

    const modifiedFiles: string[] = [];

    // Fixable rules that our auto-fix handles
    const fixableRules = new Set([
      "syntax-deep/bom-present",
      "syntax-deep/zwnbsp-mid-file",
      "syntax-deep/crlf-line-endings",
      "syntax-deep/mixed-line-endings",
      "syntax-deep/trailing-whitespace",
      "syntax-deep/missing-final-newline",
    ]);

    for (const [filePath, fileDiagnostics] of byFile) {
      const hasFixable = fileDiagnostics.some((d) => fixableRules.has(d.rule));
      if (!hasFixable) {
        remaining.push(...fileDiagnostics);
        continue;
      }

      const absPath = join(context.rootDirectory, filePath);
      let content: string;
      try {
        content = await readFileContent(absPath);
      } catch {
        remaining.push(...fileDiagnostics);
        continue;
      }

      let modified = content;

      // 1. Strip BOM
      if (fileDiagnostics.some((d) => d.rule === "syntax-deep/bom-present")) {
        if (modified.charCodeAt(0) === 0xfeff) {
          modified = modified.slice(1);
        }
      }

      // 2. Strip all ZWNBSP mid-file
      if (fileDiagnostics.some((d) => d.rule === "syntax-deep/zwnbsp-mid-file")) {
        modified = modified.replace(/\uFEFF/g, "");
      }

      // 3. Normalize CRLF → LF
      if (
        fileDiagnostics.some(
          (d) =>
            d.rule === "syntax-deep/crlf-line-endings" ||
            d.rule === "syntax-deep/mixed-line-endings",
        )
      ) {
        modified = modified.replace(/\r\n/g, "\n");
      }

      // 4. Strip trailing whitespace on each line
      if (fileDiagnostics.some((d) => d.rule === "syntax-deep/trailing-whitespace")) {
        modified = modified.replace(/[ \t]+$/gm, "");
      }

      // 5. Ensure final newline
      if (fileDiagnostics.some((d) => d.rule === "syntax-deep/missing-final-newline")) {
        if (modified.length > 0 && !modified.endsWith("\n")) {
          modified += "\n";
        }
      }

      // Write back if changed
      if (modified !== content) {
        try {
          await writeFile(absPath, modified, "utf-8");
          modifiedFiles.push(filePath);

          // Mark fixable diagnostics as fixed
          for (const d of fileDiagnostics) {
            if (fixableRules.has(d.rule)) {
              fixed.push(d);
            } else {
              remaining.push(d);
            }
          }
        } catch {
          remaining.push(...fileDiagnostics);
        }
      } else {
        // No actual change — still count fixable ones as fixed
        for (const d of fileDiagnostics) {
          if (fixableRules.has(d.rule)) {
            fixed.push(d);
          } else {
            remaining.push(d);
          }
        }
      }
    }

    return {
      fixed: fixed.length,
      remaining,
      modifiedFiles,
    };
  },
};
