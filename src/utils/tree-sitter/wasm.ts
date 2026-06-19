// ── WASM / Core Parser Initialisation ───────────────────────

import type { Language as TSLanguage, Parser } from 'web-tree-sitter'

// Lazy singleton state (TypeScript / TSX)
export let parserInstance: Parser | null = null
export let tsLang: TSLanguage | null = null
export let tsxLang: TSLanguage | null = null
export let initPromise: Promise<boolean> | null = null
export let initDone = false
export let initOk = false

/**
 * Attempt to initialise web-tree-sitter with the TypeScript grammar.
 * Returns true on success; false on any failure (missing WASM, etc.).
 * Safe to call multiple times – only the first call does real work.
 */
export async function initParser(): Promise<boolean> {
  if (initDone) return initOk
  if (initPromise) return initPromise

  initPromise = (async () => {
    try {
      // Dynamic import so the module is never loaded when tree-sitter is not used.
      const wt = await import('web-tree-sitter')

      // Resolve the WASM path — web-tree-sitter .wasm lives alongside the JS
      const { dirname } = await import('node:path')
      const wasmDir = dirname(
        require.resolve('web-tree-sitter/tree-sitter.wasm'),
      )

      await wt.Parser.init({
        locateFile: (name: string) => `${wasmDir}/${name}`,
      })

      const parser = new wt.Parser()
      parserInstance = parser

      // Load TypeScript grammar
      const tsWasm = require.resolve(
        'tree-sitter-typescript/tree-sitter-typescript.wasm',
      )
      tsLang = await wt.Language.load(tsWasm)

      // Load TSX grammar
      const tsxWasm = require.resolve(
        'tree-sitter-typescript/tree-sitter-tsx.wasm',
      )
      tsxLang = await wt.Language.load(tsxWasm)

      initDone = true
      initOk = true
      return true
    } catch {
      initDone = true
      initOk = false
      return false
    }
  })()

  return initPromise
}

/** Check if tree-sitter is available and initialized */
export function isAvailable(): boolean {
  return initOk && parserInstance !== null
}
