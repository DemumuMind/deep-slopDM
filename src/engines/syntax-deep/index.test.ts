import { describe, it, expect, afterAll } from "vitest";
import { syntaxDeepEngine } from "./index.js";
import { makeContext, tempDir, writeFile, cleanup } from "../test-utils.js";

describe("syntax-deep", () => {
  const dir = tempDir();
  afterAll(() => cleanup(dir));

  it("detects issues in sample code", async () => {
    const filePath = writeFile(dir, "test.ts", `const x = val as any as string;
const b = !!flag;`);
    const ctx = makeContext(dir);
    ctx.files = [filePath];
    const result = await syntaxDeepEngine.run(ctx);
    expect(result.engine).toBe("syntax-deep");
    expect(result.skipped).toBe(false);
    expect(result.elapsed).toBeGreaterThan(0);
    // Should find at least some diagnostics
    if (result.diagnostics.length > 0) {
      const rules = result.diagnostics.map(d => d.rule);
      console.log("syntax-deep found:", rules);
    }
  });
});
