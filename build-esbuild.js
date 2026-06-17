#!/usr/bin/env node
// ── esbuild wrapper with proper shebang ────────────────
// Ensures #!/usr/bin/env node is preserved in output
// (esbuild --banner overwrites the shebang line)

import { build } from 'esbuild'

const SHEBANG = '#!/usr/bin/env node\n'
const CREATE_REQUIRE = 'import{createRequire}from"node:module";const require=createRequire(import.meta.url);\n'
const BANNER = { js: SHEBANG + CREATE_REQUIRE }

const EXTERNAL = [
  'web-tree-sitter',
  'tree-sitter-typescript',
  'tree-sitter-python',
  'tree-sitter-go',
  'tree-sitter-rust',
  'tree-sitter-php',
  'tree-sitter-c-sharp',
  'tree-sitter-swift',
]

async function main() {
  await build({
    entryPoints: ['src/cli-bundle-entry.ts'],
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile: 'dist/deep-slop-bundled.js',
    external: EXTERNAL,
    banner: BANNER,
  })

  await build({
    entryPoints: ['src/mcp/index.ts'],
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile: 'dist/mcp.js',
    external: EXTERNAL,
    banner: BANNER,
  })

  await build({
    entryPoints: ['src/lsp/index.ts'],
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile: 'dist/lsp.js',
    external: EXTERNAL,
    banner: BANNER,
  })

  console.log('✓ esbuild done (shebang preserved)')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
