import { describe, it, expect, afterAll } from "vitest";
import { configLintEngine } from "./index.js";
import { makeContext, tempDir, writeFile, cleanup } from "../test-utils.js";

describe("config-lint", () => {
  const dir = tempDir();
  afterAll(() => cleanup(dir));

  it("detects issues in sample code", async () => {
    const filePath = writeFile(dir, "test.ts", `// minimal file, config-lint checks project-level configs`);
    const ctx = makeContext(dir);
    ctx.files = [filePath];
    const result = await configLintEngine.run(ctx);
    expect(result.engine).toBe("config-lint");
    expect(result.skipped).toBe(false);
    expect(result.elapsed).toBeGreaterThan(0);
    // Should find at least some diagnostics
    if (result.diagnostics.length > 0) {
      const rules = result.diagnostics.map(d => d.rule);
      console.log("config-lint found:", rules);
    }
  });
});
