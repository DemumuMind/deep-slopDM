import { join, relative } from "node:path";

import type { Diagnostic, EngineContext, Severity } from "../../types/index.js";

// ── Helpers ──────────────────────────────────────────────

export function makeDiagnostic(
  filePath: string,
  rule: string,
  severity: Severity,
  message: string,
  help: string,
  line: number,
  column: number,
  fixable: boolean,
  suggestion?: Diagnostic["suggestion"],
  detail?: Record<string, unknown>,
): Diagnostic {
  return {
    filePath,
    engine: "syntax-deep",
    rule: `syntax-deep/${rule}`,
    severity,
    message,
    help,
    line,
    column,
    category: "syntax",
    fixable,
    suggestion,
    detail,
  };
}

/** Collect all files to scan from context */
export async function collectFiles(context: EngineContext): Promise<string[]> {
  if (context.files && context.files.length > 0) {
    return context.files;
  }

  const root = context.rootDirectory;
  const exclude = context.config.exclude ?? [];
  const extensions = new Set([
    ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
    ".py", ".go", ".rs", ".rb", ".php", ".java",
    ".json", ".yaml", ".yml", ".toml", ".md", ".css", ".scss", ".less", ".html", ".vue", ".svelte",
  ]);

  const files: string[] = [];

  // Recursive walk using async glob
  async function walk(dir: string): Promise<void> {
    let entries: import("node:fs").Dirent[];
    try {
      const { readdir } = await import("node:fs/promises");
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const full = join(dir, entry.name);
      const rel = relative(root, full);

      // Skip excluded patterns
      if (exclude.some((pat) => rel.startsWith(pat) || entry.name === pat)) {
        continue;
      }

      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.isFile()) {
        const ext = entry.name.substring(entry.name.lastIndexOf("."));
        if (extensions.has(ext)) {
          files.push(rel);
        }
      }
    }
  }

  await walk(root);
  return files;
}

/** Read raw buffer to detect BOM at byte level */
export async function readRawBytes(filePath: string): Promise<Buffer> {
  const { readFile: readBuf } = await import("node:fs/promises");
  return readBuf(filePath);
}

