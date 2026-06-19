import { describe, it, expect } from "vitest";
import { detectHardcodedConfig } from "./hardcoded-config.js";

function scanLine(text: string, filePath = "src/app.ts") {
  return detectHardcodedConfig([{ num: 1, text }], filePath, "typescript");
}

describe("hardcoded-config URL exclusions", () => {
  it("flags a generic hardcoded URL", () => {
    const diags = scanLine('const api = "https://api.myservice.com/v1"');
    expect(diags.length).toBe(1);
    expect(diags[0].rule).toBe("ast-slop/hardcoded-config");
  });

  it("skips the project’s own GitHub repo URL", () => {
    const diags = scanLine('const repo = "https://github.com/DemumuMind/deep-slopDM/issues"');
    expect(diags).toHaveLength(0);
  });

  it("skips npm registry URLs", () => {
    const diags = scanLine('const latest = "https://registry.npmjs.org/deep-slop/latest"');
    expect(diags).toHaveLength(0);
  });

  it("skips shields.io badge URLs", () => {
    const diags = scanLine('const badge = "https://img.shields.io/badge/quality-100-green"');
    expect(diags).toHaveLength(0);
  });

  it("skips raw.githubusercontent.com URLs", () => {
    const diags = scanLine('const schema = "https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json"');
    expect(diags).toHaveLength(0);
  });

  it("skips SARIF schema URLs", () => {
    const diags = scanLine('const schema = "https://docs.oasis-open.org/sarif/sarif/v2.1.0/sarif-v2.1.0.json"');
    expect(diags).toHaveLength(0);
  });

  it("skips GitHub template URLs", () => {
    const diags = scanLine('const pageUrl = `https://github.com/${owner}/${repo}`');
    expect(diags).toHaveLength(0);
  });
});
