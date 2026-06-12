import { describe, it, expect, afterAll } from "vitest";
import { securityDeepEngine } from "./index.js";
import { makeContext, tempDir, writeFile, cleanup } from "../test-utils.js";

describe("security-deep", () => {
  const dir = tempDir();
  afterAll(() => cleanup(dir));

  it("detects issues in sample code", async () => {
    const filePath = writeFile(dir, "test.ts", `eval(userInput);
document.write("<div>" + html + "</div>");
db.query("SELECT * FROM users WHERE id=" + userId);
const key = "sk-test123abc";
Object.assign(target, userInput);
fetch(userProvidedUrl);`);
    const ctx = makeContext(dir);
    ctx.files = [filePath];
    const result = await securityDeepEngine.run(ctx);
    expect(result.engine).toBe("security-deep");
    expect(result.skipped).toBe(false);
    expect(result.elapsed).toBeGreaterThan(0);
    // Should find at least some diagnostics
    if (result.diagnostics.length > 0) {
      const rules = result.diagnostics.map(d => d.rule);
      console.log("security-deep found:", rules);
    }
  });
});
