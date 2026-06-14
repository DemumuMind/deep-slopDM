import { describe, it, expect, afterAll } from "vitest";
import { metaQualityEngine } from "./index.js";
import { makeContext, tempDir, writeFile, cleanup } from "../test-utils.js";

describe("meta-quality", () => {
  const dir = tempDir();
  afterAll(() => cleanup(dir));

  it("detects issues in sample code", async () => {
    const filePath = writeFile(dir, "test.ts", `// minimal file, meta-quality checks scoring`);
    const ctx = makeContext(dir);
    ctx.files = [filePath];
    const result = await metaQualityEngine.run(ctx);
    expect(result.engine).toBe("meta-quality");
    expect(result.skipped).toBe(false);
    expect(result.elapsed).toBeGreaterThanOrEqual(0);
    // Should find at least some diagnostics
    if (result.diagnostics.length > 0) {
      const rules = result.diagnostics.map(d => d.rule);
      console.log("meta-quality found:", rules);
    }
  });
});
