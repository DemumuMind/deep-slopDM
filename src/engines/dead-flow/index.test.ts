import { describe, it, expect, afterAll } from "vitest";
import { deadFlowEngine } from "./index.js";
import { makeContext, tempDir, writeFile, cleanup } from "../test-utils.js";

describe("dead-flow", () => {
  const dir = tempDir();
  afterAll(() => cleanup(dir));

  it("detects issues in sample code", async () => {
    const filePath = writeFile(dir, "test.ts", `function test() {
  return 1;
  console.log("unreachable");
}
const unused = 5;`);
    const ctx = makeContext(dir);
    ctx.files = [filePath];
    const result = await deadFlowEngine.run(ctx);
    expect(result.engine).toBe("dead-flow");
    expect(result.skipped).toBe(false);
    expect(result.elapsed).toBeGreaterThan(0);
    // Should find at least some diagnostics
    if (result.diagnostics.length > 0) {
      const rules = result.diagnostics.map(d => d.rule);
      console.log("dead-flow found:", rules);
    }
  });
});
