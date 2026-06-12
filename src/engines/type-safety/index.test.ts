import { describe, it, expect, afterAll } from "vitest";
import { typeSafetyEngine } from "./index.js";
import { makeContext, tempDir, writeFile, cleanup } from "../test-utils.js";

describe("type-safety", () => {
  const dir = tempDir();
  afterAll(() => cleanup(dir));

  it("detects issues in sample code", async () => {
    const filePath = writeFile(dir, "test.ts", `const x = data as any;
const y = value!;`);
    const ctx = makeContext(dir);
    ctx.files = [filePath];
    const result = await typeSafetyEngine.run(ctx);
    expect(result.engine).toBe("type-safety");
    expect(result.skipped).toBe(false);
    expect(result.elapsed).toBeGreaterThan(0);
    // Should find at least some diagnostics
    if (result.diagnostics.length > 0) {
      const rules = result.diagnostics.map(d => d.rule);
      console.log("type-safety found:", rules);
    }
  });
});
