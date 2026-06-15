// ── Tree-sitter AST Parsing Utility ──────────────────────
// Lazy-loads web-tree-sitter + TypeScript, Python, Go, Rust,
// PHP, C#, and Swift grammars.
// All exports return null on failure so the engine can fall back to regex.

export * from './types.js'
export * from './wasm.js'
export * from './grammar-loading.js'
export * from './language-detection.js'
export * from './query-execution.js'
export * from './node-utils.js'
export * from './python-utils.js'
