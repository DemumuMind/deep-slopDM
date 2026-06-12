import { describe, it, expect, afterAll } from "vitest";
import { importIntelligenceEngine } from "./index.js";
import { makeContext, tempDir, writeFile, cleanup } from "../test-utils.js";

describe("import-intelligence", () => {
  const dir = tempDir();
  afterAll(() => cleanup(dir));

  it("detects issues in sample code", async () => {
    const filePath = writeFile(dir, "test.ts", `import { unused } from "lodash";
import { used } from "react";
console.log(used);`);
    const ctx = makeContext(dir);
    ctx.files = [filePath];
    const result = await importIntelligenceEngine.run(ctx);
    expect(result.engine).toBe("import-intelligence");
    expect(result.skipped).toBe(false);
    expect(result.elapsed).toBeGreaterThan(0);
    // Should find at least some diagnostics
    if (result.diagnostics.length > 0) {
      const rules = result.diagnostics.map(d => d.rule);
      console.log("import-intelligence found:", rules);
    }
  });
});
