// deep-slop-ignore-start ast-slop/copy-paste-signature
// deep-slop-ignore-start ast-slop/narrative-comment
// deep-slop-ignore-start ast-slop/trivial-comment
// deep-slop-ignore-start ast-slop/decorative-comment
// deep-slop-ignore-start ast-slop/console-leftover
// deep-slop-ignore-start ast-slop/swallowed-exception
// deep-slop-ignore-start ast-slop/as-any
// deep-slop-ignore-start dead-flow/unused-variable
// deep-slop-ignore-start import-intelligence/unused-symbol
// deep-slop-ignore-start arch-constraints/deep-nesting
// deep-slop-ignore-start perf-hints/n-plus-one

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

// deep-slop-ignore-end perf-hints/n-plus-one
// deep-slop-ignore-end arch-constraints/deep-nesting
// deep-slop-ignore-end import-intelligence/unused-symbol
// deep-slop-ignore-end dead-flow/unused-variable
// deep-slop-ignore-end ast-slop/as-any
// deep-slop-ignore-end ast-slop/swallowed-exception
// deep-slop-ignore-end ast-slop/console-leftover
// deep-slop-ignore-end ast-slop/decorative-comment
// deep-slop-ignore-end ast-slop/trivial-comment
// deep-slop-ignore-end ast-slop/narrative-comment
// deep-slop-ignore-end ast-slop/copy-paste-signature
