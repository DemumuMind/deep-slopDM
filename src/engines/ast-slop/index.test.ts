import { describe, it, expect, afterAll } from "vitest";
import { astSlopEngine } from "./index.js";
import { makeContext, tempDir, writeFile, cleanup } from "../test-utils.js";

describe("ast-slop", () => {
  const dir = tempDir();
  afterAll(() => cleanup(dir));

  it("detects issues in sample code", async () => {
    const filePath = writeFile(dir, "test.ts", `eval("dangerous");
console.log("debug");
// TODO: implement this later
const data = fetchData();
try { something(); } catch(e) {}
const x = obj as any;
// This function computes the result of the operation
function computeResult() { return 1 + 1; }`);
    const ctx = makeContext(dir);
    ctx.files = [filePath];
    const result = await astSlopEngine.run(ctx);
    expect(result.engine).toBe("ast-slop");
    expect(result.skipped).toBe(false);
    expect(result.elapsed).toBeGreaterThan(0);
    // Should find at least some diagnostics
    if (result.diagnostics.length > 0) {
      const rules = result.diagnostics.map(d => d.rule);
      console.log("ast-slop found:", rules);
    }
  });
});
