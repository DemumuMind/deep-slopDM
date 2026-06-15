import { describe, it, expect, afterAll } from "vitest";
import { rustDeepEngine } from "./index.js";
import { makeContext, tempDir, writeFile, cleanup } from "../test-utils.js";

describe("rust-deep", () => {
  const dir = tempDir();
  afterAll(() => cleanup(dir));

  it("detects unwrap, todo, unimplemented, expect and unsafe issues", async () => {
    const filePath = writeFile(
      dir,
      "main.rs",
      `fn main() {
    let x: Option<i32> = Some(1);
    let _ = x.unwrap();
    let _ = x.expect("missing value");
    todo!();
    unimplemented!();
    unsafe {
        let _ = 1 + 1;
    }
    let y = 42;
    let _ = y.clone();
    let _ = 42.clone();
    match x {
        Some(v) => v,
        _ => 0,
    };
}`,
    );
    const ctx = makeContext(dir);
    ctx.languages = ["rust"];
    ctx.files = [filePath];
    const result = await rustDeepEngine.run(ctx);
    expect(result.engine).toBe("rust-deep");
    expect(result.skipped).toBe(false);
    const rules = result.diagnostics.map((d) => d.rule);
    expect(rules).toContain("rust-deep/unwrap-in-prod");
    expect(rules).toContain("rust-deep/expect-in-prod");
    expect(rules).toContain("rust-deep/todo-macro");
    expect(rules).toContain("rust-deep/unimplemented-macro");
    expect(rules).toContain("rust-deep/unsafe-usage");
    expect(rules).toContain("rust-deep/clone-on-copy");
    expect(rules).toContain("rust-deep/wildcard-catch");
  });

  it("detects large enum variants", async () => {
    const filePath = writeFile(
      dir,
      "enums.rs",
      `enum Message {
    Ping,
    Pong,
    Data(Vec<u8>),
}`,
    );
    const ctx = makeContext(dir);
    ctx.languages = ["rust"];
    ctx.files = [filePath];
    const result = await rustDeepEngine.run(ctx);
    const rules = result.diagnostics.map((d) => d.rule);
    expect(rules).toContain("rust-deep/large-enum-variant");
  });

  it("detects redundant clone on a dropped value", async () => {
    const filePath = writeFile(
      dir,
      "clone.rs",
      `fn main() {
    let s = String::from("hello");
    let _ = s.clone();
}`,
    );
    const ctx = makeContext(dir);
    ctx.languages = ["rust"];
    ctx.files = [filePath];
    const result = await rustDeepEngine.run(ctx);
    const rules = result.diagnostics.map((d) => d.rule);
    expect(rules).toContain("rust-deep/redundant-clone");
  });

  it("skips test files for unwrap/expect", async () => {
    const filePath = writeFile(
      dir,
      "foo_test.rs",
      `fn test() {
    let x: Option<i32> = Some(1);
    let _ = x.unwrap();
    let _ = x.expect("ok");
}`,
    );
    const ctx = makeContext(dir);
    ctx.languages = ["rust"];
    ctx.files = [filePath];
    const result = await rustDeepEngine.run(ctx);
    const rules = result.diagnostics.map((d) => d.rule);
    expect(rules).not.toContain("rust-deep/unwrap-in-prod");
    expect(rules).not.toContain("rust-deep/expect-in-prod");
  });
});
