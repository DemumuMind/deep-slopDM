import { readdir, readFile, stat } from "node:fs/promises";
import { join, extname, relative } from "node:path";
import type { Language, Framework } from "../types/index.js";

/** File extension → language mapping */
const EXT_MAP: Record<string, Language> = {
  ".ts": "typescript",
  ".tsx": "typescript",
  ".js": "javascript",
  ".jsx": "javascript",
  ".mjs": "javascript",
  ".cjs": "javascript",
  ".py": "python",
  ".go": "go",
  ".rs": "rust",
  ".rb": "ruby",
  ".php": "php",
  ".java": "java",
};

/** Detect languages from file extensions in the project */
export async function detectLanguages(rootDir: string): Promise<Language[]> {
  const langCounts = new Map<Language, number>();
  await walkDir(rootDir, async (filePath) => {
    const ext = extname(filePath);
    const lang = EXT_MAP[ext];
    if (lang) {
      langCounts.set(lang, (langCounts.get(lang) ?? 0) + 1);
    }
  }, undefined);
  return [...langCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([lang]) => lang);
}

/** Detect frameworks from config files and dependencies */
export async function detectFrameworks(rootDir: string): Promise<Framework[]> {
  const frameworks: Framework[] = [];

  // Check package.json for JS frameworks
  try {
    const pkgPath = join(rootDir, "package.json");
    const pkg = JSON.parse(await readFile(pkgPath, "utf-8"));
    const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };

    if (allDeps["next"]) frameworks.push("next.js");
    if (allDeps["react"]) frameworks.push("react");
    if (allDeps["vue"] || allDeps["@vue/compiler-sfc"]) frameworks.push("vue");
    if (allDeps["svelte"] || allDeps["@sveltejs/kit"]) frameworks.push("svelte");
    if (allDeps["@angular/core"]) frameworks.push("angular");
    if (allDeps["express"]) frameworks.push("express");
    if (allDeps["fastify"]) frameworks.push("fastify");
    if (allDeps["@nestjs/core"]) frameworks.push("nestjs");
  } catch { /* no package.json */ }

  // Check Python frameworks
  try {
    const reqPath = join(rootDir, "requirements.txt");
    const req = await readFile(reqPath, "utf-8");
    if (req.includes("django")) frameworks.push("django");
    if (req.includes("flask")) frameworks.push("flask");
    if (req.includes("fastapi")) frameworks.push("fastapi");
  } catch { /* no requirements.txt */ }

  // Check Ruby frameworks
  try {
    const gemPath = join(rootDir, "Gemfile");
    const gem = await readFile(gemPath, "utf-8");
    if (gem.includes("rails")) frameworks.push("rails");
  } catch { /* no Gemfile */ }

  // Check PHP frameworks
  try {
    const compPath = join(rootDir, "composer.json");
    const comp = JSON.parse(await readFile(compPath, "utf-8"));
    if (comp.require?.["laravel/framework"]) frameworks.push("laravel");
  } catch { /* no composer.json */ }

  if (frameworks.length === 0) frameworks.push("none");
  return frameworks;
}

/** Collect all source files to scan */
export async function collectFiles(
  rootDir: string,
  languages: Language[],
  excludePatterns: string[] = [],
  includeFiles?: string[],
): Promise<string[]> {
  if (includeFiles) {
    return includeFiles.map((f) => (f.startsWith("/") ? f : join(rootDir, f)));
  }

  const targetExts = new Set(
    Object.entries(EXT_MAP)
      .filter(([, lang]) => languages.includes(lang))
      .map(([ext]) => ext),
  );

  const excludeSet = new Set(excludePatterns);
  const files: string[] = [];

  await walkDir(rootDir, async (filePath) => {
    const relPath = relative(rootDir, filePath);
    if (isExcluded(relPath, excludeSet)) return;
    const ext = extname(filePath);
    if (targetExts.has(ext)) {
      files.push(filePath);
    }
  }, excludeSet);

  return files;
}

/** Check if path matches any exclude pattern */
function isExcluded(relPath: string, excludes: Set<string>): boolean {
  const segments = relPath.split("/");
  for (const pattern of excludes) {
    if (relPath.includes(pattern) || segments.some((s) => s === pattern)) {
      return true;
    }
  }
  return false;
}

/** Directories to always skip during walk (never recurse into) */
const SKIP_DIR_NAMES = new Set([
  "node_modules", ".git", "dist", "build", "coverage", ".next", ".nuxt",
  ".pnpm-store", ".turbo", ".vercel", ".cache", "tmp-", "__pycache__",
  ".venv", "venv", ".tox", "target", "vendor", "bower_components",
]);

/** Walk directory recursively, skipping excluded directories early */
async function walkDir(
  dir: string,
  visitor: (filePath: string) => Promise<void>,
  excludeSet?: Set<string>,
): Promise<void> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        // Skip excluded directories by name — don't recurse into them at all
        if (SKIP_DIR_NAMES.has(entry.name)) continue;
        if (excludeSet && excludeSet.has(entry.name)) continue;
        const fullPath = join(dir, entry.name);
        await walkDir(fullPath, visitor, excludeSet);
      } else if (entry.isFile()) {
        const fullPath = join(dir, entry.name);
        await visitor(fullPath);
      }
    }
  } catch { /* permission denied, skip */ }
}
