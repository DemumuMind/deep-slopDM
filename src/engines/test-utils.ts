import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
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
  const parentDir = join(dir, ...name.split('/').slice(0, -1));
  if (parentDir !== dir) {
    mkdirSync(parentDir, { recursive: true });
  }
  writeFileSync(path, content);
  return path;
}

export function cleanup(dir: string) {
  try { rmSync(dir, { recursive: true }); } catch {}
}

