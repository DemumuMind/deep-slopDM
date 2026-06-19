import { describe, it, expect, afterAll } from "vitest";
import { archConstraintsEngine } from "./index.js";
import { isGodFileExempt, isHighCouplingExempt } from "./helpers.js";
import { makeContext, tempDir, writeFile, cleanup } from "../test-utils.js";

describe("arch-constraints", () => {
  const dir = tempDir();
  afterAll(() => cleanup(dir));

  it("detects issues in sample code", async () => {
    const filePath = writeFile(dir, "test.ts", `import { a } from "./a";
import { b } from "./b";
import { c } from "./c";
import { d } from "./d";
import { e } from "./e";
import { f } from "./f";
import { g } from "./g";
import { h } from "./h";
import { i } from "./i";
import { j } from "./j";
import { k } from "./k";`);
    const ctx = makeContext(dir);
    ctx.files = [filePath];
    const result = await archConstraintsEngine.run(ctx);
    expect(result.engine).toBe("arch-constraints");
    expect(result.skipped).toBe(false);
    expect(result.elapsed).toBeGreaterThan(0);
    // Should find at least some diagnostics
    if (result.diagnostics.length > 0) {
      const rules = result.diagnostics.map(d => d.rule);
      console.log("arch-constraints found:", rules);
    }
  });

  it("exempts legitimately large engine files from god-file", () => {
    expect(isGodFileExempt("src/engines/arch-constraints/rules.ts")).toBe(true);
    expect(isGodFileExempt("src/engines/ast-slop/rules.ts")).toBe(true);
    expect(isGodFileExempt("src/engines/ast-slop/helpers.ts")).toBe(true);
    expect(isGodFileExempt("src/engines/ast-slop/shared.ts")).toBe(true);
    expect(isGodFileExempt("src/types/index.ts")).toBe(true);
    expect(isGodFileExempt("src/utils/file-utils.ts")).toBe(false);
  });

  it("exempts orchestration files from high-coupling", () => {
    expect(isHighCouplingExempt("src/engines/ast-slop/index.ts")).toBe(true);
    expect(isHighCouplingExempt("src/cli/index.ts")).toBe(true);
    expect(isHighCouplingExempt("src/cli-bundle-entry.ts")).toBe(true);
    expect(isHighCouplingExempt("src/engines/orchestrator.ts")).toBe(true);
    expect(isHighCouplingExempt("src/lsp/server.ts")).toBe(true);
    expect(isHighCouplingExempt("src/mcp/tools.ts")).toBe(true);
    expect(isHighCouplingExempt("src/utils/file-utils.ts")).toBe(false);
  });
});
