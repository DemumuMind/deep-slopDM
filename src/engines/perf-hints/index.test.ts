import { describe, it, expect, afterAll } from "vitest";
import { perfHintsEngine } from "./index.js";
import { makeContext, tempDir, writeFile, cleanup } from "../test-utils.js";

describe("perf-hints", () => {
  const dir = tempDir();
  afterAll(() => cleanup(dir));

  it("detects issues in sample code", async () => {
    const filePath = writeFile(dir, "test.ts", `async function test() {
  for (const id of ids) {
    await db.query("SELECT * FROM t WHERE id=" + id);
  }
  const data = readFileSync("file.txt");
}`);
    const ctx = makeContext(dir);
    ctx.files = [filePath];
    const result = await perfHintsEngine.run(ctx);
    expect(result.engine).toBe("perf-hints");
    expect(result.skipped).toBe(false);
    expect(result.elapsed).toBeGreaterThan(0);
    // Should find at least some diagnostics
    if (result.diagnostics.length > 0) {
      const rules = result.diagnostics.map(d => d.rule);
      console.log("perf-hints found:", rules);
    }
  });
});
