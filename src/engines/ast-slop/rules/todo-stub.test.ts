import { describe, it, expect } from "vitest";
import { detectTodoStub } from "./todo-stub.js";

const lines = [
  { num: 1, text: "// TODO: implement this later" },
  { num: 2, text: "function stub() { return null; }" },
];

describe("todo-stub", () => {
  it("detects a TODO comment in a normal file", () => {
    const diagnostics = detectTodoStub(lines, "src/utils/helper.ts", "typescript");
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].rule).toBe("ast-slop/todo-stub");
  });

  it("skips rule definition files with todo or placeholder in the name", () => {
    const files = [
      "src/engines/ast-slop/rules/todo-stub.ts",
      "src/engines/ast-slop/rules/todo-leftover.ts",
      "src/engines/ast-slop/rules/placeholder-impl.ts",
      "src/engines/markup-lint/rules/md-todo-in-docs.ts",
    ];
    for (const filePath of files) {
      const diagnostics = detectTodoStub(lines, filePath, "typescript");
      expect(diagnostics).toHaveLength(0);
    }
  });

  it("skips .deep-slop/plugins files", () => {
    const diagnostics = detectTodoStub(lines, ".deep-slop/plugins/example-plugin.mjs", "javascript");
    expect(diagnostics).toHaveLength(0);
  });

  it("skips pattern documentation", () => {
    const diagnostics = detectTodoStub(lines, "src/utils/pattern-docs.ts", "typescript");
    expect(diagnostics).toHaveLength(0);
  });
});
