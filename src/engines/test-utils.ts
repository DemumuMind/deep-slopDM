import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import type { EngineContext, DeepSlopConfig } from "../types/index.js";
import { DEFAULT_CONFIG } from "../types/index.js";

export function makeContext(dir: string): EngineContext {
  return {
    rootDirectory: dir,
    languages: ["typescript", "javascript"],
    frameworks: [],
    files: [],
    installedTools: {},
    config: { ...DEFAULT_CONFIG },
  };
}

export function tempDir(): string {
  return mkdtempSync(join(process.cwd(), "test-"));
}

export function writeFile(dir: string, name: string, content: string): string {
  const path = join(dir, name);
  writeFileSync(path, content);
  return path;
}

export function cleanup(dir: string) {
  try { rmSync(dir, { recursive: true }); } catch {}
}
