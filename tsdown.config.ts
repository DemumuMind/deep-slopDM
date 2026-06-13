import { defineConfig } from "tsdown";

// Only index.ts needs dts for library consumers
// CLI and MCP are self-contained — built by esbuild in the build script
export default defineConfig({
  entry: ["src/index.ts"],
  format: "esm",
  dts: true,
  clean: true,
  fixedExtension: false,
  outExtensions: () => ({ js: ".js" }),
});
