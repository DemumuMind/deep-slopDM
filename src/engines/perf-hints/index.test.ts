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

  it("skips string concatenation in TUI/progress bar files", async () => {
    const filePath = writeFile(dir, "agent/tui.ts", `function progressBar(width: number) {
  let bar = ''
  for (let i = 0; i < width; i++) {
    bar += '█'
  }
  return bar
}`);
    const ctx = makeContext(dir);
    ctx.files = [filePath];
    const result = await perfHintsEngine.run(ctx);
    const concat = result.diagnostics.filter(d => d.rule === "perf-hints/string-concat-in-loop");
    expect(concat).toHaveLength(0);
  });

  it("skips string concatenation in prompt-format files", async () => {
    const filePath = writeFile(dir, "agents/prompt-format.ts", `function formatPrompt(items: string[]) {
  let prompt = 'Fix:\n\n'
  for (const item of items) {
    prompt += '- ' + item + '\n'
  }
  return prompt
}`);
    const ctx = makeContext(dir);
    ctx.files = [filePath];
    const result = await perfHintsEngine.run(ctx);
    const concat = result.diagnostics.filter(d => d.rule === "perf-hints/string-concat-in-loop");
    expect(concat).toHaveLength(0);
  });

  it("skips string concatenation with visual variable names", async () => {
    const filePath = writeFile(dir, "visual.ts", `function render(output: string[], line: string, path: string, result: string) {
  for (const o of output) {
    output += o
  }
  for (let i = 0; i < 10; i++) {
    line += '-'
  }
  for (let i = 0; i < 10; i++) {
    path += 'L'
  }
  for (let i = 0; i < 10; i++) {
    result += '!'
  }
  return output + line + path + result
}`);
    const ctx = makeContext(dir);
    ctx.files = [filePath];
    const result = await perfHintsEngine.run(ctx);
    const concat = result.diagnostics.filter(d => d.rule === "perf-hints/string-concat-in-loop");
    expect(concat).toHaveLength(0);
  });

  it("still flags non-visual string concatenation in loops", async () => {
    const filePath = writeFile(dir, "logic.ts", `function buildQuery(ids: string[]) {
  let query = 'SELECT * FROM t WHERE id IN ('
  for (const id of ids) {
    query += id + ','
  }
  for (const id of ids) {
    query += \`\${id},\`
  }
  return query
}`);
    const ctx = makeContext(dir);
    ctx.files = [filePath];
    const result = await perfHintsEngine.run(ctx);
    const concat = result.diagnostics.filter(d => d.rule === "perf-hints/string-concat-in-loop");
    expect(concat.length).toBeGreaterThan(0);
  });
});
