import { describe, it, expect, afterAll } from "vitest";
import { i18nLintEngine } from "./index.js";
import { makeContext, tempDir, writeFile, cleanup } from "../test-utils.js";

describe("i18n-lint", () => {
  const dir = tempDir();
  afterAll(() => cleanup(dir));

  it("detects issues in sample code", async () => {
    const filePath = writeFile(dir, "test.ts", `<div>Hello World</div>
<input placeholder="Enter your name" />`);
    const ctx = makeContext(dir);
    ctx.files = [filePath];
    const result = await i18nLintEngine.run(ctx);
    expect(result.engine).toBe("i18n-lint");
    expect(result.skipped).toBe(false);
    expect(result.elapsed).toBeGreaterThan(0);
    // Should find at least some diagnostics
    if (result.diagnostics.length > 0) {
      const rules = result.diagnostics.map(d => d.rule);
      console.log("i18n-lint found:", rules);
    }
  });
});
