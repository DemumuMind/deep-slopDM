import { readFile } from "node:fs/promises";
import { join } from "node:path";

/** Read file contents with encoding detection */
export async function readFileContent(filePath: string): Promise<string> {
  const buffer = await readFile(filePath);
  // Strip BOM if present
  let content = buffer.toString("utf-8");
  if (content.charCodeAt(0) === 0xfeff) {
    content = content.slice(1);
  }
  return content;
}

/** Detect BOM, CRLF, and other encoding anomalies */
export function detectEncodingAnomalies(content: string): {
  hasBom: boolean;
  hasCrlf: boolean;
  hasZwnbsp: boolean;
  lineEnding: "lf" | "crlf" | "mixed";
} {
  const hasBom = content.charCodeAt(0) === 0xfeff;
  const hasCrlf = content.includes("\r\n");
  const hasZwnbsp = content.includes("\uFEFF");

  // Check for mixed line endings
  const lfOnly = (content.match(/(?<!\r)\n/g) ?? []).length;
  const crlfCount = (content.match(/\r\n/g) ?? []).length;
  const lineEnding = crlfCount > 0 && lfOnly > crlfCount ? "mixed" : crlfCount > 0 ? "crlf" : "lf";

  return { hasBom, hasCrlf, hasZwnbsp, lineEnding };
}

/** Split content into lines with line numbers */
export function toLines(content: string): { num: number; text: string }[] {
  return content.split("\n").map((text, i) => ({ num: i + 1, text }));
}

/** Find all import statements in a file (regex-based, for quick scan) */
export function extractImports(content: string, language: string): ImportInfo[] {
  const imports: ImportInfo[] = [];
  const lines = toLines(content);

  for (const { num, text } of lines) {
    const trimmed = text.trim();

    // JS/TS imports
    if (language === "typescript" || language === "javascript") {
      const jsMatch = trimmed.match(
        /^import\s+(?:type\s+)?(?:\{[^}]*\}|\*\s+as\s+\w+|\w+)\s+from\s+['"]([^'"]+)['"]/
      );
      if (jsMatch) {
        imports.push({
          line: num,
          source: jsMatch[1],
          raw: trimmed,
          isTypeOnly: trimmed.includes("import type"),
          isDefault: !trimmed.includes("{"),
        });
      }
      // Dynamic imports
      const dynMatch = trimmed.match(/import\s*\(\s*['"]([^'"]+)['"]\s*\)/);
      if (dynMatch) {
        imports.push({
          line: num,
          source: dynMatch[1],
          raw: trimmed,
          isTypeOnly: false,
          isDynamic: true,
        });
      }
      // Require calls
      const reqMatch = trimmed.match(/(?:const|let|var)\s+[^=]*=\s*require\s*\(\s*['"]([^'"]+)['"]\s*\)/);
      if (reqMatch) {
        imports.push({
          line: num,
          source: reqMatch[1],
          raw: trimmed,
          isTypeOnly: false,
          isRequire: true,
        });
      }
    }

    // Python imports
    if (language === "python") {
      const pyMatch = trimmed.match(/^from\s+([^\s]+)\s+import/);
      if (pyMatch) {
        imports.push({ line: num, source: pyMatch[1], raw: trimmed, isTypeOnly: false });
      }
      const pyImport = trimmed.match(/^import\s+([^\s]+)/);
      if (pyImport) {
        imports.push({ line: num, source: pyImport[1], raw: trimmed, isTypeOnly: false });
      }
    }

    // Go imports
    if (language === "go") {
      const goMatch = trimmed.match(/"([^"]+)"/);
      if (trimmed.startsWith("import") && goMatch) {
        imports.push({ line: num, source: goMatch[1], raw: trimmed, isTypeOnly: false });
      }
    }
  }

  return imports;
}

export interface ImportInfo {
  line: number;
  source: string;
  raw: string;
  isTypeOnly?: boolean;
  isDefault?: boolean;
  isDynamic?: boolean;
  isRequire?: boolean;
}

