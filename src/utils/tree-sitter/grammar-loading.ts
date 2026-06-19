// ── Grammar Loading (per-language) ────────────────────

import type { Language as TSLanguage } from 'web-tree-sitter'
import { initParser, initOk } from './wasm.js'

// ── Python grammar state ─────────────────────────
let pyLang: TSLanguage | null = null
let pyInitDone = false
let pyInitOk = false

// ── Go grammar state ───────────────────────────
let goLang: TSLanguage | null = null
let goInitDone = false
let goInitOk = false

// ── Rust grammar state ─────────────────────────
let rustLang: TSLanguage | null = null
let rustInitDone = false
let rustInitOk = false

// ── PHP grammar state ──────────────────────────
let phpLang: TSLanguage | null = null
let phpInitDone = false
let phpInitOk = false

// ── C# grammar state ─────────────────────────
let csharpLang: TSLanguage | null = null
let csharpInitDone = false
let csharpInitOk = false

// ── Swift grammar state ────────────────────────
let swiftLang: TSLanguage | null = null
let swiftInitDone = false
let swiftInitOk = false

/**
 * Attempt to load the Python grammar for tree-sitter.
 * Returns true on success. Graceful fallback: returns false if
 * tree-sitter-python is not installed.
 */
export async function initPythonParser(): Promise<boolean> {
  if (pyInitDone) return pyInitOk
  if (!initOk) {
    const baseOk = await initParser()
    if (!baseOk) {
      pyInitDone = true
      pyInitOk = false
      return false
    }
  }

  try {
    const pyWasm = require.resolve(
      'tree-sitter-python/python.wasm',
    )
    const wt = await import('web-tree-sitter')
    pyLang = await wt.Language.load(pyWasm)
    pyInitDone = true
    pyInitOk = true
    return true
  } catch {
    pyInitDone = true
    pyInitOk = false
    return false
  }
}

/**
 * Attempt to load the Go grammar for tree-sitter.
 * Returns true on success. Graceful fallback: returns false if
 * tree-sitter-go is not installed.
 */
export async function initGoParser(): Promise<boolean> {
  if (goInitDone) return goInitOk
  if (!initOk) {
    const baseOk = await initParser()
    if (!baseOk) {
      goInitDone = true
      goInitOk = false
      return false
    }
  }

  try {
    const goWasm = require.resolve(
      'tree-sitter-go/tree-sitter-go.wasm',
    )
    const wt = await import('web-tree-sitter')
    goLang = await wt.Language.load(goWasm)
    goInitDone = true
    goInitOk = true
    return true
  } catch {
    goInitDone = true
    goInitOk = false
    return false
  }
}

/**
 * Attempt to load the Rust grammar for tree-sitter.
 * Returns true on success. Graceful fallback: returns false if
 * tree-sitter-rust is not installed.
 */
export async function initRustParser(): Promise<boolean> {
  if (rustInitDone) return rustInitOk
  if (!initOk) {
    const baseOk = await initParser()
    if (!baseOk) {
      rustInitDone = true
      rustInitOk = false
      return false
    }
  }

  try {
    const rustWasm = require.resolve(
      'tree-sitter-rust/tree-sitter-rust.wasm',
    )
    const wt = await import('web-tree-sitter')
    rustLang = await wt.Language.load(rustWasm)
    rustInitDone = true
    rustInitOk = true
    return true
  } catch {
    rustInitDone = true
    rustInitOk = false
    return false
  }
}

/**
 * Attempt to load the PHP grammar for tree-sitter.
 * Returns true on success. Graceful fallback: returns false if
 * tree-sitter-php is not installed.
 */
export async function initPhpParser(): Promise<boolean> {
  if (phpInitDone) return phpInitOk
  if (!initOk) {
    const baseOk = await initParser()
    if (!baseOk) {
      phpInitDone = true
      phpInitOk = false
      return false
    }
  }

  try {
    const phpWasm = require.resolve(
      'tree-sitter-php/php.wasm',
    )
    const wt = await import('web-tree-sitter')
    phpLang = await wt.Language.load(phpWasm)
    phpInitDone = true
    phpInitOk = true
    return true
  } catch {
    phpInitDone = true
    phpInitOk = false
    return false
  }
}

/**
 * Attempt to load the C# grammar for tree-sitter.
 * Returns true on success. Graceful fallback: returns false if
 * tree-sitter-c-sharp is not installed.
 */
export async function initCsharpParser(): Promise<boolean> {
  if (csharpInitDone) return csharpInitOk
  if (!initOk) {
    const baseOk = await initParser()
    if (!baseOk) {
      csharpInitDone = true
      csharpInitOk = false
      return false
    }
  }

  try {
    const csharpWasm = require.resolve(
      'tree-sitter-c-sharp/c_sharp.wasm',
    )
    const wt = await import('web-tree-sitter')
    csharpLang = await wt.Language.load(csharpWasm)
    csharpInitDone = true
    csharpInitOk = true
    return true
  } catch {
    csharpInitDone = true
    csharpInitOk = false
    return false
  }
}

/**
 * Attempt to load the Swift grammar for tree-sitter.
 * Returns true on success. Graceful fallback: returns false if
 * tree-sitter-swift is not installed.
 */
export async function initSwiftParser(): Promise<boolean> {
  if (swiftInitDone) return swiftInitOk
  if (!initOk) {
    const baseOk = await initParser()
    if (!baseOk) {
      swiftInitDone = true
      swiftInitOk = false
      return false
    }
  }

  try {
    const swiftWasm = require.resolve(
      'tree-sitter-swift/swift.wasm',
    )
    const wt = await import('web-tree-sitter')
    swiftLang = await wt.Language.load(swiftWasm)
    swiftInitDone = true
    swiftInitOk = true
    return true
  } catch {
    swiftInitDone = true
    swiftInitOk = false
    return false
  }
}

/** Check if Python tree-sitter grammar is available */
export function isPythonAvailable(): boolean {
  return pyInitOk && pyLang !== null
}

export {
  pyLang,
  goLang,
  rustLang,
  phpLang,
  csharpLang,
  swiftLang,
}
