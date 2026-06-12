import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/cli.ts", "src/mcp.ts", "src/index.ts"],
  format: "esm",
  dts: true,
  clean: true,
  shims: true,
});
