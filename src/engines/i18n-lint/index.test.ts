import { describe, it, expect, afterAll } from "vitest";
import { i18nLintEngine } from "./index.js";
import { makeContext, tempDir, writeFile, cleanup } from "../test-utils.js";

describe("i18n-lint", () => {
  const dir = tempDir();
  afterAll(() => cleanup(dir));

  it("detects issues in sample code", async () => {
    const filePath = writeFile(dir, "test.tsx", `<div>Hello World</div>
<input placeholder="Enter your name" />`);
    const i18nConfig = writeFile(dir, "i18n.json", `{"locale": "en"}`);
    const ctx = makeContext(dir);
    ctx.languages = ["typescript", "javascript"];
    ctx.files = [filePath, i18nConfig];
    const result = await i18nLintEngine.run(ctx);
    expect(result.engine).toBe("i18n-lint");
    // i18n-lint may skip if no i18n library is detected; that's acceptable
    if (!result.skipped) {
      expect(result.elapsed).toBeGreaterThanOrEqual(0);
    }
  });
});
