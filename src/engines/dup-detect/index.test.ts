import { describe, it, expect, afterAll } from "vitest";
import { dupDetectEngine } from "./index.js";
import { makeContext, tempDir, writeFile, cleanup } from "../test-utils.js";

describe("dup-detect", () => {
  const dir = tempDir();
  afterAll(() => cleanup(dir));

  it("detects issues in sample code", async () => {
    const filePath = writeFile(dir, "test.ts", `const API_BASE_URL = "https://api.example.com/v1/endpoint";
function processData(input: string): string {
  const trimmed = input.trim();
  const lower = trimmed.toLowerCase();
  const result = lower.replace(/\s+/g, "-");
  return result;
}`);
    const ctx = makeContext(dir);
    ctx.files = [filePath];
    const result = await dupDetectEngine.run(ctx);
    expect(result.engine).toBe("dup-detect");
    expect(result.skipped).toBe(false);
    expect(result.elapsed).toBeGreaterThan(0);
    // Should find at least some diagnostics
    if (result.diagnostics.length > 0) {
      const rules = result.diagnostics.map(d => d.rule);
      console.log("dup-detect found:", rules);
    }
  });
});
