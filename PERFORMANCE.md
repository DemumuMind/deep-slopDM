# Performance Notes

This document tracks scan-time performance optimizations for `deep-slop`.

## Optimizations Implemented

### 1. Shared file reads (file-cache)

`src/utils/file-cache.ts` now:

- Reads each file **once** and caches both content and pre-split lines.
- Uses `stat` mtime to invalidate stale cache entries between scan runs.
- Provides `toLinesCached(filePath)` so engines can share the same line map.

Impact: eliminates the duplicate `readFile` calls that existed in the previous implementation.

### 2. Shared AST cache

`src/utils/tree-sitter.ts` now passes the source `filePath` to every language-specific parser (`parseFile`, `parsePython`, `parseAnyFile`, etc.), so parsed ASTs are cached by path and reused across engines.

`ast-slop` and `import-intelligence` now call `parseFile(..., filePath)` to reuse cached trees.

### 3. Batch file processor

`src/utils/batch-processor.ts` is a per-scan shared cache that gives engines pre-processed `{ content, lines }` data. The orchestrator clears it at the start of each run.

Engines migrated to the batch processor:

- `ast-slop`
- `i18n-lint`
- `perf-hints`

This removes redundant `content.split('\n')` calls for the same files.

### 4. Lazy line extraction

`file-cache.ts` now stores a line map alongside file content. `readFileCached` and `toLinesCached` return the cached line map without re-splitting.

### 5. Early-exit heuristics

`i18n-lint` now short-circuits when:

- No locale files (`locales/`, `i18n/`, `messages/`, `public/locales`, etc.) are found, **and**
- No i18n library usage (`useTranslation`, `t('...')`, `react-i18next`, etc.) is detected in a sample of source files.

This avoids walking the entire project for non-i18n codebases.

## Benchmarks

Run with the bundled CLI on the `deep-slop` repo itself:

```bash
export PATH='/.sprite/languages/node/nvm/versions/node/v22.20.0/bin:/usr/bin:$PATH'
cd /home/sprite/deep-slop
time pnpm scan
```

| Version | Real time | Notes |
|--------:|----------:|-------|
| Baseline | ~10.7s | Before batch processor, AST cache fix, and i18n early exit |
| Optimized | *to be measured* | After the changes above |

> The target is **< 15s**. The baseline was already close, so the optimizations are focused on reducing redundant work rather than raw wall-time alone.

## Future Ideas

- Migrate the remaining file-walking engines (`dead-flow`, `syntax-deep`, `security-deep`, `format-lint`, `markup-lint`, `dup-detect`, `import-intelligence`, `arch-constraints`) to the batch processor.
- Add more project-type early-exit checks (e.g., framework-lint for non-React projects, config-lint for non-JS projects).
- Cache `extractImports` results per file.
- Limit concurrent file reads / AST parses to avoid CPU thrashing on large monorepos.
